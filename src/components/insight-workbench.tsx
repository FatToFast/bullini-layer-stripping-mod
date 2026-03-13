"use client";

import { useDeferredValue, useMemo, useState, startTransition } from "react";
import {
  runInsightApiStream,
  fetchArticleText,
  structureWithLlm,
  evaluateOutput,
  type ExtractModelSettings,
  type FetchTextResult,
} from "@/lib/insight/api";
import {
  CUSTOM_MODEL_VALUE,
  MODEL_GROUPS,
  TUNABLE_STAGES,
} from "@/lib/insight/model-catalog";
import { STAGE_LABELS, STAGE_DESCRIPTIONS, STAGE_ORDER } from "@/lib/insight/stage-labels";
import { DEFAULT_STAGE_PROMPTS } from "@/lib/insight/prompts";
import type {
  CachedStageResults,
  InsightRunResult,
  InsightStageName,
  PipelineModelSettings,
  StageRecord,
  StageStatus,
  EvaluationResult,
} from "@/lib/insight/types";

type InputMode = "url" | "json";
type ExtractPhase = "idle" | "fetching" | "previewing" | "structuring" | "done" | "error";

type SampleItem = {
  key: string;
  label: string;
  rawJson: string;
};

type SearchRoundState = {
  round: 1 | 2;
  queries: string[];
  results: unknown[];
  error?: string;
};

type StageUiConfig = {
  enabled: boolean;
  expanded: boolean;
  model: string;
  customModel: string;
  temperature: number;
  maxTokens: number;
  prompt: string;
};

type SearchProviderOption = {
  kind: string;
  label: string;
  configured: boolean;
};

type Props = {
  defaultModel: string;
  providerLabel: string;
  searchProviders: SearchProviderOption[];
  samples: SampleItem[];
};

const statusLabel: Record<StageStatus, string> = {
  idle: "Idle",
  running: "Running",
  success: "Success",
  error: "Error",
  insufficient_evidence: "Insufficient",
};

const TOKEN_PRESETS = [1200, 1800, 2500, 4000];
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 1800;
const OUTPUT_STAGE_TOKENS = 4000;
const MODEL_NOTE_LOOKUP = new Map(
  MODEL_GROUPS.flatMap((group) => group.options.map((option) => [option.value, option.note] as const))
);

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function isKnownModel(model: string) {
  return MODEL_NOTE_LOOKUP.has(model);
}

function getSelectValue(model: string) {
  return isKnownModel(model) ? model : CUSTOM_MODEL_VALUE;
}

function getEffectiveModel(model: string, customModel: string) {
  return model === CUSTOM_MODEL_VALUE ? customModel.trim() : model;
}

function buildInitialStageConfigs(
  defaultModel: string,
  defaultTemperature = DEFAULT_TEMPERATURE,
  defaultMaxTokens = DEFAULT_MAX_TOKENS
): Record<InsightStageName, StageUiConfig> {
  const base = (stage: InsightStageName, overrides?: Partial<StageUiConfig>): StageUiConfig => ({
    enabled: false,
    expanded: false,
    model: defaultModel,
    customModel: isKnownModel(defaultModel) ? "" : defaultModel,
    temperature: defaultTemperature,
    maxTokens: defaultMaxTokens,
    prompt: DEFAULT_STAGE_PROMPTS[stage],
    ...overrides,
  });

  return {
    input_validation: base("input_validation"),
    layer0_layer1: base("layer0_layer1"),
    event_classification: base("event_classification"),
    layer2_reverse_paths: base("layer2_reverse_paths"),
    layer3_adjacent_spillover: base("layer3_adjacent_spillover"),
    portfolio_impact: base("portfolio_impact"),
    layer4_time_horizon: base("layer4_time_horizon"),
    layer5_structural_premortem: base("layer5_structural_premortem"),
    evidence_consolidation: base("evidence_consolidation"),
    output_formatting: base("output_formatting", { enabled: true, expanded: true, maxTokens: OUTPUT_STAGE_TOKENS }),
  };
}

