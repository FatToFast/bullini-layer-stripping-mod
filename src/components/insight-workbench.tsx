"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import {
  runInsightApiStream,
  fetchArticleText,
  structureWithLlm,
  evaluateStage,
  type ExtractModelSettings,
} from "@/lib/insight/api";
import { mergeDecisionContextIntoInsightDataset } from "@/lib/decision/insight-handoff";
import { buildDecisionBenchmarkFromCurrentArticle } from "@/lib/decision/article-benchmark";
import { CUSTOM_MODEL_VALUE, TUNABLE_STAGES } from "@/lib/insight/model-catalog";
import type { DecisionModelSettings } from "@/lib/decision/types";
import { DEFAULT_STAGE_PROMPTS } from "@/lib/insight/prompts";
import {
  appendStageRecordIfMissing,
  markStageRecordStatus,
  upsertSearchRound,
  upsertStageRecord,
} from "@/lib/insight/state-updaters";
import type { CachedStageResults, InsightStageName, PipelineModelSettings } from "@/lib/insight/types";
import { ProducerFlowPanel } from "@/components/decision/producer-flow-panel";
import { PipelineDiagram } from "@/components/insight/pipeline-diagram";
import { RunProfilePanel } from "@/components/insight/run-profile-panel";
import {
  AnalysisHistory,
  DecisionBenchmarkPanel,
  DecisionExecutionPanel,
  FinalOutputPanel,
  OutputEditor,
  QualityDashboard,
  SearchRoundsLog,
  StageWorkbench,
  WorkflowMermaidPanel,
} from "@/components/insight/lazy-panels";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  OUTPUT_STAGE_TOKENS,
  buildInitialStageConfigs,
  type SampleItem,
  type StageUiConfig,
  usePipelineState,
} from "@/hooks/use-pipeline-state";
import { getEventIdFromRawJson, readStoredAnalysis, useAnalysisStorage } from "@/hooks/use-analysis-storage";
import { isAbortError, useLatestRequest, type LatestRequestToken } from "@/hooks/use-latest-request";
import { useQualityMetrics } from "@/hooks/use-quality-metrics";

type SearchProviderOption = {
  kind: string;
  label: string;
  configured: boolean;
};

type Props = {
  defaultModel: string;
  providerLabel: string;
  searchProviders: SearchProviderOption[];
  defaultSystemPrompt: string;
  samples: SampleItem[];
};

function getEffectiveModel(model: string, customModel: string) {
  return model === CUSTOM_MODEL_VALUE ? customModel.trim() : model;
}

