import type {
  CachedStageResults,
  FinalOutput,
  InsightDataset,
  InsightRunResult,
  InsightStageName,
  ModelConfigOverride,
  PipelineEvent,
  PipelineModelSettings,
  SearchRoundConfig,
  StageRecord,
} from "./types";
import { normalizeRawInput } from "./normalizers";

function snakeToCamel(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camelKey] = snakeToCamel(value);
  }
  return result;
}
import { runStage } from "./stage-runner";
import { getSearchProvider, searchWithRetry, type SearchFact, type SearchProviderKind } from "@/lib/providers/search";
import { callLLM } from "@/lib/providers/llm";
import { generateStep1Queries, generateStep8Queries } from "./search-queries";
import { STAGE_ORDER } from "./stage-labels";
import {
  SYSTEM_PROMPT,
  STEP1_PROMPT,
  STEP2_PROMPT,
  STEP3_PROMPT,
  STEP4_PROMPT,
  STEP5_PROMPT,
  STEP6_PROMPT,
  STEP7_PROMPT,
  STEP8_PROMPT,
  STEP9_PROMPT,
} from "./prompts";

function makeLlmCall(baseSystemPrompt: string) {
  return function llmCall(stepPrompt: string, userContent: string, config?: ModelConfigOverride) {
    return callLLM(baseSystemPrompt + "\n\n" + stepPrompt, userContent, {
      ...(config?.model ? { model: config.model } : {}),
      ...(config?.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config?.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    });
  };
}

/**
 * Check whether `stageName` is at or before `targetStage` in the pipeline order.
 * Returns true if the stage should be executed or considered for execution.
 */
function isStageInScope(stageName: InsightStageName, targetStage?: InsightStageName): boolean {
  if (!targetStage) return true;
  return STAGE_ORDER.indexOf(stageName) <= STAGE_ORDER.indexOf(targetStage);
}

/**
 * Run the Layer-Stripping analysis pipeline.
 *
 * Supports partial execution via `targetStage` (stop after this stage) and
 * `cachedResults` (reuse outputs from prior runs for dependency stages).
 */
export async function runInsightPipeline(
  rawJson: string,
  options?: {
    modelSettings?: PipelineModelSettings;
    searchProvider?: SearchProviderKind;
    targetStage?: InsightStageName;
    cachedResults?: CachedStageResults;
    systemPrompt?: string;
    searchR1Config?: SearchRoundConfig;
    searchR2Config?: SearchRoundConfig;
    onEvent?: (event: PipelineEvent) => void;
  }
): Promise<InsightRunResult> {
  const runId = `run-${Date.now()}`;
  const stages: StageRecord[] = [];
  const emit = options?.onEvent ?? (() => {});
  const modelSettings = options?.modelSettings;
  const targetStage = options?.targetStage;
  const cached = options?.cachedResults ?? {};
  const llmCall = makeLlmCall(options?.systemPrompt || SYSTEM_PROMPT);

  function resolveStageConfig(stageName: InsightStageName, fallbackMaxTokens?: number): ModelConfigOverride {
    const stageConfig = modelSettings?.stages?.[stageName];
    const defaultConfig = modelSettings?.defaults;

    return {
      ...(defaultConfig?.model ? { model: defaultConfig.model } : {}),
      ...(defaultConfig?.temperature !== undefined ? { temperature: defaultConfig.temperature } : {}),
      ...(defaultConfig?.maxTokens !== undefined ? { maxTokens: defaultConfig.maxTokens } : {}),
      ...(stageConfig?.model ? { model: stageConfig.model } : {}),
      ...(stageConfig?.temperature !== undefined ? { temperature: stageConfig.temperature } : {}),
      ...(stageConfig?.maxTokens !== undefined ? { maxTokens: stageConfig.maxTokens } : {}),
      ...(stageConfig?.prompt ? { prompt: stageConfig.prompt } : {}),
      ...(fallbackMaxTokens !== undefined &&
      stageConfig?.maxTokens === undefined &&
      defaultConfig?.maxTokens === undefined
        ? { maxTokens: fallbackMaxTokens }
        : {}),
    };
  }

  /**
   * Helper: run a stage or return cached output.
   *
   * When the stage IS the targetStage, always execute (never use cache)
   * so the user gets a fresh result for the stage they explicitly asked for.
   * For dependency stages, use cache if available.
   */
  async function runOrFail(
    stageName: InsightStageName,
    input: unknown,
    prompt: string,
    userContent: string,
    extra?: { searchResults?: unknown[]; maxTokens?: number }
  ): Promise<StageRecord | null> {
    const isTarget = stageName === targetStage;
    const hasCached = cached[stageName] !== undefined && !isTarget;

    if (hasCached) {
      const record: StageRecord = {
        stage: stageName,
        status: "success",
        input,
        output: cached[stageName],
        elapsedMs: 0,
      };
      stages.push(record);
      emit({ type: "stage_complete", record });
      return record;
    }

    emit({ type: "stage_start", stage: stageName });
    const config = resolveStageConfig(stageName, extra?.maxTokens);
    const effectivePrompt = config.prompt ?? prompt;
    const record = await runStage(
      { stageName, input, userContent, searchResults: extra?.searchResults, prompt: effectivePrompt },
      async () => llmCall(effectivePrompt, userContent, config)
    );
    stages.push(record);
    emit({ type: "stage_complete", record });
    if (record.status === "error") {
      const result = { runId, stages, finalOutput: null };
      emit({ type: "pipeline_complete", result });
      return null;
    }
    return record;
  }

  /** Return early helper — builds the result and emits pipeline_complete */
  function earlyReturn(finalOutput: FinalOutput | null = null): InsightRunResult {
    const result = { runId, stages, finalOutput };
    emit({ type: "pipeline_complete", result });
    return result;
  }

  // ── Step 0: Input Validation ──
  let dataset: InsightDataset;
  if (cached.input_validation && targetStage !== "input_validation") {
    dataset = cached.input_validation as InsightDataset;
    const record: StageRecord = { stage: "input_validation", status: "success", input: rawJson, output: dataset, elapsedMs: 0 };
    stages.push(record);
    emit({ type: "stage_complete", record });
  } else {
    emit({ type: "stage_start", stage: "input_validation" });
    const step0 = await runStage(
      { stageName: "input_validation", input: rawJson },
      async () => normalizeRawInput(rawJson)
    );
    stages.push(step0);
    emit({ type: "stage_complete", record: step0 });
    if (step0.status === "error") return earlyReturn();
    dataset = step0.output as InsightDataset;
  }
  if (targetStage === "input_validation") return earlyReturn();

  // ── Pre-search: Round 1 ──
  const searchProviderInstance = getSearchProvider(options?.searchProvider);
  let searchResults1: SearchFact[] = [];
  try {
    const queries1 = await generateStep1Queries(dataset, options?.searchR1Config);
    emit({ type: "search_start", round: 1, queries: queries1 });
    const results = await Promise.all(queries1.map((q) => searchWithRetry(searchProviderInstance, q)));
    searchResults1 = results.flat();
    emit({ type: "search_complete", round: 1, results: searchResults1 });
  } catch (err) {
    emit({ type: "search_complete", round: 1, results: [], error: err instanceof Error ? err.message : "Search failed" });
  }

  // ── Step 1: Layer 0 + Layer 1 ──
  if (!isStageInScope("layer0_layer1", targetStage)) return earlyReturn();
  const step1 = await runOrFail(
    "layer0_layer1",
    { canonical_event: dataset.canonical_event, representative_news: dataset.representative_news },
    STEP1_PROMPT,
    JSON.stringify({
      canonical_event: dataset.canonical_event,
      representative_news: dataset.representative_news,
      web_search_facts: dataset.web_search_facts,
      external_search_results: searchResults1,
      additional_context: dataset.additional_context ?? [],
    }),
    { searchResults: searchResults1 }
  );
  if (!step1) return { runId, stages, finalOutput: null };
  if (targetStage === "layer0_layer1") return earlyReturn();

  // ── Step 2: Event Classification ──
  if (!isStageInScope("event_classification", targetStage)) return earlyReturn();
  const step2 = await runOrFail(
    "event_classification",
    { step1: step1.output, canonical_event: dataset.canonical_event },
    STEP2_PROMPT,
    JSON.stringify({
      step1_result: step1.output,
      canonical_event: dataset.canonical_event,
      entities: dataset.entities,
    })
  );
  if (!step2) return { runId, stages, finalOutput: null };
  if (targetStage === "event_classification") return earlyReturn();

  // ── Step 3: Layer 2 — 반대 방향 경로 ──
  if (!isStageInScope("layer2_reverse_paths", targetStage)) return earlyReturn();
  const step3 = await runOrFail(
    "layer2_reverse_paths",
    { step1: step1.output, step2: step2.output, market_data: dataset.structured_market_data },
    STEP3_PROMPT,
    JSON.stringify({
      step1_result: step1.output,
      step2_result: step2.output,
      structured_market_data: dataset.structured_market_data,
      web_search_facts: dataset.web_search_facts,
      external_search_results: searchResults1,
      additional_context: dataset.additional_context ?? [],
    }),
    { searchResults: searchResults1 }
  );
  if (!step3) return { runId, stages, finalOutput: null };
  if (targetStage === "layer2_reverse_paths") return earlyReturn();

  // ── Step 4: Layer 3 — 인접 시장 전이 ──
  if (!isStageInScope("layer3_adjacent_spillover", targetStage)) return earlyReturn();
  const step4 = await runOrFail(
    "layer3_adjacent_spillover",
    { step1: step1.output, step3: step3.output, entities: dataset.entities },
    STEP4_PROMPT,
    JSON.stringify({
      step1_result: step1.output,
      step2_result: step2.output,
      step3_result: step3.output,
      entities: dataset.entities,
      structured_market_data: dataset.structured_market_data,
      web_search_facts: dataset.web_search_facts,
      additional_context: dataset.additional_context ?? [],
    })
  );
  if (!step4) return { runId, stages, finalOutput: null };
  if (targetStage === "layer3_adjacent_spillover") return earlyReturn();

  // ── Step 5: Portfolio Impact ──
  if (!isStageInScope("portfolio_impact", targetStage)) return earlyReturn();
  const step5 = await runOrFail(
    "portfolio_impact",
    { portfolio: dataset.portfolio, step1: step1.output, step3: step3.output, step4: step4.output },
    STEP5_PROMPT,
    JSON.stringify({
      portfolio: dataset.portfolio,
      step1_result: step1.output,
      step3_result: step3.output,
      step4_result: step4.output,
      structured_market_data: dataset.structured_market_data,
      search_results: searchResults1,
    }),
    { searchResults: searchResults1 }
  );
  if (!step5) return { runId, stages, finalOutput: null };
  if (targetStage === "portfolio_impact") return earlyReturn();

  // ── Step 6: Layer 4 — 시간축 전환 ──
  if (!isStageInScope("layer4_time_horizon", targetStage)) return earlyReturn();
  const step6 = await runOrFail(
    "layer4_time_horizon",
    { step1: step1.output, step3: step3.output, step4: step4.output, step5: step5.output },
    STEP6_PROMPT,
    JSON.stringify({
      step1_result: step1.output,
      step2_result: step2.output,
      step3_result: step3.output,
      step4_result: step4.output,
      step5_result: step5.output,
      structured_market_data: dataset.structured_market_data,
      additional_context: dataset.additional_context ?? [],
    })
  );
  if (!step6) return { runId, stages, finalOutput: null };
  if (targetStage === "layer4_time_horizon") return earlyReturn();

  // ── Step 7: Layer 5 + Premortem ──
  if (!isStageInScope("layer5_structural_premortem", targetStage)) return earlyReturn();
  const step7 = await runOrFail(
    "layer5_structural_premortem",
    { step1: step1.output, step6: step6.output },
    STEP7_PROMPT,
    JSON.stringify({
      step1_result: step1.output,
      step2_result: step2.output,
      step3_result: step3.output,
      step4_result: step4.output,
      step5_result: step5.output,
      step6_result: step6.output,
      additional_context: dataset.additional_context ?? [],
    })
  );
  if (!step7) return { runId, stages, finalOutput: null };
  if (targetStage === "layer5_structural_premortem") return earlyReturn();

  // ── Pre-search: Round 2 (verification) ──
  let searchResults2: SearchFact[] = [];
  try {
    const analysisContext = {
      step1_result: step1.output,
      step2_result: step2.output,
      step3_result: step3.output,
      step7_result: step7.output,
    };
    const queries2 = await generateStep8Queries(dataset, analysisContext, options?.searchR2Config);
    emit({ type: "search_start", round: 2, queries: queries2 });
    const results = await Promise.all(queries2.map((q) => searchWithRetry(searchProviderInstance, q)));
    searchResults2 = results.flat();
    emit({ type: "search_complete", round: 2, results: searchResults2 });
  } catch (err) {
    emit({ type: "search_complete", round: 2, results: [], error: err instanceof Error ? err.message : "Search failed" });
  }

  // ── Step 8: Evidence Consolidation ──
  if (!isStageInScope("evidence_consolidation", targetStage)) return earlyReturn();
  const step8 = await runOrFail(
    "evidence_consolidation",
    { allSteps: { step1: step1.output, step3: step3.output, step4: step4.output, step5: step5.output, step6: step6.output, step7: step7.output } },
    STEP8_PROMPT,
    JSON.stringify({
      step1_result: step1.output,
      step3_result: step3.output,
      step4_result: step4.output,
      step5_result: step5.output,
      step6_result: step6.output,
      step7_result: step7.output,
      structured_market_data: dataset.structured_market_data,
      search_results_round1: searchResults1,
      search_results_round2: searchResults2,
    }),
    { searchResults: [...searchResults1, ...searchResults2] }
  );
  if (!step8) return { runId, stages, finalOutput: null };
  if (targetStage === "evidence_consolidation") return earlyReturn();

  // ── Step 9: Output Formatting (Product-first) ──
  const step9 = await runOrFail(
    "output_formatting",
    { step1: step1.output, step3: step3.output, step4: step4.output, step5: step5.output, step6: step6.output, step7: step7.output, step8: step8.output },
    STEP9_PROMPT,
    JSON.stringify({
      step1_result: step1.output,
      step3_result: step3.output,
      step4_result: step4.output,
      step5_result: step5.output,
      step6_result: step6.output,
      step7_result: step7.output,
      step8_result: step8.output,
      portfolio: dataset.portfolio,
      persona: modelSettings?.persona ?? "professional",
    }),
    { maxTokens: modelSettings?.stages?.output_formatting?.maxTokens ?? modelSettings?.defaults?.maxTokens ?? 8192 }
  );
  if (!step9) return { runId, stages, finalOutput: null };

  // ── Build final output ──
  let finalOutput: FinalOutput | null = null;
  if (step9.status === "success" && step9.output) {
    const normalized = snakeToCamel(step9.output) as Record<string, unknown>;
    finalOutput = {
      mode: (normalized.mode as FinalOutput["mode"]) ?? "general",
      persona: (normalized.persona as FinalOutput["persona"]) ?? "professional",
      oneLineTake: (normalized.oneLineTake as string) ?? "",
      portfolioImpactTable: Array.isArray(normalized.portfolioImpactTable) ? normalized.portfolioImpactTable as FinalOutput["portfolioImpactTable"] : [],
      watchTriggers: Array.isArray(normalized.watchTriggers) ? normalized.watchTriggers as FinalOutput["watchTriggers"] : [],
      competingHypotheses: Array.isArray(normalized.competingHypotheses) ? normalized.competingHypotheses as FinalOutput["competingHypotheses"] : [],
      whySections: Array.isArray(normalized.whySections) ? normalized.whySections as FinalOutput["whySections"] : [],
      historicalPrecedents: Array.isArray(normalized.historicalPrecedents) ? normalized.historicalPrecedents as FinalOutput["historicalPrecedents"] : [],
      inconsistencies: Array.isArray(normalized.inconsistencies) ? normalized.inconsistencies as FinalOutput["inconsistencies"] : [],
      narrativeParallels: Array.isArray(normalized.narrativeParallels) ? normalized.narrativeParallels as FinalOutput["narrativeParallels"] : [],
      metaAssumptions: Array.isArray(normalized.metaAssumptions) ? normalized.metaAssumptions as FinalOutput["metaAssumptions"] : [],
      structuralRead: (normalized.structuralRead as string) ?? "",
      premortem: (normalized.premortem as FinalOutput["premortem"]) ?? { coreThesis: "", primaryFailure: "", earlyWarning: "", ifWrong: "" },
      markdownOutput: (normalized.markdownOutput as string) ?? "",
    };
  }

  return earlyReturn(finalOutput);
}
