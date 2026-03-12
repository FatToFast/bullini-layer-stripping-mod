import type { InsightRunResult, StageModelOverrides, PipelineEvent, StageRecord } from "./types";

export type StreamCallbacks = {
  onStageStart?: (stage: string) => void;
  onStageComplete?: (record: StageRecord) => void;
  onSearchStart?: (round: 1 | 2, queries: string[]) => void;
  onSearchComplete?: (round: 1 | 2, results: unknown[], error?: string) => void;
  onComplete?: (result: InsightRunResult) => void;
  onError?: (message: string) => void;
};

export async function runInsightApiStream(
  rawJson: string,
  modelOverrides?: StageModelOverrides,
  callbacks?: StreamCallbacks
): Promise<InsightRunResult> {
  const response = await fetch("/api/insight/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawJson, modelOverrides }),
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
            callbacks?.onStageStart?.(event.stage as string);
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