export function InsightWorkbench({ defaultModel, providerLabel, searchProviders, defaultSystemPrompt, samples }: Props) {
  const defaultSample = samples[0];
  const {
    rawJson,
    setRawJson,
    commonModel,
    setCommonModel,
    commonCustomModel,
    setCommonCustomModel,
    commonTemperature,
    setCommonTemperature,
    commonMaxTokens,
    setCommonMaxTokens,
    preset,
    setPreset,
    persona,
    setPersona,
    systemPrompt,
    setSystemPrompt,
    systemPromptOpen,
    setSystemPromptOpen,
    stageConfigs,
    setStageConfigs,
    isRunning,
    setIsRunning,
    stageRecords,
    setStageRecords,
    searchRounds,
    setSearchRounds,
    finalResult,
    setFinalResult,
    previousResult,
    setPreviousResult,
    activeStage,
    setActiveStage,
    error,
    setError,
    newsUrl,
    setNewsUrl,
    analysisPrompt,
    setAnalysisPrompt,
    searchProvider,
    setSearchProvider,
    extractPhase,
    setExtractPhase,
    extractError,
    setExtractError,
    fetchedText,
    setFetchedText,
    inputSnapshotOpen,
    setInputSnapshotOpen,
    runningStage,
    setRunningStage,
    activeTab,
    setActiveTab,
    editableMarkdown,
    setEditableMarkdown,
    outputTemplate,
    setOutputTemplate,
    userNotes,
    setUserNotes,
    copyFeedback,
    setCopyFeedback,
    stageEvaluations,
    setStageEvaluations,
    analysisHistory,
    setAnalysisHistory,
    historySearch,
    setHistorySearch,
    evaluatingStage,
    setEvaluatingStage,
    abMode,
    setAbMode,
    abStage,
    setAbStage,
    abPromptOverride,
    setAbPromptOverride,
    abResult,
    setAbResult,
    abRunning,
    setAbRunning,
    searchR1Config,
    setSearchR1Config,
    searchR2Config,
    setSearchR2Config,
    deferredRawJson,
    deferredFinalResult,
  } = usePipelineState(defaultModel, defaultSystemPrompt, defaultSample);

  const { saveAnalysis, loadAnalysis, finalOutputComparison } = useAnalysisStorage({
    rawJson,
    finalResult,
    previousResult,
    setAnalysisHistory,
    setFinalResult,
    setAbResult,
    setRawJson,
    setEditableMarkdown,
    setUserNotes,
  });

  const effectiveCommonModel = getEffectiveModel(commonModel, commonCustomModel);
  const tunedStages = useMemo(() => TUNABLE_STAGES.filter((stage) => stage !== "input_validation"), []);
  const overrideCount = tunedStages.filter((stage) => stageConfigs[stage].enabled).length;
  const [decisionModelSettings, setDecisionModelSettings] = useState<DecisionModelSettings>({
    defaults: {
      model: defaultModel,
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
    },
    stages: {},
  });

  const [savedDecisionBenchmarks, setSavedDecisionBenchmarks] = useState<import("@/lib/decision/types").DecisionBenchmarkCase[]>([]);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractRequest = useLatestRequest();
  const pipelineRequest = useLatestRequest();
  const stageEvaluationRequest = useLatestRequest();

  const qualityMetrics = useQualityMetrics(deferredFinalResult?.finalOutput ?? null, stageRecords);
  const currentArticleBenchmark = useMemo(
    () =>
      buildDecisionBenchmarkFromCurrentArticle({
        analysisPrompt,
        newsUrl,
        rawJson,
        userNotes,
      }),
    [analysisPrompt, newsUrl, rawJson, userNotes],
  );

  useEffect(() => {
    if (deferredFinalResult?.finalOutput?.markdownOutput) {
      setEditableMarkdown(deferredFinalResult.finalOutput.markdownOutput);
    }
  }, [deferredFinalResult, setEditableMarkdown]);

  useEffect(() => {
    if (!abMode) {
      setAbStage(null);
      setAbPromptOverride("");
      setAbResult(null);
    }
  }, [abMode, setAbPromptOverride, setAbResult, setAbStage]);

  useEffect(() => {
    if (!abStage) return;
    setAbPromptOverride(stageConfigs[abStage].prompt || DEFAULT_STAGE_PROMPTS[abStage]);
  }, [abStage, setAbPromptOverride, stageConfigs]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function buildModelSettings(configs = stageConfigs): PipelineModelSettings {
    const stages = Object.fromEntries(
      tunedStages
        .filter((stage) => configs[stage].enabled)
        .map((stage) => {
          const config = configs[stage];
          const defaultPrompt = DEFAULT_STAGE_PROMPTS[stage];
          const hasCustomPrompt = config.prompt.trim() !== "" && config.prompt.trim() !== defaultPrompt.trim();
          return [
            stage,
            {
              model: getEffectiveModel(config.model, config.customModel),
              temperature: config.temperature,
              maxTokens: config.maxTokens,
              ...(hasCustomPrompt ? { prompt: config.prompt.trim() } : {}),
            },
          ];
        })
    );

    return {
      defaults: {
        model: effectiveCommonModel,
        temperature: commonTemperature,
        maxTokens: commonMaxTokens,
      },
      stages,
      persona,
    };
  }

  function handleApplyDecisionSuggestedSettings(nextSettings: DecisionModelSettings) {
    setDecisionModelSettings((prev) => ({
      defaults: {
        ...(prev.defaults ?? {}),
        ...(nextSettings.defaults ?? {}),
      },
      stages: {
        ...(prev.stages ?? {}),
        ...(nextSettings.stages ?? {}),
      },
    }));
  }

  function handleBenchmarkCreated(benchmark: import("@/lib/decision/types").DecisionBenchmarkCase) {
    setSavedDecisionBenchmarks((prev) => {
      const next = prev.filter((item) => item.id !== benchmark.id);
      return [benchmark, ...next];
    });
  }

  function handleApplyDecisionInsightHandoff(nextAnalysisPrompt: string, additionalContext: string[]) {
    setAnalysisPrompt(nextAnalysisPrompt);
    if (!rawJson.trim()) return;
    try {
      const merged = mergeDecisionContextIntoInsightDataset(
        rawJson,
        {
          recommendedQuestion: nextAnalysisPrompt.split("\n")[0] || nextAnalysisPrompt,
          decisionStatement: nextAnalysisPrompt,
          recommendedOptionId: "decision-handoff",
          options: [],
          orchestrationPlan: [],
          stakeholderBriefs: [],
          rehearsalFindings: [],
          keyAssumptions: [],
          revisitTriggers: [],
          metaTuning: { observedBiases: [], skippedChecks: [], nextTimeAdjustments: [] },
          insightHandoff: { analysisPrompt: nextAnalysisPrompt, additionalContext },
        },
      );
      setRawJson(merged);
    } catch {
      setUserNotes((prev) => [prev, ...additionalContext].filter(Boolean).join("\n"));
    }
  }

  function handleCommonModelChange(value: string) {
    setCommonModel(value);
    if (value !== CUSTOM_MODEL_VALUE) {
      setCommonCustomModel("");
    }
  }

  function handlePresetChange(nextPreset: "custom" | "deep" | "balanced" | "quick") {
    setPreset(nextPreset);
    if (nextPreset === "custom") return;
    if (nextPreset === "deep") {
      setCommonTemperature(0.3);
      setCommonMaxTokens(8192);
      return;
    }
    if (nextPreset === "balanced") {
      setCommonTemperature(0.5);
      setCommonMaxTokens(4096);
      return;
    }
    setCommonTemperature(0.7);
    setCommonMaxTokens(2048);
  }

  function handleCommonTemperatureChange(value: number) {
    setCommonTemperature(value);
    setPreset("custom");
  }

  function handleCommonMaxTokensChange(value: number) {
    setCommonMaxTokens(value);
    setPreset("custom");
  }

  function updateStageConfig(stage: InsightStageName, updater: (current: StageUiConfig) => StageUiConfig) {
    setStageConfigs((prev) => ({
      ...prev,
      [stage]: updater(prev[stage]),
    }));
  }

  function handleStageModelChange(stage: InsightStageName, value: string) {
    updateStageConfig(stage, (current) => ({
      ...current,
      model: value,
      customModel: value === CUSTOM_MODEL_VALUE ? current.customModel : "",
    }));
  }

  function resetStageOverride(stage: InsightStageName) {
    updateStageConfig(stage, () => ({
      enabled: false,
      expanded: false,
      model: commonModel,
      customModel: commonCustomModel,
      temperature: commonTemperature,
      maxTokens: stage === "output_formatting" ? OUTPUT_STAGE_TOKENS : commonMaxTokens,
      prompt: DEFAULT_STAGE_PROMPTS[stage],
    }));
  }

  function applyCommonToAll() {
    setStageConfigs((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([stage, config]) => [
          stage,
          {
            ...config,
            enabled: false,
            expanded: false,
            model: commonModel,
            customModel: commonCustomModel,
            temperature: commonTemperature,
            maxTokens: commonMaxTokens,
            prompt: DEFAULT_STAGE_PROMPTS[stage as InsightStageName],
          },
        ])
      ) as Record<InsightStageName, StageUiConfig>
    );
  }

  function resetAllOverrides() {
    setStageConfigs(buildInitialStageConfigs(effectiveCommonModel, commonTemperature, commonMaxTokens));
  }

  async function handleExtract() {
    if (!newsUrl.trim()) return;
    const request = extractRequest.begin();
    setExtractPhase("fetching");
    setExtractError(null);
    setFetchedText(null);
    setError(null);

    try {
      const fetchResult = await fetchArticleText(newsUrl.trim(), request.signal);
      if (!extractRequest.isCurrent(request.requestId)) return;
      if ("error" in fetchResult) {
        setExtractError(fetchResult.error);
        setExtractPhase("error");
        return;
      }

      setFetchedText(fetchResult);
      setExtractPhase("structuring");

      const extractSettings: ExtractModelSettings = {
        model: effectiveCommonModel,
        temperature: commonTemperature,
        maxTokens: commonMaxTokens,
      };
      const structureResult = await structureWithLlm(
        fetchResult.text,
        analysisPrompt.trim() || undefined,
        undefined,
        extractSettings,
        request.signal,
      );
      if (!extractRequest.isCurrent(request.requestId)) return;

      if ("error" in structureResult) {
        setExtractError(structureResult.error);
        setExtractPhase("error");
        return;
      }

      setRawJson(JSON.stringify(structureResult.dataset, null, 2));
      setExtractPhase("done");
    } catch (caughtError) {
      if (!extractRequest.isCurrent(request.requestId) || isAbortError(caughtError)) return;
      setExtractError(caughtError instanceof Error ? caughtError.message : "URL 분석에 실패했습니다.");
      setExtractPhase("error");
    } finally {
      extractRequest.finish(request.requestId);
    }
  }

  function resetExtraction() {
    extractRequest.cancel();
    setExtractPhase("idle");
    setExtractError(null);
    setFetchedText(null);
  }

  function buildSearchConfigs() {
    const r1 = searchR1Config.prompt || searchR1Config.model ? searchR1Config : undefined;
    const r2 = searchR2Config.prompt || searchR2Config.model ? searchR2Config : undefined;
    return r1 || r2 ? { searchR1Config: r1, searchR2Config: r2 } : undefined;
  }

  async function runFullPipeline(
    modelSettings: PipelineModelSettings,
    request: LatestRequestToken,
    options?: { applyFinalResult?: boolean; persistResult?: boolean; updatePreviousResult?: boolean }
  ) {
    const applyFinalResult = options?.applyFinalResult ?? true;
    const persistResult = options?.persistResult ?? true;
    const updatePreviousResult = options?.updatePreviousResult ?? true;
    const eventId = getEventIdFromRawJson(rawJson);

    if (updatePreviousResult && pipelineRequest.isCurrent(request.requestId)) {
      setPreviousResult(eventId ? readStoredAnalysis(eventId) : null);
    }

    setError(null);
    setActiveStage("input_validation");
    setStageRecords([]);
    setSearchRounds([]);
    if (applyFinalResult) {
      setFinalResult(null);
    }

    const result = await runInsightApiStream(
      rawJson,
      modelSettings,
      {
        onStageStart: (stage) => {
          if (!pipelineRequest.isCurrent(request.requestId)) return;
          startTransition(() => {
            setActiveStage(stage);
            setStageRecords((prev) => appendStageRecordIfMissing(prev, stage));
          });
        },
        onStageComplete: (record) => {
          if (!pipelineRequest.isCurrent(request.requestId)) return;
          startTransition(() => {
            setActiveStage(record.stage);
            setStageRecords((prev) => upsertStageRecord(prev, record));
          });
        },
        onSearchStart: (round, queries) => {
          if (!pipelineRequest.isCurrent(request.requestId)) return;
          startTransition(() => {
            setSearchRounds((prev) => upsertSearchRound(prev, { round, queries, results: [] }));
          });
        },
        onSearchComplete: (round, results, searchError) => {
          if (!pipelineRequest.isCurrent(request.requestId)) return;
          startTransition(() => {
            setSearchRounds((prev) => {
              const previousRound = prev.find((item) => item.round === round);
              return upsertSearchRound(prev, {
                round,
                queries: previousRound?.queries ?? [],
                results,
                error: searchError,
              });
            });
          });
        },
        onComplete: (completed) => {
          if (!pipelineRequest.isCurrent(request.requestId)) return;
          startTransition(() => {
            if (applyFinalResult) setFinalResult(completed);
            setActiveStage(null);
          });
        },
        onError: (message) => {
          if (!pipelineRequest.isCurrent(request.requestId)) return;
          startTransition(() => setError(message));
        },
      },
      searchProvider,
      undefined,
      undefined,
      systemPrompt !== defaultSystemPrompt ? systemPrompt : undefined,
      buildSearchConfigs(),
      request.signal,
    );

    if (!pipelineRequest.isCurrent(request.requestId)) return null;
    if (applyFinalResult) setFinalResult(result);
    if (persistResult && result.finalOutput) saveAnalysis(result.finalOutput);
    return result;
  }

  async function handleRun() {
    const request = pipelineRequest.begin();
    setIsRunning(true);
    setRunningStage(null);
    setAbResult(null);
    try {
      await runFullPipeline(buildModelSettings(), request);
    } catch (caughtError) {
      if (!pipelineRequest.isCurrent(request.requestId) || isAbortError(caughtError)) return;
      setError(caughtError instanceof Error ? caughtError.message : "분석 실행에 실패했습니다.");
    } finally {
      if (!pipelineRequest.finish(request.requestId)) return;
      setIsRunning(false);
      setActiveStage(null);
    }
  }

  async function handleRunAB() {
    if (!abStage || !abPromptOverride.trim()) return;
    const request = pipelineRequest.begin();
    setAbRunning(true);
    setIsRunning(true);
    setRunningStage(null);
    setAbResult(null);

    try {
      const resultA = await runFullPipeline(buildModelSettings(), request);
      if (!resultA || !pipelineRequest.isCurrent(request.requestId)) return;
      const resultB = await runFullPipeline(
        buildModelSettings({
          ...stageConfigs,
          [abStage]: { ...stageConfigs[abStage], enabled: true, prompt: abPromptOverride },
        }),
        request,
        { applyFinalResult: false, persistResult: false, updatePreviousResult: false }
      );
      if (!resultB || !pipelineRequest.isCurrent(request.requestId)) return;
      setAbResult(resultB);
      setFinalResult(resultA);
    } catch (caughtError) {
      if (!pipelineRequest.isCurrent(request.requestId) || isAbortError(caughtError)) return;
      setError(caughtError instanceof Error ? caughtError.message : "A/B 비교 실행에 실패했습니다.");
    } finally {
      if (!pipelineRequest.finish(request.requestId)) return;
      setAbRunning(false);
      setIsRunning(false);
      setActiveStage(null);
    }
  }

  function buildCachedResults(): CachedStageResults {
    const cache: CachedStageResults = {};
    for (const record of stageRecords) {
      if (record.status === "success" && record.output !== undefined) {
        cache[record.stage] = record.output;
      }
    }
    return cache;
  }

  async function handleRunStage(targetStage: InsightStageName) {
    if (!rawJson.trim()) return;
    const request = pipelineRequest.begin();
    setRunningStage(targetStage);
    setIsRunning(false);
    setAbRunning(false);
    setError(null);
    setActiveStage(targetStage);

    try {
      const result = await runInsightApiStream(
        rawJson,
        buildModelSettings(),
        {
          onStageStart: (stage) => {
            if (!pipelineRequest.isCurrent(request.requestId)) return;
            startTransition(() => {
              setActiveStage(stage);
              setStageRecords((prev) => markStageRecordStatus(prev, stage, "running"));
            });
          },
          onStageComplete: (record) => {
            if (!pipelineRequest.isCurrent(request.requestId)) return;
            startTransition(() => {
              setActiveStage(record.stage);
              setStageRecords((prev) => upsertStageRecord(prev, record));
            });
          },
          onSearchStart: (round, queries) => {
            if (!pipelineRequest.isCurrent(request.requestId)) return;
            startTransition(() => {
              setSearchRounds((prev) => upsertSearchRound(prev, { round, queries, results: [] }));
            });
          },
          onSearchComplete: (round, results, searchError) => {
            if (!pipelineRequest.isCurrent(request.requestId)) return;
            startTransition(() => {
              setSearchRounds((prev) => {
                const previousRound = prev.find((item) => item.round === round);
                return upsertSearchRound(prev, {
                  round,
                  queries: previousRound?.queries ?? [],
                  results,
                  error: searchError,
                });
              });
            });
          },
          onComplete: (completed) => {
            if (!pipelineRequest.isCurrent(request.requestId)) return;
            startTransition(() => {
              if (completed.finalOutput) setFinalResult(completed);
              setActiveStage(null);
            });
          },
          onError: (message) => {
            if (!pipelineRequest.isCurrent(request.requestId)) return;
            startTransition(() => setError(message));
          },
        },
        searchProvider,
        targetStage,
        buildCachedResults(),
        systemPrompt !== defaultSystemPrompt ? systemPrompt : undefined,
        buildSearchConfigs(),
        request.signal,
      );

      if (!pipelineRequest.isCurrent(request.requestId)) return;
      if (result?.finalOutput) setFinalResult(result);
    } catch (caughtError) {
      if (!pipelineRequest.isCurrent(request.requestId) || isAbortError(caughtError)) return;
      setError(caughtError instanceof Error ? caughtError.message : "Stage 실행에 실패했습니다.");
    } finally {
      if (!pipelineRequest.finish(request.requestId)) return;
      setRunningStage(null);
      setActiveStage(null);
    }
  }

  async function handleEvaluateStage(stage: InsightStageName) {
    const record = stageRecords.find((item) => item.stage === stage);
    if (!record?.output) return;

    const request = stageEvaluationRequest.begin();
    setEvaluatingStage(stage);
    const config = stageConfigs[stage];
    const stagePrompt = config.enabled ? config.prompt : DEFAULT_STAGE_PROMPTS[stage];
    const outputStr = typeof record.output === "string" ? record.output : JSON.stringify(record.output, null, 2);
    const result = await evaluateStage(`${systemPrompt}\n\n${stagePrompt}`, outputStr, {
      model: getEffectiveModel(commonModel, commonCustomModel),
      temperature: 0.1,
      maxTokens: 3000,
    }, request.signal);

    if (!stageEvaluationRequest.isCurrent(request.requestId)) return;
    if ("error" in result) {
      setError(result.error);
    } else {
      setStageEvaluations((prev) => ({ ...prev, [stage]: result }));
    }
    if (!stageEvaluationRequest.finish(request.requestId)) return;
    setEvaluatingStage(null);
  }

  function handleCopy() {
    const output = deferredFinalResult?.finalOutput;
    if (!output) return;

    const textToCopy = outputTemplate === "full"
      ? editableMarkdown
      : outputTemplate === "summary"
        ? `${output.oneLineTake}\n\n${output.structuralRead}\n\n${output.portfolioImpactTable.map((row) => `${row.company} (${row.exposureType}): ${row.whatChangesToday}`).join("\n")}`
        : `${output.oneLineTake} #투자분석`;

    navigator.clipboard.writeText(textToCopy).then(() => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
      setCopyFeedback("복사됨!");
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopyFeedback(null);
        copyFeedbackTimeoutRef.current = null;
      }, 2000);
    });
  }

  // Prerequisite check: Decision panels require rawJson
  const hasRawJson = rawJson.trim().length > 0;

  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCard">
          <span className="kicker">Standalone Localhost App</span>
          <h1 className="heroTitle">Layer-Stripping Workbench</h1>
          <p className="heroText">질문 재정의 → 관점 수렴 → 집필 브리프 → 심화 분석 흐름을 생산자 관점에서 시험하는 콘솔입니다.</p>
        </div>
        <div className="heroMeta">
          <div className="metaPill"><span className="metaLabel">LLM Provider</span><div className="metaValue">{providerLabel}</div></div>
          <div className="metaPill"><span className="metaLabel">Search</span><div className="metaValue">{searchProviders.find((provider) => provider.kind === searchProvider)?.label ?? "None"}</div></div>
          <div className="metaPill"><span className="metaLabel">Model</span><div className="metaValue">{effectiveCommonModel}</div></div>
        </div>
      </section>

      <section className="workspace">
        <RunProfilePanel
          rawJson={rawJson}
          commonModel={commonModel}
          onCommonModelChange={handleCommonModelChange}
          commonCustomModel={commonCustomModel}
          setCommonCustomModel={setCommonCustomModel}
          commonTemperature={commonTemperature}
          commonMaxTokens={commonMaxTokens}
          preset={preset}
          systemPrompt={systemPrompt}
          setSystemPrompt={setSystemPrompt}
          systemPromptOpen={systemPromptOpen}
          setSystemPromptOpen={setSystemPromptOpen}
          activeStage={activeStage}
          newsUrl={newsUrl}
          setNewsUrl={setNewsUrl}
          analysisPrompt={analysisPrompt}
          setAnalysisPrompt={setAnalysisPrompt}
          searchProvider={searchProvider}
          setSearchProvider={setSearchProvider}
          searchProviders={searchProviders}
          extractPhase={extractPhase}
          extractError={extractError}
          fetchedText={fetchedText}
          effectiveCommonModel={effectiveCommonModel}
          defaultSystemPrompt={defaultSystemPrompt}
          overrideCount={overrideCount}
          tunedStages={tunedStages}
          isRunning={isRunning}
          abMode={abMode}
          setAbMode={setAbMode}
          abStage={abStage}
          setAbStage={setAbStage}
          abPromptOverride={abPromptOverride}
          setAbPromptOverride={setAbPromptOverride}
          abResult={abResult}
          abRunning={abRunning}
          finalResult={deferredFinalResult}
          stageConfigs={stageConfigs}
          onCommonTemperatureChange={handleCommonTemperatureChange}
          onCommonMaxTokensChange={handleCommonMaxTokensChange}
          onPresetChange={handlePresetChange}
          persona={persona}
          onPersonaChange={setPersona}
          onExtract={handleExtract}
          onResetExtraction={resetExtraction}
          onRun={handleRun}
          onRunAB={handleRunAB}
        />
      </section>

      {!hasRawJson ? (
        <section className="decisionPrerequisiteNotice">
          <div className="prerequisiteCard">
            <h3>Decision Flow 사용 안내</h3>
            <p>
              저장된 Benchmark를 불러오거나 Decision Execution을 수동으로 실행하는 기능은 지금도 사용할 수 있습니다.
              다만 <strong>rawJson을 불러오면 기사 기반 scenario가 더 풍부해지고</strong>,
              <strong> decision handoff를 rawJson에 직접 합치는 기능</strong>도 사용할 수 있습니다.
            </p>
          </div>
        </section>
      ) : null}

      <ProducerFlowPanel disabled={!hasRawJson} />
      <DecisionBenchmarkPanel
        decisionModelSettings={decisionModelSettings}
        onApplySuggestedSettings={handleApplyDecisionSuggestedSettings}
        currentArticleBenchmark={currentArticleBenchmark}
        externalBenchmarks={savedDecisionBenchmarks}
        deferInitialLoad
      />
      <WorkflowMermaidPanel disabled={!hasRawJson} />
      <DecisionExecutionPanel
        decisionModelSettings={decisionModelSettings}
        defaultTask={analysisPrompt}
        defaultBackground={newsUrl ? `기사 URL: ${newsUrl}` : ""}
        defaultContext={rawJson ? ["현재 rawJson이 로드되어 있음", `입력 길이: ${rawJson.length} chars`] : []}
        onApplyInsightHandoff={handleApplyDecisionInsightHandoff}
        onBenchmarkCreated={handleBenchmarkCreated}
        deferInitialLoad
      />

      <PipelineDiagram activeTab={activeTab} setActiveTab={setActiveTab} searchRounds={searchRounds} stageRecords={stageRecords} />

      <StageWorkbench
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tunedStages={tunedStages}
        stageRecords={stageRecords}
        stageConfigs={stageConfigs}
        searchRounds={searchRounds}
        runningStage={runningStage}
        isRunning={isRunning}
        activeStage={activeStage}
        rawJson={rawJson}
        commonModel={commonModel}
        commonCustomModel={commonCustomModel}
        commonTemperature={commonTemperature}
        commonMaxTokens={commonMaxTokens}
        effectiveCommonModel={effectiveCommonModel}
        systemPrompt={systemPrompt}
        evaluatingStage={evaluatingStage}
        stageEvaluations={stageEvaluations}
        searchR1Config={searchR1Config}
        setSearchR1Config={setSearchR1Config}
        searchR2Config={searchR2Config}
        setSearchR2Config={setSearchR2Config}
        updateStageConfig={updateStageConfig}
        handleStageModelChange={handleStageModelChange}
        resetStageOverride={resetStageOverride}
        handleRunStage={handleRunStage}
        handleEvaluateStage={handleEvaluateStage}
        applyCommonToAll={applyCommonToAll}
        resetAllOverrides={resetAllOverrides}
      />

      <div className="stack">
        {error ? (
          <section className="resultCard">
            <div className="resultHeader"><h2 className="resultTitle">Run Error</h2><span className="statusBadge status-error">Error</span></div>
            <p className="errorText">{error}</p>
          </section>
        ) : null}

        <SearchRoundsLog searchRounds={searchRounds} />

        <section className="resultCard">
          <div className="resultHeader">
            <h2 className="resultTitle">Final Output</h2>
            <span className="statusBadge status-success">{deferredFinalResult?.finalOutput ? "Ready" : "Pending"}</span>
            {qualityMetrics ? <QualityDashboard metrics={qualityMetrics} /> : null}
          </div>

          {deferredFinalResult?.finalOutput ? (
            <div className="resultGrid">
              {previousResult && finalOutputComparison ? <AnalysisHistory history={analysisHistory} historySearch={historySearch} setHistorySearch={setHistorySearch} onLoad={loadAnalysis} title="분석 이력" open compact /> : null}
              <FinalOutputPanel finalOutput={deferredFinalResult.finalOutput} mode={deferredFinalResult.finalOutput.mode} />
              <OutputEditor
                editableMarkdown={editableMarkdown}
                setEditableMarkdown={setEditableMarkdown}
                userNotes={userNotes}
                setUserNotes={setUserNotes}
                outputTemplate={outputTemplate}
                setOutputTemplate={setOutputTemplate}
                handleCopy={handleCopy}
                copyFeedback={copyFeedback}
              />
            </div>
          ) : (
            <div className="panelLead">결과가 아직 없습니다. 샘플을 선택하고 실행하면 이 영역에 최종 구조화 출력이 표시됩니다.</div>
          )}
        </section>

        <section className="resultCard">
          <button type="button" className="resultHeader resultHeaderToggle" onClick={() => setInputSnapshotOpen((prev) => !prev)} aria-expanded={inputSnapshotOpen}>
            <h2 className="resultTitle">Current Input Snapshot</h2>
            <span className="statusBadge status-running">{inputSnapshotOpen ? "▲ Collapse" : "▶ Debug"}</span>
          </button>
          {inputSnapshotOpen ? <pre className="codeBlock">{deferredRawJson}</pre> : null}
        </section>
      </div>

      <section className="resultCard">
        <AnalysisHistory history={analysisHistory} historySearch={historySearch} setHistorySearch={setHistorySearch} onLoad={loadAnalysis} title="분석 이력" />
      </section>
    </main>
  );
}
