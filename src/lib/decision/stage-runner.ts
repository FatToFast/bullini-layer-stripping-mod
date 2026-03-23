import type { DecisionStageName, DecisionStageRecord } from "./types";

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
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.promptTokens === "number" &&
    typeof candidate.completionTokens === "number" &&
    typeof candidate.totalTokens === "number" &&
    (candidate.cost === undefined || typeof candidate.cost === "number")
  );
}

function isLlmResult(value: unknown): value is StageLlmResult {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    "content" in candidate &&
    "usage" in candidate &&
    typeof candidate.model === "string" &&
    (candidate.usage === null || isStageLlmUsage(candidate.usage))
  );
}

export type DecisionStageInput = {
  stageName: DecisionStageName;
  input: unknown;
  userContent?: string;
  prompt?: string;
};

export async function runDecisionStage(
  stageInput: DecisionStageInput,
  executor: () => Promise<StageLlmResult | unknown>
): Promise<DecisionStageRecord> {
  const startTime = Date.now();

  try {
    const raw = await executor();
    const output = isLlmResult(raw) ? raw.content : raw;
    const usage = isLlmResult(raw) ? raw.usage : null;
    const model = isLlmResult(raw) ? raw.model : undefined;

    return {
      stage: stageInput.stageName,
      status: "success",
      input: stageInput.input,
      userContent: stageInput.userContent,
      prompt: stageInput.prompt,
      output,
      elapsedMs: Date.now() - startTime,
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
    return {
      stage: stageInput.stageName,
      status: "error",
      input: stageInput.input,
      userContent: stageInput.userContent,
      prompt: stageInput.prompt,
      elapsedMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
