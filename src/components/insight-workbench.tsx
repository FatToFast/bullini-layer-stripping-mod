"use client";

import { startTransition, useEffect, useMemo } from "react";

import {
  runInsightApiStream,
  fetchArticleText,
  structureWithLlm,
  evaluateStage,
  type ExtractModelSettings,
} from "@/lib/insight/api";
import { CUSTOM_MODEL_VALUE, MODEL_GROUPS, TUNABLE_STAGES } from "@/lib/insight/model-catalog";
import { DEFAULT_STAGE_PROMPTS } from "@/lib/insight/prompts";
import { STAGE_LABELS } from "@/lib/insight/stage-labels";
import type {
  CachedStageResults,
  InsightStageName,
  PipelineModelSettings,
  StageStatus,
} from "@/lib/insight/types";
import { ABComparison } from "@/components/insight/ab-comparison";
import { AnalysisHistory } from "@/components/insight/analysis-history";
import { FinalOutputPanel } from "@/components/insight/final-output-panel";
import { OutputEditor } from "@/components/insight/output-editor";
import { PipelineDiagram } from "@/components/insight/pipeline-diagram";
import { QualityDashboard } from "@/components/insight/quality-dashboard";
import { SearchRoundsLog } from "@/components/insight/search-rounds-log";
import { StageWorkbench } from "@/components/insight/stage-workbench";
import {
  OUTPUT_STAGE_TOKENS,
  buildInitialStageConfigs,
  type SampleItem,
  type StageUiConfig,
  usePipelineState,
} from "@/hooks/use-pipeline-state";
import {
  getEventIdFromRawJson,
  readStoredAnalysis,
  useAnalysisStorage,
} from "@/hooks/use-analysis-storage";
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

const TOKEN_PRESETS = [1200, 1800, 2500, 4000];
const PRESETS = {
  deep: { temperature: 0.3, maxTokens: 8192, label: "Deep" },
  balanced: { temperature: 0.5, maxTokens: 4096, label: "Balanced" },
  quick: { temperature: 0.7, maxTokens: 2048, label: "Quick" },
} as const;
const MODEL_NOTE_LOOKUP = new Map(
  MODEL_GROUPS.flatMap((group) => group.options.map((option) => [option.value, option.note] as const))
);

function isKnownModel(model: string) {
  return MODEL_NOTE_LOOKUP.has(model);
}

