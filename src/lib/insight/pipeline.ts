import type { InsightDataset, StageRecord, InsightRunResult, FinalOutput, StageModelOverrides, PipelineEvent } from "./types";
import { normalizeRawInput } from "./normalizers";
import { runStage } from "./stage-runner";
import { getSearchProvider, searchWithRetry, type SearchFact } from "@/lib/providers/search";
import { callLLM } from "@/lib/providers/llm";
import { generateStep1Queries, generateStep8Queries } from "./search-queries";
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

function llmCall(stepPrompt: string, userContent: string, model?: string, maxTokens?: number) {
  return callLLM(SYSTEM_PROMPT + "\n\n" + stepPrompt, userContent, {
    ...(model ? { model } : {}),
    ...(maxTokens ? { maxTokens } : {}),
  });
}

export async function runInsightPipeline(
  rawJson: string,
  options?: {
    modelOverrides?: StageModelOverrides;
    onEvent?: (event: PipelineEvent) => void;
  }
): Promise<InsightRunResult> {
  const runId = `run-${Date.now()}`;
  const stages: StageRecord[] = [];
  const emit = options?.onEvent ?? (() => {});
  const mo = options?.modelOverrides;

  // ── Step 0: Input Validation ──
  emit({ type: "stage_start", stage: "input_validation" });
  const step0 = await runStage(
    { stageName: "input_validation", input: rawJson },
    async () => normalizeRawInput(rawJson)
  );
  stages.push(step0);
  emit({ type: "stage_complete", record: step0 });
  if (step0.status === "error") {
    const result = { runId, stages, finalOutput: null };
    emit({ type: "pipeline_complete", result });
    return result;
  }
  const dataset = step0.output as InsightDataset;

  // ── Pre-search: Round 1 ──
  let searchResults1: SearchFact[] = [];
  const queries1 = generateStep1Queries(dataset);
  emit({ type: "search_start", round: 1, queries: queries1 });
  try {
    const provider = getSearchProvider();
    const results = await Promise.all(queries1.map((q) => searchWithRetry(provider, q)));
    searchResults1 = results.flat();
    emit({ type: "search_complete", round: 1, results: searchResults1 });
  } catch (err) {
    emit({ type: "search_complete", round: 1, results: [], error: err instanceof Error ? err.message : "Search failed" });
  }

  // Helper: run a stage with error short-circuit
  async function runOrFail(
    stageName: Parameters<typeof runStage>[0]["stageName"],
    input: unknown,
    prompt: string,
    userContent: string,
    extra?: { searchResults?: unknown[]; maxTokens?: number }
  ): Promise<StageRecord | null> {
    emit({ type: "stage_start", stage: stageName });
    const record = await runStage(
      { stageName, input, searchResults: extra?.searchResults, prompt },
      async () => llmCall(prompt, userContent, mo?.[stageName], extra?.maxTokens)
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

  // ── Step 1: Layer 0 + Layer 1 (전제 제거 + 컨센서스 + 불완전성) ──
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

  // ── Step 2: Event Classification ──
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

  // ── Step 3: Layer 2 — 반대 방향 경로 ──
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

  // ── Step 4: Layer 3 — 인접 시장 전이 ──
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

  // ── Step 5: Portfolio Impact (Product-first 핵심) ──
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

  // ── Step 6: Layer 4 — 시간축 전환 ──
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

  // ── Step 7: Layer 5 + Premortem ──
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

  // ── Pre-search: Round 2 (verification) ──
  let searchResults2: SearchFact[] = [];
  const queries2 = generateStep8Queries(dataset);
  emit({ type: "search_start", round: 2, queries: queries2 });
  try {
    const provider = getSearchProvider();
    const results = await Promise.all(queries2.map((q) => searchWithRetry(provider, q)));
    searchResults2 = results.flat();
    emit({ type: "search_complete", round: 2, results: searchResults2 });
  } catch (err) {
    emit({ type: "search_complete", round: 2, results: [], error: err instanceof Error ? err.message : "Search failed" });
  }

  // ── Step 8: Evidence Consolidation ──
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
    }),
    { maxTokens: 4000 }
  );
  if (!step9) return { runId, stages, finalOutput: null };

  // ── Build final output ──
  let finalOutput: FinalOutput | null = null;
  if (step9.status === "success" && step9.output) {
    const out = step9.output as Record<string, unknown>;
    finalOutput = {
      oneLineTake: (out.one_line_take as string) ?? "",
      portfolioImpactTable: Array.isArray(out.portfolio_impact_table) ? out.portfolio_impact_table as FinalOutput["portfolioImpactTable"] : [],
      watchTriggers: Array.isArray(out.watch_triggers) ? out.watch_triggers as FinalOutput["watchTriggers"] : [],
      whySections: Array.isArray(out.why_sections) ? out.why_sections as FinalOutput["whySections"] : [],
      structuralRead: (out.structural_read as string) ?? "",
      premortem: (out.premortem as FinalOutput["premortem"]) ?? { coreThesis: "", primaryFailure: "", earlyWarning: "", ifWrong: "" },
      markdownOutput: (out.markdown_output as string) ?? "",
    };
  }

  const result = { runId, stages, finalOutput };
  emit({ type: "pipeline_complete", result });
  return result;
}
