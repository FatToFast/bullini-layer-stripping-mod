import type {
  CachedStageResults,
  InsightRunResult,
  InsightStageName,
  PipelineModelSettings,
  StageRecord,
  EvaluationResult,
  StageEvaluationResult,
} from "./types";

export type StreamCallbacks = {
  onStageStart?: (stage: InsightStageName) => void;
  onStageComplete?: (record: StageRecord) => void;
  onSearchStart?: (round: 1 | 2, queries: string[]) => void;
  onSearchComplete?: (round: 1 | 2, results: unknown[], error?: string) => void;
  onComplete?: (result: InsightRunResult) => void;
  onError?: (message: string) => void;
};

export async function runInsightApiStream(
  rawJson: string,
  modelSettings?: PipelineModelSettings,
  callbacks?: StreamCallbacks,
  searchProvider?: string,
  targetStage?: InsightStageName,
  cachedResults?: CachedStageResults,
  systemPrompt?: string
): Promise<InsightRunResult> {
  const response = await fetch("/api/insight/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawJson, modelSettings, searchProvider, targetStage, cachedResults, systemPrompt: systemPrompt || undefined }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error ?? `API request failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: InsightRunResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      try {
        const event = JSON.parse(jsonStr) as Record<string, unknown>;
        const eventType = event.type as string;

        switch (eventType) {
          case "stage_start":
            callbacks?.onStageStart?.(event.stage as InsightStageName);
            break;
          case "stage_complete":
            callbacks?.onStageComplete?.(event.record as StageRecord);
            break;
          case "search_start":
            callbacks?.onSearchStart?.(event.round as 1 | 2, event.queries as string[]);
            break;
          case "search_complete":
            callbacks?.onSearchComplete?.(
              event.round as 1 | 2,
              (event.results as unknown[]) ?? [],
              event.error as string | undefined
            );
            break;
          case "pipeline_complete":
            finalResult = event.result as InsightRunResult;
            callbacks?.onComplete?.(finalResult);
            break;
          case "error":
            callbacks?.onError?.((event.message as string) ?? "Unknown error");
            throw new Error((event.message as string) ?? "Pipeline failed");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("Pipeline failed")) throw e;
      }
    }
  }

  if (!finalResult) throw new Error("Pipeline did not complete");
  return finalResult;
}

export type ExtractModelSettings = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type FetchTextResult = {
  text: string;
  charCount: number;
  truncated: boolean;
  originalCharCount: number;
};

export async function fetchArticleText(
  url: string
): Promise<FetchTextResult | { error: string }> {
  try {
    const response = await fetch("/api/insight/fetch-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const payload = (await response.json().catch(() => null)) as
      | (FetchTextResult & { error?: string })
      | { error: string }
      | null;

    if (!response.ok) {
      return { error: (payload as { error?: string })?.error ?? `Fetch failed: ${response.status}` };
    }

    if (payload && "text" in payload) {
      return payload as FetchTextResult;
    }

    return { error: "Invalid response payload" };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function evaluateOutput(
  actualOutput: string,
  expectedCriteria: string,
  modelSettings?: ExtractModelSettings
): Promise<EvaluationResult | { error: string }> {
  try {
    const response = await fetch("/api/insight/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actualOutput, expectedCriteria, modelSettings }),
    });

    const payload = (await response.json().catch(() => null)) as
      | (EvaluationResult & { error?: string })
      | { error: string }
      | null;

    if (!response.ok) {
      return { error: (payload as { error?: string })?.error ?? `Evaluation failed: ${response.status}` };
    }

    if (payload && "score" in payload && "breakdown" in payload) {
      return payload as EvaluationResult;
    }

    return { error: "Invalid evaluation response" };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function evaluateStage(
  stagePrompt: string,
  stageOutput: string,
  modelSettings?: ExtractModelSettings,
): Promise<StageEvaluationResult | { error: string }> {
  try {
    const response = await fetch("/api/insight/evaluate-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stagePrompt, stageOutput, modelSettings }),
    });

    const payload = (await response.json().catch(() => null)) as
      | (StageEvaluationResult & { error?: string })
      | { error: string }
      | null;

    if (!response.ok) {
      return { error: (payload as { error?: string })?.error ?? `Stage evaluation failed: ${response.status}` };
    }

    if (payload && "overall_score" in payload && "checklist" in payload) {
      return payload as StageEvaluationResult;
    }

    return { error: "Invalid stage evaluation response" };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function structureWithLlm(
  text: string,
  analysisPrompt?: string,
  portfolio?: Array<{ company: string; ticker?: string; held: "held" | "watchlist" }>,
  modelSettings?: ExtractModelSettings
): Promise<{ dataset: unknown } | { error: string }> {
  try {
    const response = await fetch("/api/insight/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, analysisPrompt, portfolio, modelSettings }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { dataset?: unknown; error?: string }
      | null;

    if (!response.ok) {
      return { error: payload?.error ?? `API request failed: ${response.status}` };
    }

    if (payload?.dataset !== undefined) {
      return { dataset: payload.dataset };
    }

    return { error: "Invalid response payload" };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
