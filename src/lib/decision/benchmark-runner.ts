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

export async function evaluateDecisionOutput(
  actualOutput: unknown,
  expectedCriteria: string[],
  modelSettings?: Omit<ModelConfigOverride, "prompt">
): Promise<DecisionEvaluationResult> {
  const userMessage = buildDecisionEvaluateUserMessage(JSON.stringify(actualOutput, null, 2), expectedCriteria);
  const { content } = await callLLM(DECISION_EVALUATE_SYSTEM_PROMPT, userMessage, {
    model: modelSettings?.model,
    temperature: modelSettings?.temperature ?? 0.1,
    maxTokens: modelSettings?.maxTokens ?? 2200,
  });
  return parseDecisionEvaluationResult(content);
}

export async function runDecisionBenchmark(
  benchmarkOrId: DecisionBenchmarkCase | string,
  options?: {
    pipelineModelSettings?: DecisionModelSettings;
    evaluationModelSettings?: Omit<ModelConfigOverride, "prompt">;
    systemPrompt?: string;
    stagePolicies?: DecisionPipelineOptions["stagePolicies"];
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