export function InsightWorkbench({ defaultModel, providerLabel, searchProviders, samples }: Props) {
  const defaultSample = samples[0];
  const [selectedSample, setSelectedSample] = useState(defaultSample?.key ?? "");
  const [rawJson, setRawJson] = useState(defaultSample?.rawJson ?? "");
  const [commonModel, setCommonModel] = useState(defaultModel);
  const [commonCustomModel, setCommonCustomModel] = useState(isKnownModel(defaultModel) ? "" : defaultModel);
  const [commonTemperature, setCommonTemperature] = useState(DEFAULT_TEMPERATURE);
  const [commonMaxTokens, setCommonMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [stageConfigs, setStageConfigs] = useState<Record<InsightStageName, StageUiConfig>>(
    buildInitialStageConfigs(defaultModel, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS)
  );
  const [isRunning, setIsRunning] = useState(false);
  const [stageRecords, setStageRecords] = useState<StageRecord[]>([]);
  const [searchRounds, setSearchRounds] = useState<SearchRoundState[]>([]);
  const [finalResult, setFinalResult] = useState<InsightRunResult | null>(null);
  const [activeStage, setActiveStage] = useState<InsightStageName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [newsUrl, setNewsUrl] = useState("");
  const [analysisPrompt, setAnalysisPrompt] = useState(
    "이 뉴스가 내 포트폴리오에 미치는 영향을 분석해주세요."
  );
  const [searchProvider, setSearchProvider] = useState("noop");
  const [extractPhase, setExtractPhase] = useState<ExtractPhase>("idle");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [fetchedText, setFetchedText] = useState<FetchTextResult | null>(null);
  const [expectedResult, setExpectedResult] = useState("");
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [inputSnapshotOpen, setInputSnapshotOpen] = useState(false);
  const [runningStage, setRunningStage] = useState<InsightStageName | null>(null);
  const [activeTab, setActiveTab] = useState<InsightStageName>("layer0_layer1");

  const deferredRawJson = useDeferredValue(rawJson);
  const deferredFinalResult = useDeferredValue(finalResult);

  const sampleLookup = useMemo(
    () => new Map(samples.map((sample) => [sample.key, sample])),
    [samples]
  );

  const effectiveCommonModel = getEffectiveModel(commonModel, commonCustomModel);
  const orderedStageRecords = useMemo(
    () =>
      [...stageRecords].sort(
        (left, right) => STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage)
      ),
    [stageRecords]
  );
  const tunedStages = useMemo(() => TUNABLE_STAGES.filter((stage) => stage !== "input_validation"), []);
  const overrideCount = tunedStages.filter((stage) => stageConfigs[stage].enabled).length;

  function buildModelSettings(): PipelineModelSettings {
    const stages = Object.fromEntries(
      tunedStages
        .filter((stage) => stageConfigs[stage].enabled)
        .map((stage) => {
          const config = stageConfigs[stage];
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
    updateStageConfig(stage, (current) => ({
      ...current,
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

  function expandCustomizedOnly() {
    setStageConfigs((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([stage, config]) => [
          stage,
          {
            ...config,
            expanded: config.enabled && stage !== "input_validation",
          },
        ])
      ) as Record<InsightStageName, StageUiConfig>
    );
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

      const json = JSON.stringify(structureResult.dataset, null, 2);
      setRawJson(json);
      setExtractPhase("done");
    } catch (caughtError) {
      setExtractError(
        caughtError instanceof Error ? caughtError.message : "URL 분석에 실패했습니다."
      );
      setExtractPhase("error");
    }
  }

  function resetExtraction() {
    setExtractPhase("idle");
    setExtractError(null);
    setFetchedText(null);
  }

  async function runEvaluation(pipelineOutput: string) {
    if (!expectedResult.trim()) return;
    setIsEvaluating(true);
    setEvaluationResult(null);
    try {
      const evalResult = await evaluateOutput(
        pipelineOutput,
        expectedResult.trim(),
        {
          model: effectiveCommonModel,
          temperature: commonTemperature,
          maxTokens: commonMaxTokens,
        }
      );
      if ("error" in evalResult) {
        setError((prev) => prev ? `${prev}\nEvaluation: ${evalResult.error}` : `Evaluation: ${evalResult.error}`);
      } else {
        setEvaluationResult(evalResult);
      }
    } catch (evalError) {
      setError((prev) => {
        const msg = evalError instanceof Error ? evalError.message : "Evaluation failed";
        return prev ? `${prev}\nEvaluation: ${msg}` : `Evaluation: ${msg}`;
      });
    } finally {
      setIsEvaluating(false);
    }
  }

  async function handleRun() {
    setIsRunning(true);
    setError(null);
    setActiveStage("input_validation");
    setStageRecords([]);
    setSearchRounds([]);
    setFinalResult(null);
    setEvaluationResult(null);

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
              setSearchRounds((prev) => [
                ...prev.filter((item) => item.round !== round),
                { round, queries, results: [] },
              ]);
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
              setFinalResult(completed);
              setActiveStage(null);
            });
          },
          onError: (message) => {
            startTransition(() => setError(message));
          },
        },
        searchProvider
      );

      setFinalResult(result);

      if (result?.finalOutput && expectedResult.trim()) {
        const outputStr = JSON.stringify(result.finalOutput, null, 2);
        void runEvaluation(outputStr);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "분석 실행에 실패했습니다.");
    } finally {
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
                const existing = prev.find((r) => r.stage === stage);
                if (existing) {
                  return prev.map((r) => r.stage === stage ? { ...r, status: "running" as StageStatus } : r);
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
              setSearchRounds((prev) => [
                ...prev.filter((item) => item.round !== round),
                { round, queries, results: [] },
              ]);
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
        buildCachedResults()
      );

      if (result?.finalOutput) setFinalResult(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Stage 실행에 실패했습니다.");
    } finally {
      setRunningStage(null);
      setActiveStage(null);
    }
  }

  function handleSampleChange(sampleKey: string) {
    const next = sampleLookup.get(sampleKey);
    if (!next) return;
    setSelectedSample(sampleKey);
    setRawJson(next.rawJson);
    setError(null);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCard">
          <span className="kicker">Standalone Localhost App</span>
          <h1 className="heroTitle">Layer-Stripping Analysis Workbench</h1>
          <p className="heroText">
            공통 모델 프로필과 단계별 override를 동시에 다루는 실행 콘솔입니다. OpenRouter 주요 모델을
            드롭다운으로 고르고, 필요한 단계만 별도 모델과 온도, 토큰 수를 조정할 수 있습니다.
          </p>
        </div>
        <div className="heroMeta">
          <div className="metaPill">
            <span className="metaLabel">LLM Provider</span>
            <div className="metaValue">{providerLabel}</div>
          </div>
          <div className="metaPill">
            <span className="metaLabel">Search</span>
            <div className="metaValue">
              {searchProviders.find((p) => p.kind === searchProvider)?.label ?? "None"}
            </div>
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
          <p className="panelLead">
            공통 설정을 기준으로 전체 단계를 돌리고, 필요한 단계만 별도 모델 프로필을 씌울 수 있습니다.
          </p>

          <div className="inputModeTabs">
            <button
              type="button"
              className={`inputModeTab ${inputMode === "url" ? "inputModeTabActive" : ""}`}
              onClick={() => setInputMode("url")}
            >
              URL Analysis
            </button>
            <button
              type="button"
              className={`inputModeTab ${inputMode === "json" ? "inputModeTabActive" : ""}`}
              onClick={() => setInputMode("json")}
            >
              JSON Direct Input
            </button>
          </div>

          {inputMode === "url" ? (
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
                    {extractPhase === "fetching" ? (
                      <span className="statusBadge status-running">Fetching...</span>
                    ) : null}
                    {fetchedText ? (
                      <span className="statusBadge status-success">
                        {fetchedText.charCount.toLocaleString()} chars
                        {fetchedText.truncated ? ` (truncated from ${fetchedText.originalCharCount.toLocaleString()})` : ""}
                      </span>
                    ) : null}
                  </div>
                  {fetchedText ? (
                    <pre className="extractPreview">{fetchedText.text.slice(0, 800)}{fetchedText.text.length > 800 ? "\n\n..." : ""}</pre>
                  ) : null}
                </div>

                <div className={`extractStep ${extractPhase === "structuring" ? "extractStepActive" : ""} ${extractPhase === "done" ? "extractStepDone" : ""}`}>
                  <div className="extractStepHeader">
                    <span className="extractStepNumber">2</span>
                    <span className="extractStepLabel">LLM Structuring</span>
                    {extractPhase === "structuring" ? (
                      <span className="statusBadge status-running">
                        {effectiveCommonModel} · temp {commonTemperature.toFixed(1)}
                      </span>
                    ) : null}
                    {extractPhase === "done" ? (
                      <span className="statusBadge status-success">Done</span>
                    ) : null}
                  </div>
                  {extractPhase === "done" ? (
                    <pre className="extractPreview">{rawJson.slice(0, 600)}{rawJson.length > 600 ? "\n\n..." : ""}</pre>
                  ) : null}
                </div>
              </div>

              {extractError ? (
                <div className="extractErrorCard">
                  <span className="errorText">{extractError}</span>
                </div>
              ) : null}

              <div className="actions">
                <button
                  type="button"
                  className="primaryButton"
                  onClick={handleExtract}
                  disabled={extractPhase === "fetching" || extractPhase === "structuring" || !newsUrl.trim()}
                >
                  {extractPhase === "fetching" ? "Fetching URL..." : extractPhase === "structuring" ? "Structuring..." : "Extract & Structure"}
                </button>
                {extractPhase === "done" || extractPhase === "error" ? (
                  <button type="button" className="secondaryButton" onClick={resetExtraction}>
                    Reset
                  </button>
                ) : null}
                {extractPhase === "done" ? (
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => setInputMode("json")}
                  >
                    View Full JSON
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {inputMode === "json" ? (
          <div className="sampleList">
            {samples.map((sample) => (
              <button
                key={sample.key}
                type="button"
                className={`sampleButton ${selectedSample === sample.key ? "sampleButtonActive" : ""}`}
                onClick={() => handleSampleChange(sample.key)}
              >
                {sample.label}
              </button>
            ))}
          </div>
          ) : null}

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
            <div className="profileGrid">
              <label className="fieldShell">
                <span className="fieldLabel">Common Model</span>
                <select
                  className="selectInput"
                  value={getSelectValue(commonModel)}
                  onChange={(event) => handleCommonModelChange(event.target.value)}
                >
                  {MODEL_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={CUSTOM_MODEL_VALUE}>Custom model id...</option>
                </select>
              </label>

              <label className="fieldShell">
                <span className="fieldLabel">Temperature</span>
                <div className="rangeRow">
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.1"
                    value={commonTemperature}
                    onChange={(event) => setCommonTemperature(Number(event.target.value))}
                  />
                  <input
                    type="number"
                    min="0"
                    max="1.5"
                    step="0.1"
                    className="textInput"
                    value={commonTemperature}
                    onChange={(event) => setCommonTemperature(Number(event.target.value))}
                  />
                </div>
              </label>

              <label className="fieldShell">
                <span className="fieldLabel">Max Tokens</span>
                <input
                  type="number"
                  min="256"
                  max="16000"
                  step="100"
                  className="textInput"
                  value={commonMaxTokens}
                  onChange={(event) => setCommonMaxTokens(Number(event.target.value))}
                />
              </label>
            </div>

            {getSelectValue(commonModel) === CUSTOM_MODEL_VALUE ? (
              <label className="fieldShell">
                <span className="fieldLabel">Custom Common Model Id</span>
                <input
                  className="textInput"
                  value={commonCustomModel}
                  onChange={(event) => setCommonCustomModel(event.target.value)}
                  placeholder="meta-llama/llama-4-maverick"
                />
              </label>
            ) : null}

            <div className="presetRow">
              {TOKEN_PRESETS.map((tokenPreset) => (
                <button
                  key={tokenPreset}
                  type="button"
                  className={`tokenPill ${commonMaxTokens === tokenPreset ? "tokenPillActive" : ""}`}
                  onClick={() => setCommonMaxTokens(tokenPreset)}
                >
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

            <div className="hintText">
              {MODEL_NOTE_LOOKUP.get(effectiveCommonModel) ??
                "커스텀 모델 ID를 직접 입력해 사용할 수 있습니다."}
            </div>
          </div>

          {inputMode === "json" ? (
            <div className="fieldGrid">
              <label>
                <span className="fieldLabel">Raw JSON Input</span>
                <textarea
                  className="jsonInput"
                  value={rawJson}
                  onChange={(event) => setRawJson(event.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
          ) : null}

          <div className="configCard evalExpectedCard">
            <div className="sectionHeader">
              <div>
                <h3 className="sectionTitle">Expected Result / 기대 결과</h3>
                <p className="panelLead">
                  파이프라인 완료 후 출력물이 이 기준에 부합하는지 LLM이 자동 채점합니다.
                </p>
              </div>
              {expectedResult.trim() ? (
                <button
                  type="button"
                  className="miniButton"
                  onClick={() => setExpectedResult("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <textarea
              className="promptInput"
              value={expectedResult}
              onChange={(event) => setExpectedResult(event.target.value)}
              placeholder="예: 삼성전자에 대한 포트폴리오 영향도가 direct로 분류되어야 한다. HBM 수출 규제의 리스크가 premortem에 반영되어야 한다..."
              rows={5}
              spellCheck={false}
            />
          </div>

          <div className="actions">
            <button
              type="button"
              className="primaryButton"
              onClick={handleRun}
              disabled={isRunning || !rawJson.trim()}
            >
              {isRunning ? "Running..." : "Run Pipeline"}
            </button>
            {inputMode === "json" ? (
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setRawJson(defaultSample?.rawJson ?? "")}
                disabled={isRunning}
              >
                Reset to Default Sample
              </button>
            ) : null}
            {deferredFinalResult?.finalOutput && expectedResult.trim() && !isEvaluating ? (
              <button
                type="button"
                className="secondaryButton"
                onClick={() => {
                  const outputStr = JSON.stringify(deferredFinalResult.finalOutput, null, 2);
                  void runEvaluation(outputStr);
                }}
              >
                Re-evaluate
              </button>
            ) : null}
            <span className="statusLine">
              {isEvaluating
                ? "Evaluating output..."
                : activeStage
                  ? `Active stage: ${STAGE_LABELS[activeStage]}`
                  : "Idle"}
            </span>
          </div>
        </div>

        <div className="stageTabs">
          <div className="stageTabStrip">
            {tunedStages.map((stage) => {
              const record = stageRecords.find((r) => r.stage === stage);
              const isBusy = runningStage === stage || (isRunning && activeStage === stage);
              return (
                <button
                  key={stage}
                  type="button"
                  className={`stageTab ${activeTab === stage ? "stageTabActive" : ""} ${stageConfigs[stage].enabled ? "stageTabCustom" : ""} ${record?.status === "success" ? "stageTabDone" : ""} ${record?.status === "error" ? "stageTabError" : ""} ${isBusy ? "stageTabRunning" : ""}`}
                  onClick={() => setActiveTab(stage)}
                >
                  <span className="stageTabNum">{STAGE_ORDER.indexOf(stage)}</span>
                  <span className="stageTabName">{STAGE_LABELS[stage].replace(/^\d+\.\s*/, "")}</span>
                </button>
              );
            })}
          </div>

          {tunedStages.map((stage) => {
            if (activeTab !== stage) return null;
            const config = stageConfigs[stage];
            const record = stageRecords.find((r) => r.stage === stage);
            const effectiveModel = config.enabled
              ? getEffectiveModel(config.model, config.customModel)
              : effectiveCommonModel;
            const effectiveTemperature = config.enabled ? config.temperature : commonTemperature;
            const effectiveMaxTokens = config.enabled ? config.maxTokens : commonMaxTokens;
            const isBusy = runningStage === stage || isRunning;

            return (
              <div key={stage} className="stageTabPanel">
                <div className="stageTabPanelHeader">
                  <div>
                    <h3 className="sectionTitle">{STAGE_LABELS[stage]}</h3>
                    <p className="panelLead">{STAGE_DESCRIPTIONS[stage]}</p>
                  </div>
                  <div className="stageTabPanelActions">
                    <button
                      type="button"
                      className="runStageButton"
                      disabled={isBusy || !rawJson.trim()}
                      onClick={() => handleRunStage(stage)}
                    >
                      {runningStage === stage ? "Running..." : "▶ Run This Stage"}
                    </button>
                    {record?.status === "success" ? (
                      <span className="statusBadge status-success">
                        {typeof record.elapsedMs === "number" ? `${record.elapsedMs}ms` : "Done"}
                      </span>
                    ) : null}
                    {record?.status === "error" ? (
                      <span className="statusBadge status-error">Error</span>
                    ) : null}
                    {record?.status === "running" ? (
                      <span className="statusBadge status-running">Running</span>
                    ) : null}
                  </div>
                </div>

                <div className="stageTabPanelGrid">
                  <div className="stageTabPanelCol">
                    <h4 className="stageTabSubhead">Settings</h4>
                    <div className="stageSettingsCompact">
                      <span className="summaryPill">{effectiveModel}</span>
                      <span className="summaryPill">temp {effectiveTemperature.toFixed(1)}</span>
                      <span className="summaryPill">tokens {effectiveMaxTokens}</span>
                      <span className={`summaryPill ${config.enabled ? "summaryPillAccent" : ""}`}>
                        {config.enabled ? "Custom" : "Common"}
                      </span>
                    </div>

                    <label className="toggleRow">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(event) =>
                          updateStageConfig(stage, (current) => ({
                            ...current,
                            enabled: event.target.checked,
                            model: commonModel,
                            customModel: commonCustomModel,
                            temperature: commonTemperature,
                            maxTokens: stage === "output_formatting" ? OUTPUT_STAGE_TOKENS : commonMaxTokens,
                          }))
                        }
                      />
                      <span>Use custom settings</span>
                    </label>

                    {config.enabled ? (
                      <>
                        <div className="overrideFields">
                          <label className="fieldShell">
                            <span className="fieldLabel">Model</span>
                            <select
                              className="selectInput"
                              value={getSelectValue(config.model)}
                              onChange={(event) => handleStageModelChange(stage, event.target.value)}
                            >
                              {MODEL_GROUPS.map((group) => (
                                <optgroup key={group.label} label={group.label}>
                                  {group.options.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                              <option value={CUSTOM_MODEL_VALUE}>Custom model id...</option>
                            </select>
                          </label>
                          <label className="fieldShell">
                            <span className="fieldLabel">Temperature</span>
                            <div className="rangeRow">
                              <input type="range" min="0" max="1.5" step="0.1" value={config.temperature}
                                onChange={(event) => updateStageConfig(stage, (c) => ({ ...c, temperature: Number(event.target.value) }))} />
                              <input type="number" min="0" max="1.5" step="0.1" className="textInput" value={config.temperature}
                                onChange={(event) => updateStageConfig(stage, (c) => ({ ...c, temperature: Number(event.target.value) }))} />
                            </div>
                          </label>
                          <label className="fieldShell">
                            <span className="fieldLabel">Max Tokens</span>
                            <input type="number" min="256" max="16000" step="100" className="textInput" value={config.maxTokens}
                              onChange={(event) => updateStageConfig(stage, (c) => ({ ...c, maxTokens: Number(event.target.value) }))} />
                          </label>
                        </div>

                        {getSelectValue(config.model) === CUSTOM_MODEL_VALUE ? (
                          <label className="fieldShell">
                            <span className="fieldLabel">Custom Model Id</span>
                            <input className="textInput" value={config.customModel} placeholder="x-ai/grok-4.1-fast"
                              onChange={(event) => updateStageConfig(stage, (c) => ({ ...c, customModel: event.target.value }))} />
                          </label>
                        ) : null}

                        <label className="fieldShell promptFieldShell">
                          <div className="promptLabelRow">
                            <span className="fieldLabel">Stage Prompt</span>
                            {config.prompt.trim() !== DEFAULT_STAGE_PROMPTS[stage].trim() ? (
                              <button type="button" className="miniButton"
                                onClick={() => updateStageConfig(stage, (c) => ({ ...c, prompt: DEFAULT_STAGE_PROMPTS[stage] }))}>
                                Reset Prompt
                              </button>
                            ) : null}
                          </div>
                          <textarea className="promptInput" value={config.prompt} spellCheck={false} rows={6}
                            onChange={(event) => updateStageConfig(stage, (c) => ({ ...c, prompt: event.target.value }))} />
                        </label>

                        <div className="presetRow">
                          {TOKEN_PRESETS.map((tp) => (
                            <button key={`${stage}-${tp}`} type="button"
                              className={`tokenPill ${config.maxTokens === tp ? "tokenPillActive" : ""}`}
                              onClick={() => updateStageConfig(stage, (c) => ({ ...c, maxTokens: tp }))}>
                              {tp}
                            </button>
                          ))}
                        </div>

                        <div className="overrideFooter">
                          <span className="hintText">
                            {MODEL_NOTE_LOOKUP.get(effectiveModel) ?? "커스텀 모델 ID가 그대로 사용됩니다."}
                          </span>
                          <button type="button" className="miniButton" onClick={() => resetStageOverride(stage)}>Reset</button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="stageTabPanelCol">
                    <h4 className="stageTabSubhead">Result</h4>
                    {record ? (
                      <>
                        {record.error ? <p className="errorText">{record.error}</p> : null}
                        <div className="metaRow">
                          {typeof record.elapsedMs === "number" ? <span>{record.elapsedMs} ms</span> : null}
                          {record.searchResults ? <span>search facts {record.searchResults.length}</span> : null}
                        </div>
                        <pre className="codeBlock stageResultBlock">{prettyJson(record.output ?? record.input)}</pre>
                      </>
                    ) : (
                      <p className="panelLead">이 단계는 아직 실행되지 않았습니다. ▶ Run This Stage 로 실행하세요.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="inlineActions" style={{ marginTop: 8 }}>
            <button type="button" className="miniButton" onClick={applyCommonToAll}>Apply Common To All</button>
            <button type="button" className="miniButton" onClick={resetAllOverrides}>Reset All Overrides</button>
          </div>
        </div>

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

          <section className="resultCard">
            <div className="resultHeader">
              <h2 className="resultTitle">Search Rounds</h2>
              <span className="statusBadge status-success">{searchRounds.length} active logs</span>
            </div>
            <div className="stack">
              {searchRounds.length === 0 ? (
                <p className="panelLead">아직 검색 라운드가 시작되지 않았습니다.</p>
              ) : (
                searchRounds
                  .sort((a, b) => a.round - b.round)
                  .map((roundState) => (
                    <article key={roundState.round} className="stageCard">
                      <div className="stageHeader">
                        <h3 className="stageTitle">Round {roundState.round}</h3>
                        <span className="statusBadge status-success">
                          results {roundState.results.length}
                        </span>
                      </div>
                      <div className="metaRow">
                        <span>{roundState.queries.length} queries</span>
                        {roundState.error ? <span className="errorText">{roundState.error}</span> : null}
                      </div>
                      <pre className="codeBlock">{prettyJson(roundState.queries)}</pre>
                    </article>
                  ))
              )}
            </div>
          </section>



          <section className="resultCard">
            <div className="resultHeader">
              <h2 className="resultTitle">Final Output</h2>
              <span className="statusBadge status-success">
                {deferredFinalResult?.finalOutput ? "Ready" : "Pending"}
              </span>
            </div>

            {isEvaluating ? (
              <div className="evalLoadingCard">
                <span className="statusBadge status-running">Evaluating...</span>
                <p className="panelLead">LLM이 출력물과 기대 결과를 비교 채점 중입니다.</p>
              </div>
            ) : null}

            {evaluationResult ? (
              <div className="evalScoreCard">
                <div className="evalScoreHeader">
                  <div className="evalScoreBig">
                    <span className="evalScoreNumber">{evaluationResult.score}</span>
                    <span className="evalScoreMax">/ 100</span>
                  </div>
                  <span className={`statusBadge ${
                    evaluationResult.score >= 80
                      ? "status-success"
                      : evaluationResult.score >= 50
                        ? "status-running"
                        : "status-error"
                  }`}>
                    {evaluationResult.score >= 80
                      ? "Excellent"
                      : evaluationResult.score >= 50
                        ? "Partial"
                        : "Poor"}
                  </span>
                </div>
                <div className="evalReasoning">{evaluationResult.reasoning}</div>
                {evaluationResult.breakdown.length > 0 ? (
                  <div className="evalBreakdown">
                    {evaluationResult.breakdown.map((item, index) => (
                      <div key={`eval-${index}-${item.criterion.slice(0, 20)}`} className="evalBreakdownItem">
                        <div className="evalBreakdownHeader">
                          <span className="evalCriterion">{item.criterion}</span>
                          <span className={`evalItemScore ${
                            item.score >= 80
                              ? "evalItemScoreGood"
                              : item.score >= 50
                                ? "evalItemScoreOk"
                                : "evalItemScorePoor"
                          }`}>
                            {item.score}
                          </span>
                        </div>
                        <div className="evalComment">{item.comment}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {deferredFinalResult?.finalOutput ? (
              <div className="resultGrid">
                <div className="summaryBlock">
                  <span className="summaryLabel">One Line Take</span>
                  <div>{deferredFinalResult.finalOutput.oneLineTake}</div>
                </div>

                <div className="summaryBlock">
                  <span className="summaryLabel">Structural Read</span>
                  <div>{deferredFinalResult.finalOutput.structuralRead}</div>
                </div>

                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Held</th>
                        <th>Exposure</th>
                        <th>What Changes Today</th>
                        <th>Action</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deferredFinalResult.finalOutput.portfolioImpactTable.map((row) => (
                        <tr key={`${row.company}-${row.held}`}>
                          <td>{row.company}</td>
                          <td>{row.held}</td>
                          <td>{row.exposureType}</td>
                          <td>{row.whatChangesToday}</td>
                          <td>{row.action}</td>
                          <td>{row.confidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="triggerList">
                  {deferredFinalResult.finalOutput.watchTriggers.map((trigger) => (
                    <div key={`${trigger.date}-${trigger.event}`} className="listCard">
                      <strong>
                        {trigger.date} · {trigger.event}
                      </strong>
                      <div>if confirmed: {trigger.ifConfirmed}</div>
                      <div>if not: {trigger.ifNot}</div>
                      <div>trigger: {trigger.thesisTrigger}</div>
                    </div>
                  ))}
                </div>

                <div className="whyList">
                  {deferredFinalResult.finalOutput.whySections.map((section) => (
                    <div key={section.label} className="listCard">
                      <strong>{section.label}</strong>
                      <div>{section.content}</div>
                      <div className="metaRow">
                        <span>{section.confidence}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="summaryBlock">
                  <span className="summaryLabel">Premortem</span>
                  <div>{deferredFinalResult.finalOutput.premortem.coreThesis}</div>
                  <div>{deferredFinalResult.finalOutput.premortem.primaryFailure}</div>
                  <div>{deferredFinalResult.finalOutput.premortem.earlyWarning}</div>
                  <div>{deferredFinalResult.finalOutput.premortem.ifWrong}</div>
                </div>

                <div className="summaryBlock markdownBlock">
                  <span className="summaryLabel">Markdown Output</span>
                  <pre className="codeBlock">{deferredFinalResult.finalOutput.markdownOutput}</pre>
                </div>
              </div>
            ) : (
              <div className="panelLead">
                결과가 아직 없습니다. 샘플을 선택하고 실행하면 이 영역에 최종 구조화 출력이 표시됩니다.
              </div>
            )}
          </section>

          <section className="resultCard">
            <button
              type="button"
              className="resultHeader resultHeaderToggle"
              onClick={() => setInputSnapshotOpen((prev) => !prev)}
              aria-expanded={inputSnapshotOpen}
            >
              <h2 className="resultTitle">Current Input Snapshot</h2>
              <span className="statusBadge status-running">
                {inputSnapshotOpen ? "▲ Collapse" : "▶ Debug"}
              </span>
            </button>
            {inputSnapshotOpen ? (
              <pre className="codeBlock">{deferredRawJson}</pre>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
