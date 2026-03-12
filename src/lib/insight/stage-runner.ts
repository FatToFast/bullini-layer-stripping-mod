import type { InsightStageName, StageRecord } from "./types";

export type StageInput = {
  stageName: InsightStageName;
  input: unknown;
  searchResults?: unknown[];
  prompt?: string;
};

export async function runStage(
  stageInput: StageInput,
  executor: () => Promise<unknown>
): Promise<StageRecord> {
  const startTime = Date.now();

  try {
    const output = await executor();
    const elapsedMs = Date.now() - startTime;

    return {
      stage: stageInput.stageName,
      status: "success",
      input: stageInput.input,
      searchResults: stageInput.searchResults,
      prompt: stageInput.prompt,
      output,
      elapsedMs,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;

    return {
      stage: stageInput.stageName,
      status: "error",
      input: stageInput.input,
      searchResults: stageInput.searchResults,
      prompt: stageInput.prompt,
      elapsedMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