function getSelectValue(model: string) {
  return isKnownModel(model) ? model : CUSTOM_MODEL_VALUE;
}

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
  const qualityMetrics = useQualityMetrics(deferredFinalResult?.finalOutput ?? null, stageRecords);

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
    };
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
    setCommonTemperature(PRESETS[nextPreset].temperature);
    setCommonMaxTokens(PRESETS[nextPreset].maxTokens);
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
    setExtractPhase("fetching");
    setExtractError(null);
    setFetchedText(null);
    setError(null);

    try {
      const fetchResult = await fetchArticleText(newsUrl.trim());
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
        extractSettings
      );

      if ("error" in structureResult) {
        setExtractError(structureResult.error);
        setExtractPhase("error");
        return;
      }

      setRawJson(JSON.stringify(structureResult.dataset, null, 2));
      setExtractPhase("done");
    } catch (caughtError) {
      setExtractError(caughtError instanceof Error ? caughtError.message : "URL 분석에 실패했습니다.");
      setExtractPhase("error");
    }
  }

  function resetExtraction() {
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
    options?: { applyFinalResult?: boolean; persistResult?: boolean; updatePreviousResult?: boolean }
  ) {
    const applyFinalResult = options?.applyFinalResult ?? true;
    const persistResult = options?.persistResult ?? true;
    const updatePreviousResult = options?.updatePreviousResult ?? true;
    const eventId = getEventIdFromRawJson(rawJson);

    if (updatePreviousResult) {
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
          startTransition(() => {
            setActiveStage(stage);
            setStageRecords((prev) => {
              const existing = prev.find((record) => record.stage === stage);
              if (existing) return prev;
              return [...prev, { stage, status: "running", input: null }];
            });
          });
        },
        onStageComplete: (record) => {
          startTransition(() => {
            setActiveStage(record.stage);
            setStageRecords((prev) => {
              const next = prev.filter((item) => item.stage !== record.stage);
              return [...next, record];
            });
          });
        },
        onSearchStart: (round, queries) => {
          startTransition(() => {
            setSearchRounds((prev) => [...prev.filter((item) => item.round !== round), { round, queries, results: [] }]);
          });
        },
        onSearchComplete: (round, results, searchError) => {
          startTransition(() => {
            setSearchRounds((prev) => [
              ...prev.filter((item) => item.round !== round),
              {
                round,
                queries: prev.find((item) => item.round === round)?.queries ?? [],
                results,
                error: searchError,
              },
            ]);
          });
        },
        onComplete: (completed) => {
          startTransition(() => {
            if (applyFinalResult) {
              setFinalResult(completed);
            }
            setActiveStage(null);
          });
        },
        onError: (message) => {
          startTransition(() => setError(message));
        },
      },
      searchProvider,
      undefined,
      undefined,
      systemPrompt !== defaultSystemPrompt ? systemPrompt : undefined,
      buildSearchConfigs()
    );

    if (applyFinalResult) {
      setFinalResult(result);
    }
    if (persistResult && result.finalOutput) {
      saveAnalysis(result.finalOutput);
    }

    return result;
  }

  async function handleRun() {
    setIsRunning(true);
    setAbResult(null);
    try {
      await runFullPipeline(buildModelSettings());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "분석 실행에 실패했습니다.");
    } finally {
      setIsRunning(false);
      setActiveStage(null);
    }
  }

  async function handleRunAB() {
    if (!abStage || !abPromptOverride.trim()) return;

    setAbRunning(true);
    setIsRunning(true);
    setAbResult(null);

    try {
      const resultA = await runFullPipeline(buildModelSettings());
      const variantConfigs = {
        ...stageConfigs,
        [abStage]: {
          ...stageConfigs[abStage],
          enabled: true,
          prompt: abPromptOverride,
        },
      };

      const resultB = await runFullPipeline(buildModelSettings(variantConfigs), {
        applyFinalResult: false,
        persistResult: false,
        updatePreviousResult: false,
      });
      setAbResult(resultB);
      setFinalResult(resultA);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "A/B 비교 실행에 실패했습니다.");
    } finally {
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
    setRunningStage(targetStage);
    setError(null);
    setActiveStage(targetStage);

    try {
      const result = await runInsightApiStream(
        rawJson,
        buildModelSettings(),
        {
          onStageStart: (stage) => {
            startTransition(() => {
              setActiveStage(stage);
              setStageRecords((prev) => {
                const existing = prev.find((record) => record.stage === stage);
                if (existing) {
                  return prev.map((record) =>
                    record.stage === stage ? { ...record, status: "running" as StageStatus } : record
                  );
                }
                return [...prev, { stage, status: "running" as StageStatus, input: null }];
              });
            });
          },
          onStageComplete: (record) => {
            startTransition(() => {
              setActiveStage(record.stage);
              setStageRecords((prev) => {
                const next = prev.filter((item) => item.stage !== record.stage);
                return [...next, record];
              });
            });
          },
          onSearchStart: (round, queries) => {
            startTransition(() => {
              setSearchRounds((prev) => [...prev.filter((item) => item.round !== round), { round, queries, results: [] }]);
            });
          },
          onSearchComplete: (round, results, searchError) => {
            startTransition(() => {
              setSearchRounds((prev) => [
                ...prev.filter((item) => item.round !== round),
                {
                  round,
                  queries: prev.find((item) => item.round === round)?.queries ?? [],
                  results,
                  error: searchError,
                },
              ]);
            });
          },
          onComplete: (completed) => {
            startTransition(() => {
              if (completed.finalOutput) setFinalResult(completed);
              setActiveStage(null);
            });
          },
          onError: (message) => {
            startTransition(() => setError(message));
          },
        },
        searchProvider,
        targetStage,
        buildCachedResults(),
        systemPrompt !== defaultSystemPrompt ? systemPrompt : undefined,
        buildSearchConfigs()
      );

      if (result?.finalOutput) setFinalResult(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Stage 실행에 실패했습니다.");
    } finally {
      setRunningStage(null);
      setActiveStage(null);
    }
  }

  async function handleEvaluateStage(stage: InsightStageName) {
    const record = stageRecords.find((item) => item.stage === stage);
    if (!record?.output) return;

    setEvaluatingStage(stage);
    const config = stageConfigs[stage];
    const stagePrompt = config.enabled ? config.prompt : DEFAULT_STAGE_PROMPTS[stage];
    const fullPrompt = `${systemPrompt}\n\n${stagePrompt}`;
    const outputStr = typeof record.output === "string" ? record.output : JSON.stringify(record.output, null, 2);

    const result = await evaluateStage(fullPrompt, outputStr, {
      model: getEffectiveModel(commonModel, commonCustomModel),
      temperature: 0.1,
      maxTokens: 3000,
    });

    if ("error" in result) {
      setError(result.error);
    } else {
      setStageEvaluations((prev) => ({ ...prev, [stage]: result }));
    }
    setEvaluatingStage(null);
  }

  function handleCopy() {
    const output = deferredFinalResult?.finalOutput;
    if (!output) return;

    let textToCopy = "";
    if (outputTemplate === "full") {
      textToCopy = editableMarkdown;
    } else if (outputTemplate === "summary") {
      const portfolioImpactSummary = output.portfolioImpactTable
        .map((row) => `${row.company} (${row.exposureType}): ${row.whatChangesToday}`)
        .join("\n");
      textToCopy = `${output.oneLineTake}\n\n${output.structuralRead}\n\n${portfolioImpactSummary}`;
    } else {
      textToCopy = `${output.oneLineTake} #투자분석`;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyFeedback("복사됨!");
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCard">
          <span className="kicker">Standalone Localhost App</span>
          <h1 className="heroTitle">Layer-Stripping Workbench</h1>
          <p className="heroText">프롬프트 → 글 생성 → 편집 → 내보내기 → 리콜 워크플로우를 시험하는 콘솔입니다.</p>
        </div>
        <div className="heroMeta">
          <div className="metaPill">
            <span className="metaLabel">LLM Provider</span>
            <div className="metaValue">{providerLabel}</div>
          </div>
          <div className="metaPill">
            <span className="metaLabel">Search</span>
            <div className="metaValue">{searchProviders.find((provider) => provider.kind === searchProvider)?.label ?? "None"}</div>
          </div>
          <div className="metaPill">
            <span className="metaLabel">Model</span>
            <div className="metaValue">{effectiveCommonModel}</div>
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <h2 className="panelTitle">Run Profile</h2>
          <p className="panelLead">공통 설정을 기준으로 전체 단계를 돌리고, 필요한 단계만 별도 모델 프로필을 씌울 수 있습니다.</p>

          <div className="urlAnalysisForm">
            <div className="configCard">
              <label className="fieldShell">
                <span className="fieldLabel">News URL</span>
                <input
                  className="textInput urlInput"
                  type="url"
                  value={newsUrl}
                  onChange={(event) => setNewsUrl(event.target.value)}
                  placeholder="https://news.example.com/article/..."
                  disabled={extractPhase === "fetching" || extractPhase === "structuring"}
                />
              </label>

              <label className="fieldShell" style={{ marginTop: 14 }}>
                <span className="fieldLabel">Analysis Prompt</span>
                <textarea
                  className="promptInput"
                  value={analysisPrompt}
                  onChange={(event) => setAnalysisPrompt(event.target.value)}
                  placeholder="이 뉴스를 어떤 관점으로 분석할지 입력하세요..."
                  rows={4}
                  disabled={extractPhase === "fetching" || extractPhase === "structuring"}
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="extractSteps">
              <div className={`extractStep ${extractPhase === "fetching" ? "extractStepActive" : ""} ${fetchedText ? "extractStepDone" : ""}`}>
                <div className="extractStepHeader">
                  <span className="extractStepNumber">1</span>
                  <span className="extractStepLabel">URL Fetch</span>
                  {extractPhase === "fetching" ? <span className="statusBadge status-running">Fetching...</span> : null}
                  {fetchedText ? (
                    <span className="statusBadge status-success">
                      {fetchedText.charCount.toLocaleString()} chars
                      {fetchedText.truncated ? ` (truncated from ${fetchedText.originalCharCount.toLocaleString()})` : ""}
                    </span>
                  ) : null}
                </div>
                {fetchedText ? <pre className="extractPreview">{fetchedText.text.slice(0, 800)}{fetchedText.text.length > 800 ? "\n\n..." : ""}</pre> : null}
              </div>

              <div className={`extractStep ${extractPhase === "structuring" ? "extractStepActive" : ""} ${extractPhase === "done" ? "extractStepDone" : ""}`}>
                <div className="extractStepHeader">
                  <span className="extractStepNumber">2</span>
                  <span className="extractStepLabel">LLM Structuring</span>
                  {extractPhase === "structuring" ? <span className="statusBadge status-running">{effectiveCommonModel} · temp {commonTemperature.toFixed(1)}</span> : null}
                  {extractPhase === "done" ? <span className="statusBadge status-success">Done</span> : null}
                </div>
                {extractPhase === "done" ? <pre className="extractPreview">{rawJson.slice(0, 600)}{rawJson.length > 600 ? "\n\n..." : ""}</pre> : null}
              </div>
            </div>

            {extractError ? <div className="extractErrorCard"><span className="errorText">{extractError}</span></div> : null}

            <div className="actions">
              <button
                type="button"
                className="primaryButton"
                onClick={handleExtract}
                disabled={extractPhase === "fetching" || extractPhase === "structuring" || !newsUrl.trim()}
              >
                {extractPhase === "fetching" ? "Fetching URL..." : extractPhase === "structuring" ? "Structuring..." : "Extract & Structure"}
              </button>
              {extractPhase === "done" || extractPhase === "error" ? <button type="button" className="secondaryButton" onClick={resetExtraction}>Reset</button> : null}
            </div>
          </div>

          <div className="searchProviderRow">
            <label className="fieldShell">
              <span className="fieldLabel">Search Provider</span>
              <div className="searchProviderOptions">
                {searchProviders.map((provider) => (
                  <button
                    key={provider.kind}
                    type="button"
                    className={`searchProviderPill ${searchProvider === provider.kind ? "searchProviderPillActive" : ""} ${!provider.configured ? "searchProviderPillDisabled" : ""}`}
                    onClick={() => provider.configured && setSearchProvider(provider.kind)}
                    disabled={!provider.configured}
                    title={provider.configured ? provider.label : `${provider.label} — API key not configured`}
                  >
                    {provider.label}
                    {!provider.configured ? <span className="unconfiguredDot" /> : null}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <div className="configCard">
            <div className="promptLabelRow" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <span className="fieldLabel">Parameter Preset</span>
              {(["deep", "balanced", "quick", "custom"] as const).map((presetOption) => (
                <button
                  key={presetOption}
                  type="button"
                  className={`miniButton ${preset === presetOption ? "summaryPillAccent" : ""}`}
                  onClick={() => handlePresetChange(presetOption)}
                >
                  {presetOption === "custom" ? "Custom" : PRESETS[presetOption].label}
                </button>
              ))}
            </div>

            {preset !== "custom" ? <div className="hintText" style={{ marginBottom: 12 }}>{`Preset: ${PRESETS[preset].label} (temp ${PRESETS[preset].temperature}, tokens ${PRESETS[preset].maxTokens})`}</div> : null}

            <div className="profileGrid">
              <label className="fieldShell">
                <span className="fieldLabel">Common Model</span>
                <select className="selectInput" value={getSelectValue(commonModel)} onChange={(event) => handleCommonModelChange(event.target.value)}>
                  {MODEL_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={CUSTOM_MODEL_VALUE}>Custom model id...</option>
                </select>
              </label>

              <label className="fieldShell">
                <span className="fieldLabel">Temperature</span>
                <div className="rangeRow">
                  <input type="range" min="0" max="1.5" step="0.1" value={commonTemperature} onChange={(event) => handleCommonTemperatureChange(Number(event.target.value))} />
                  <input type="number" min="0" max="1.5" step="0.1" className="textInput" value={commonTemperature} onChange={(event) => handleCommonTemperatureChange(Number(event.target.value))} />
                </div>
              </label>

              <label className="fieldShell">
                <span className="fieldLabel">Max Tokens</span>
                <input type="number" min="256" max="16000" step="100" className="textInput" value={commonMaxTokens} onChange={(event) => handleCommonMaxTokensChange(Number(event.target.value))} />
              </label>
            </div>

            {getSelectValue(commonModel) === CUSTOM_MODEL_VALUE ? (
              <label className="fieldShell">
                <span className="fieldLabel">Custom Common Model Id</span>
                <input className="textInput" value={commonCustomModel} onChange={(event) => setCommonCustomModel(event.target.value)} placeholder="meta-llama/llama-4-maverick" />
              </label>
            ) : null}

            <div className="presetRow">
              {TOKEN_PRESETS.map((tokenPreset) => (
                <button key={tokenPreset} type="button" className={`tokenPill ${commonMaxTokens === tokenPreset ? "tokenPillActive" : ""}`} onClick={() => handleCommonMaxTokensChange(tokenPreset)}>
                  {tokenPreset}
                </button>
              ))}
            </div>

            <div className="profileSummary">
              <span className="summaryPill">{tunedStages.length} LLM stages</span>
              <span className="summaryPill">{overrideCount} overridden</span>
              <span className="summaryPill">{effectiveCommonModel}</span>
              <span className="summaryPill">temp {commonTemperature.toFixed(1)}</span>
              <span className="summaryPill">tokens {commonMaxTokens}</span>
            </div>

            <div className="hintText">{MODEL_NOTE_LOOKUP.get(effectiveCommonModel) ?? "커스텀 모델 ID를 직접 입력해 사용할 수 있습니다."}</div>
          </div>

          <div className="configCard systemPromptCard">
            <button type="button" className="sectionHeader systemPromptToggle" onClick={() => setSystemPromptOpen((prev) => !prev)} aria-expanded={systemPromptOpen}>
              <div>
                <h3 className="sectionTitle">System Prompt</h3>
                <p className="panelLead">모든 Stage에 공통 적용되는 시스템 프롬프트입니다. 수정하면 전체 파이프라인 결과가 바뀝니다.</p>
              </div>
              <div className="systemPromptBadges">
                {systemPrompt !== defaultSystemPrompt ? <span className="statusBadge status-running">Modified</span> : <span className="statusBadge status-success">Default</span>}
                <span className="statusBadge status-running">{systemPromptOpen ? "▲ Collapse" : "▶ Expand"}</span>
              </div>
            </button>
            {systemPromptOpen ? (
              <div className="systemPromptBody">
                <textarea className="promptInput systemPromptInput" value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} spellCheck={false} rows={12} />
                <div className="systemPromptActions">
                  {systemPrompt !== defaultSystemPrompt ? <button type="button" className="miniButton" onClick={() => setSystemPrompt(defaultSystemPrompt)}>Reset to Default</button> : null}
                  <span className="hintText">{systemPrompt.length} chars</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="actions">
            <button
              type="button"
              className="primaryButton"
              onClick={abMode ? handleRunAB : handleRun}
              disabled={isRunning || abRunning || !rawJson.trim() || (abMode && (!abStage || !abPromptOverride.trim()))}
            >
              {isRunning || abRunning ? "Running..." : abMode ? "Run A/B" : "Run Pipeline"}
            </button>
            <span className="statusLine">{activeStage ? `Active stage: ${STAGE_LABELS[activeStage]}` : "Idle"}</span>
          </div>

          <ABComparison
            abMode={abMode}
            setAbMode={setAbMode}
            abStage={abStage}
            setAbStage={setAbStage}
            abPromptOverride={abPromptOverride}
            setAbPromptOverride={setAbPromptOverride}
            stageConfigs={stageConfigs}
            tunedStages={tunedStages}
            finalResult={deferredFinalResult}
            abResult={abResult}
          />
        </div>

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
              <div className="resultHeader">
                <h2 className="resultTitle">Run Error</h2>
                <span className="statusBadge status-error">Error</span>
              </div>
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
                {previousResult && finalOutputComparison ? (
                  <AnalysisHistory history={analysisHistory} historySearch={historySearch} setHistorySearch={setHistorySearch} onLoad={loadAnalysis} title="분석 이력" open compact />
                ) : null}

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
      </section>
    </main>
  );
}
