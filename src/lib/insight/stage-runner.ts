import type { InsightStageName, StageRecord } from "./types";

type StageLlmUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
};

type StageLlmResult = {
  content: unknown;
  usage: StageLlmUsage | null;
  model: string;
};

function isStageLlmUsage(value: unknown): value is StageLlmUsage {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.promptTokens === "number" &&
    typeof candidate.completionTokens === "number" &&
    typeof candidate.totalTokens === "number" &&
    (candidate.cost === undefined || typeof candidate.cost === "number")
  );
}

function isLlmResult(value: unknown): value is StageLlmResult {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const usage = candidate.usage;

  return (
    "content" in candidate &&
    "usage" in candidate &&
    typeof candidate.model === "string" &&
    (usage === null || isStageLlmUsage(usage))
  );
}

export type StageInput = {
  stageName: InsightStageName;
  input: unknown;
  userContent?: string;
  searchResults?: unknown[];
  prompt?: string;
};

export async function runStage(
  stageInput: StageInput,
  executor: () => Promise<StageLlmResult | unknown>
): Promise<StageRecord> {
  const startTime = Date.now();

  try {
    const raw = await executor();
    const output = isLlmResult(raw) ? raw.content : raw;
    const usage = isLlmResult(raw) ? raw.usage : null;
    const model = isLlmResult(raw) ? raw.model : undefined;
    const elapsedMs = Date.now() - startTime;

    return {
      stage: stageInput.stageName,
      status: "success",
      input: stageInput.input,
      userContent: stageInput.userContent,
      searchResults: stageInput.searchResults,
      prompt: stageInput.prompt,
      output,
      elapsedMs,
      ...(usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            cost: usage.cost,
          }
        : {}),
      ...(model ? { model } : {}),
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;

    return {
      stage: stageInput.stageName,
      status: "error",
      input: stageInput.input,
      userContent: stageInput.userContent,
      searchResults: stageInput.searchResults,
      prompt: stageInput.prompt,
      elapsedMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
