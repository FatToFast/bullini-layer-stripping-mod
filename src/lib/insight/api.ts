import type {
  CachedStageResults,
  FinalOutput,
  InsightRunResult,
  InsightStageName,
  LeanStageRecord,
  PipelineModelSettings,
  RunSnapshot,
  SearchRoundConfig,
  StageRecord,
  EvaluationResult,
  StageEvaluationResult,
} from "./types";

export type StreamCallbacks = {
  onStageStart?: (stage: InsightStageName) => void;
  onStageComplete?: (record: LeanStageRecord) => void;
  onSearchStart?: (round: 1 | 2, queries: string[]) => void;
  onSearchComplete?: (round: 1 | 2, results: unknown[], error?: string) => void;
  onComplete?: (result: InsightRunResult) => void;
  onError?: (message: string) => void;
};

export type SearchConfigs = {
  searchR1Config?: SearchRoundConfig;
  searchR2Config?: SearchRoundConfig;
};

/**
 * Run insight pipeline via SSE stream.
 *
 * Accepts an optional `AbortSignal` so callers can cancel the fetch (and the
 * underlying ReadableStream reader) when the component unmounts or the user
 * triggers a new run.  This prevents the reader from leaking in background.
 */
export async function runInsightApiStream(
  rawJson: string,
  modelSettings?: PipelineModelSettings,
  callbacks?: StreamCallbacks,
  searchProvider?: string,
  targetStage?: InsightStageName,
  cachedResults?: CachedStageResults,
  systemPrompt?: string,
  searchConfigs?: SearchConfigs,
  signal?: AbortSignal,
): Promise<InsightRunResult> {
  const response = await fetch("/api/insight/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawJson,
      modelSettings,
      searchProvider,
      targetStage,
      cachedResults,
      systemPrompt: systemPrompt || undefined,
      searchR1Config: searchConfigs?.searchR1Config,
      searchR2Config: searchConfigs?.searchR2Config,
    }),
    signal,
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
  const collectedStages: LeanStageRecord[] = [];

  try {
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
            case "stage_complete": {
              const record = event.record as LeanStageRecord;
              collectedStages.push(record);
              callbacks?.onStageComplete?.(record);
              break;
            }
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
              finalResult = {
                runId: event.runId as string,
                stages: collectedStages,
                finalOutput: (event.finalOutput as FinalOutput) ?? null,
              };
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
  } finally {
    reader.releaseLock();
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

export type RunSummary = {
  id: string;
  timestamp: string;
  newsUrl: string;
  searchProvider: string;
  defaultModel: string;
  stageCount: number;
  hasEvaluations: boolean;
  filename: string;
};

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

async function postApi<T>(
  url: string,
  body: unknown,
  validate: (p: Record<string, unknown>) => boolean,
  label: string,
  signal?: AbortSignal,
): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      signal,
    });
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) return { error: (payload?.error as string) ?? `${label} failed: ${res.status}` };
    if (payload && validate(payload)) return payload as T;
    return { error: `Invalid ${label} response` };
  } catch (err) {
    return { error: `Network error: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}

async function getApi<T>(
  url: string,
  label: string,
  signal?: AbortSignal,
): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, { signal });
    const payload = await res.json().catch(() => null);
    if (!res.ok) return { error: (payload as Record<string, unknown>)?.error as string ?? `${label} failed: ${res.status}` };
    return payload as T;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error" };
  }
}

export function fetchArticleText(
  url: string,
  signal?: AbortSignal,
): Promise<FetchTextResult | { error: string }> {
  return postApi<FetchTextResult>(
    "/api/insight/fetch-text", { url },
    (p) => "text" in p, "Fetch", signal,
  );
}

export function evaluateOutput(
  actualOutput: string,
  expectedCriteria: string,
  modelSettings?: ExtractModelSettings,
  signal?: AbortSignal,
): Promise<EvaluationResult | { error: string }> {
  return postApi<EvaluationResult>(
    "/api/insight/evaluate", { actualOutput, expectedCriteria, modelSettings },
    (p) => "score" in p && "breakdown" in p, "Evaluation", signal,
  );
}

export function evaluateStage(
  stagePrompt: string,
  stageOutput: string,
  modelSettings?: ExtractModelSettings,
  signal?: AbortSignal,
): Promise<StageEvaluationResult | { error: string }> {
  return postApi<StageEvaluationResult>(
    "/api/insight/evaluate-stage", { stagePrompt, stageOutput, modelSettings },
    (p) => "overall_score" in p && "checklist" in p, "Stage evaluation", signal,
  );
}

export function saveRun(
  snapshot: RunSnapshot,
  signal?: AbortSignal,
): Promise<{ saved: boolean; filename: string } | { error: string }> {
  return postApi<{ saved: boolean; filename: string }>(
    "/api/insight/save-run", snapshot,
    (p) => "saved" in p, "Save", signal,
  );
}

export async function listRuns(signal?: AbortSignal): Promise<RunSummary[] | { error: string }> {
  const result = await getApi<{ runs: RunSummary[] }>("/api/insight/list-runs", "List runs", signal);
  if ("error" in result) return result;
  return result.runs ?? [];
}

export function loadRun(filename: string, signal?: AbortSignal): Promise<RunSnapshot | { error: string }> {
  return getApi<RunSnapshot>(
    `/api/insight/load-run?filename=${encodeURIComponent(filename)}`, "Load run", signal,
  );
}

export function structureWithLlm(
  text: string,
  analysisPrompt?: string,
  portfolio?: Array<{ company: string; ticker?: string; held: "held" | "watchlist" }>,
  modelSettings?: ExtractModelSettings,
  signal?: AbortSignal,
): Promise<{ dataset: unknown } | { error: string }> {
  return postApi<{ dataset: unknown }>(
    "/api/insight/extract", { text, analysisPrompt, portfolio, modelSettings },
    (p) => p.dataset !== undefined, "Extract", signal,
  );
}
