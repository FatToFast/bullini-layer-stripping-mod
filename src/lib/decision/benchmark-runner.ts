import { callLLM } from "@/lib/providers/llm";
import { getDecisionBenchmarkById } from "./benchmarks";
import { buildDecisionEvaluateUserMessage, DECISION_EVALUATE_SYSTEM_PROMPT } from "./evaluate-prompt";
import { buildPromptOverridesFromEvaluation } from "./feedback";
import { parseDecisionBenchmarkCase, parseDecisionEvaluationResult } from "./schemas";
import { runDecisionPipeline } from "./pipeline";
import type {
  DecisionBenchmarkCase,
  DecisionBenchmarkRun,
  DecisionEvaluationResult,
  DecisionPipelineOptions,
  DecisionModelSettings,
  ModelConfigOverride,
} from "./types";

interface EvaluationCache {
  key: string;
  result: DecisionEvaluationResult;
  timestamp: number;
}

const evaluationCache = new Map<string, EvaluationCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function generateCacheKey(actualOutput: unknown, expectedCriteria: string[]): string {
  const outputStr = JSON.stringify(actualOutput);
  const criteriaStr = expectedCriteria.join("|");
  return `eval:${Buffer.from(`${criteriaStr}:${outputStr}`).toString("base64").slice(0, 64)}`;
}

function getFromCache(key: string): DecisionEvaluationResult | null {
  const cached = evaluationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  if (cached) {
    evaluationCache.delete(key);
  }
  return null;
}

function setCache(key: string, result: DecisionEvaluationResult): void {
  evaluationCache.set(key, { key, result, timestamp: Date.now() });
  if (evaluationCache.size > 100) {
    const oldestKey = Array.from(evaluationCache.keys())[0];
    evaluationCache.delete(oldestKey);
  }
}

interface ProgressCallback {
  (current: number, total: number, currentCriterion: string): void;
}

export async function evaluateDecisionOutput(
  actualOutput: unknown,
  expectedCriteria: string[],
  modelSettings?: Omit<ModelConfigOverride, "prompt">,
  options?: {
    signal?: AbortSignal;
    onProgress?: ProgressCallback;
  }
): Promise<DecisionEvaluationResult> {
  const cacheKey = generateCacheKey(actualOutput, expectedCriteria);
  const cachedResult = getFromCache(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const actualOutputStr = JSON.stringify(actualOutput, null, 2);

  if (expectedCriteria.length === 0) {
    throw new Error("At least one expected criterion is required");
  }

  if (expectedCriteria.length === 1) {
    options?.onProgress?.(1, 1, expectedCriteria[0]);
    const userMessage = buildDecisionEvaluateUserMessage(actualOutputStr, expectedCriteria);
    const { content } = await callLLM(DECISION_EVALUATE_SYSTEM_PROMPT, userMessage, {
      model: modelSettings?.model,
      temperature: modelSettings?.temperature ?? 0.1,
      maxTokens: modelSettings?.maxTokens ?? 2200,
      signal: options?.signal,
    });
    const result = parseDecisionEvaluationResult(content);
    setCache(cacheKey, result);
    return result;
  }

  const criteriaPerBatch = Math.max(1, Math.ceil(expectedCriteria.length / 3));
  const batches: string[][] = [];

  for (let i = 0; i < expectedCriteria.length; i += criteriaPerBatch) {
    batches.push(expectedCriteria.slice(i, i + criteriaPerBatch));
  }

  const evaluateBatch = async (batch: string[], batchIndex: number): Promise<{
    scores: number[];
    comments: string[];
  }> => {
    const startIdx = batchIndex * criteriaPerBatch;
    for (let i = 0; i < batch.length; i++) {
      const globalIndex = startIdx + i;
      options?.onProgress?.(globalIndex + 1, expectedCriteria.length, batch[i]);
    }

    const userMessage = buildDecisionEvaluateUserMessage(actualOutputStr, batch);
    const { content } = await callLLM(DECISION_EVALUATE_SYSTEM_PROMPT, userMessage, {
      model: modelSettings?.model,
      temperature: modelSettings?.temperature ?? 0.1,
      maxTokens: modelSettings?.maxTokens ?? 2200,
      signal: options?.signal,
    });

    const evaluation = parseDecisionEvaluationResult(content);

    const scores: number[] = [];
    const comments: string[] = [];

    if (evaluation.breakdown && evaluation.breakdown.length > 0) {
      for (const item of evaluation.breakdown) {
        scores.push(item.score);
        comments.push(`${item.criterion}: ${item.comment}`);
      }
    } else {
      for (let i = 0; i < batch.length; i++) {
        scores.push(evaluation.score);
        comments.push(`${batch[i]}: ${evaluation.reasoning}`);
      }
    }

    return { scores, comments };
  };

  const results = await Promise.all(
    batches.map((batch, idx) => evaluateBatch(batch, idx))
  );

  const allScores = results.flatMap(r => r.scores);
  const allComments = results.flatMap(r => r.comments);

  const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const overallReasoning = `Evaluated ${expectedCriteria.length} criteria with average score of ${avgScore.toFixed(1)}`;

  const combinedResult: DecisionEvaluationResult = {
    score: avgScore,
    reasoning: overallReasoning,
    verdict: avgScore >= 85 ? "keep" : avgScore >= 60 ? "iterate" : "discard",
    breakdown: expectedCriteria.map((criterion, idx) => ({
      criterion,
      score: allScores[idx] ?? avgScore,
      comment: allComments[idx] ?? overallReasoning,
    })),
    improvementHypotheses: [],
  };

  setCache(cacheKey, combinedResult);
  return combinedResult;
}

export async function runDecisionBenchmark(
  benchmarkOrId: DecisionBenchmarkCase | string,
  options?: {
    pipelineModelSettings?: DecisionModelSettings;
    evaluationModelSettings?: Omit<ModelConfigOverride, "prompt">;
    systemPrompt?: string;
    stagePolicies?: DecisionPipelineOptions["stagePolicies"];
    signal?: AbortSignal;
    onProgress?: (current: number, total: number, currentCriterion: string) => void;
  }
): Promise<DecisionBenchmarkRun> {
  const benchmark =
    typeof benchmarkOrId === "string"
      ? getDecisionBenchmarkById(benchmarkOrId)
      : parseDecisionBenchmarkCase(benchmarkOrId);

  if (!benchmark) {
    throw new Error(`Unknown decision benchmark: ${benchmarkOrId}`);
  }

  const normalizedBenchmark = parseDecisionBenchmarkCase(benchmark);
  const run = await runDecisionPipeline(normalizedBenchmark.input, {
    modelSettings: options?.pipelineModelSettings,
    systemPrompt: options?.systemPrompt,
    stagePolicies: options?.stagePolicies,
  });

  const evaluation = await evaluateDecisionOutput(
    run.finalOutput ?? { error: "pipeline returned null finalOutput", stages: run.stages },
    normalizedBenchmark.expectedCriteria,
    options?.evaluationModelSettings,
    {
      signal: options?.signal,
      onProgress: options?.onProgress,
    }
  );

  const { suggestedModelSettings, notes } = buildPromptOverridesFromEvaluation(
    evaluation,
    options?.pipelineModelSettings,
  );

  return {
    benchmark: normalizedBenchmark,
    run,
    evaluation,
    suggestedModelSettings,
    promptTuningNotes: notes,
  };
}

export function clearEvaluationCache(): void {
  evaluationCache.clear();
}
