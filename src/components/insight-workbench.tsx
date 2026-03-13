"use client";

import { useDeferredValue, useMemo, useState, startTransition } from "react";
import {
  runInsightApiStream,
  fetchArticleText,
  structureWithLlm,
  evaluateStage,
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
import {
  SEARCH_R1_DEFAULT_PROMPT,
  SEARCH_R2_DEFAULT_PROMPT,
} from "@/lib/insight/search-query-prompts";
import type {
  CachedStageResults,
  InsightRunResult,
  InsightStageName,
  PipelineModelSettings,
  SearchRoundConfig,
  StageRecord,
  StageStatus,
  StageEvaluationResult,
} from "@/lib/insight/types";

/** Tab can be an analysis stage or a search round config */
type TabId = InsightStageName | "searchR1" | "searchR2";

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
  defaultSystemPrompt: string;
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

export function InsightWorkbench({ defaultModel, providerLabel, searchProviders, defaultSystemPrompt, samples }: Props) {
  const defaultSample = samples[0];
  const [rawJson, setRawJson] = useState(defaultSample?.rawJson ?? "");
  const [commonModel, setCommonModel] = useState(defaultModel);
  const [commonCustomModel, setCommonCustomModel] = useState(isKnownModel(defaultModel) ? "" : defaultModel);
  const [commonTemperature, setCommonTemperature] = useState(DEFAULT_TEMPERATURE);
  const [commonMaxTokens, setCommonMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [stageConfigs, setStageConfigs] = useState<Record<InsightStageName, StageUiConfig>>(
    buildInitialStageConfigs(defaultModel, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS)
  );
  const [isRunning, setIsRunning] = useState(false);
  const [stageRecords, setStageRecords] = useState<StageRecord[]>([]);
  const [searchRounds, setSearchRounds] = useState<SearchRoundState[]>([]);
  const [finalResult, setFinalResult] = useState<InsightRunResult | null>(null);
  const [activeStage, setActiveStage] = useState<InsightStageName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newsUrl, setNewsUrl] = useState("");
  const [analysisPrompt, setAnalysisPrompt] = useState(
    "이 뉴스가 내 포트폴리오에 미치는 영향을 분석해주세요."
  );
  const [searchProvider, setSearchProvider] = useState("noop");
  const [extractPhase, setExtractPhase] = useState<ExtractPhase>("idle");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [fetchedText, setFetchedText] = useState<FetchTextResult | null>(null);
  const [inputSnapshotOpen, setInputSnapshotOpen] = useState(false);
  const [runningStage, setRunningStage] = useState<InsightStageName | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("layer0_layer1");
  const [stageEvaluations, setStageEvaluations] = useState<Partial<Record<InsightStageName, StageEvaluationResult>>>({});
  const [evaluatingStage, setEvaluatingStage] = useState<InsightStageName | null>(null);
  const [searchR1Config, setSearchR1Config] = useState<SearchRoundConfig>({
    prompt: SEARCH_R1_DEFAULT_PROMPT,
    model: "",
    temperature: 0.3,
    maxTokens: 800,
  });
  const [searchR2Config, setSearchR2Config] = useState<SearchRoundConfig>({
    prompt: SEARCH_R2_DEFAULT_PROMPT,
    model: "",
    temperature: 0.3,
    maxTokens: 800,
  });

  const deferredRawJson = useDeferredValue(rawJson);
  const deferredFinalResult = useDeferredValue(finalResult);

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

  function buildSearchConfigs() {
    const r1 = searchR1Config.prompt || searchR1Config.model ? searchR1Config : undefined;
    const r2 = searchR2Config.prompt || searchR2Config.model ? searchR2Config : undefined;
    return r1 || r2 ? { searchR1Config: r1, searchR2Config: r2 } : undefined;
  }

  async function handleRun() {
    setIsRunning(true);
    setError(null);
    setActiveStage("input_validation");
    setStageRecords([]);
    setSearchRounds([]);
    setFinalResult(null);
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
        searchProvider,
        undefined,
        undefined,
        systemPrompt !== defaultSystemPrompt ? systemPrompt : undefined,
        buildSearchConfigs()
      );

      setFinalResult(result);
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
    const record = stageRecords.find((r) => r.stage === stage);
    if (!record?.output) return;

    setEvaluatingStage(stage);
    const config = stageConfigs[stage];
    const stagePrompt = config.enabled ? config.prompt : DEFAULT_STAGE_PROMPTS[stage];
    const fullPrompt = systemPrompt + "\n\n" + stagePrompt;
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

          <div className="configCard systemPromptCard">
            <button
              type="button"
              className="sectionHeader systemPromptToggle"
              onClick={() => setSystemPromptOpen((prev) => !prev)}
              aria-expanded={systemPromptOpen}
            >
              <div>
                <h3 className="sectionTitle">System Prompt</h3>
                <p className="panelLead">
                  모든 Stage에 공통 적용되는 시스템 프롬프트입니다. 수정하면 전체 파이프라인 결과가 바뀝니다.
                </p>
              </div>
              <div className="systemPromptBadges">
                {systemPrompt !== defaultSystemPrompt ? (
                  <span className="statusBadge status-running">Modified</span>
                ) : (
                  <span className="statusBadge status-success">Default</span>
                )}
                <span className="statusBadge status-running">
                  {systemPromptOpen ? "▲ Collapse" : "▶ Expand"}
                </span>
              </div>
            </button>
            {systemPromptOpen ? (
              <div className="systemPromptBody">
                <textarea
                  className="promptInput systemPromptInput"
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  spellCheck={false}
                  rows={12}
                />
                <div className="systemPromptActions">
                  {systemPrompt !== defaultSystemPrompt ? (
                    <button
                      type="button"
                      className="miniButton"
                      onClick={() => setSystemPrompt(defaultSystemPrompt)}
                    >
                      Reset to Default
                    </button>
                  ) : null}
                  <span className="hintText">{systemPrompt.length} chars</span>
                </div>
              </div>
            ) : null}
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
            <span className="statusLine">
              {activeStage
                ? `Active stage: ${STAGE_LABELS[activeStage]}`
                : "Idle"}
            </span>
          </div>
        </div>

        <div className="pipelineDiagram">
          {(() => {
            type DiagramNode = {
              id: string;
              label: string;
              short: string;
              kind: "stage" | "search";
              stage?: InsightStageName;
              searchRound?: 1 | 2;
            };
            const nodes: DiagramNode[] = [
              { id: "n0", label: "입력 검증", short: "0", kind: "stage", stage: "input_validation" },
              { id: "s1", label: "Search R1", short: "🔍", kind: "search", searchRound: 1 },
              { id: "n1", label: "전제 제거", short: "1", kind: "stage", stage: "layer0_layer1" },
              { id: "n2", label: "분류", short: "2", kind: "stage", stage: "event_classification" },
              { id: "n3", label: "반대 경로", short: "3", kind: "stage", stage: "layer2_reverse_paths" },
              { id: "n4", label: "인접 전이", short: "4", kind: "stage", stage: "layer3_adjacent_spillover" },
              { id: "n5", label: "포트폴리오", short: "5", kind: "stage", stage: "portfolio_impact" },
              { id: "n6", label: "시간축", short: "6", kind: "stage", stage: "layer4_time_horizon" },
              { id: "n7", label: "Premortem", short: "7", kind: "stage", stage: "layer5_structural_premortem" },
              { id: "s2", label: "Search R2", short: "🔍", kind: "search", searchRound: 2 },
              { id: "n8", label: "팩트 검증", short: "8", kind: "stage", stage: "evidence_consolidation" },
              { id: "n9", label: "최종 출력", short: "9", kind: "stage", stage: "output_formatting" },
            ];

            function getNodeStatus(node: DiagramNode): "idle" | "running" | "done" | "error" {
              if (node.kind === "search") {
                const sr = searchRounds.find((r) => r.round === node.searchRound);
                if (!sr) return "idle";
                if (sr.error) return "error";
                if (sr.results.length > 0) return "done";
                return "running";
              }
              if (!node.stage) return "idle";
              const rec = stageRecords.find((r) => r.stage === node.stage);
              if (!rec) return "idle";
              if (rec.status === "running") return "running";
              if (rec.status === "success") return "done";
              if (rec.status === "error") return "error";
              return "idle";
            }

            return nodes.map((node, idx) => (
              <div key={node.id} className="diagramNodeWrap">
                <button
                  type="button"
                  className={`diagramNode diagramNode-${node.kind} diagramNode-${getNodeStatus(node)} ${
                    (node.stage && activeTab === node.stage) ||
                    (node.kind === "search" && activeTab === (node.searchRound === 1 ? "searchR1" : "searchR2"))
                      ? "diagramNodeActive"
                      : ""
                  }`}
                  onClick={() => {
                    if (node.stage && node.stage !== "input_validation") {
                      setActiveTab(node.stage);
                    } else if (node.kind === "search") {
                      setActiveTab(node.searchRound === 1 ? "searchR1" : "searchR2");
                    }
                  }}
                  disabled={node.stage === "input_validation"}
                >
                  <span className="diagramNodeShort">{node.short}</span>
                  <span className="diagramNodeLabel">{node.label}</span>
                </button>
                {idx < nodes.length - 1 ? <span className="diagramArrow">→</span> : null}
              </div>
            ));
          })()}
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
            <button
              type="button"
              className={`stageTab stageTabSearch ${activeTab === "searchR1" ? "stageTabActive" : ""} ${searchRounds.find((r) => r.round === 1 && r.results.length > 0) ? "stageTabDone" : ""}`}
              onClick={() => setActiveTab("searchR1")}
            >
              <span className="stageTabNum">🔍</span>
              <span className="stageTabName">Search R1</span>
            </button>
            <button
              type="button"
              className={`stageTab stageTabSearch ${activeTab === "searchR2" ? "stageTabActive" : ""} ${searchRounds.find((r) => r.round === 2 && r.results.length > 0) ? "stageTabDone" : ""}`}
              onClick={() => setActiveTab("searchR2")}
            >
              <span className="stageTabNum">🔍</span>
              <span className="stageTabName">Search R2</span>
            </button>
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

                    <details className="fullPromptPreview">
                      <summary className="fullPromptSummary">
                        Full Prompt Preview (System + Stage)
                      </summary>
                      <pre className="codeBlock stageResultBlock">{systemPrompt + "\n\n" + (config.enabled ? config.prompt : DEFAULT_STAGE_PROMPTS[stage])}</pre>
                    </details>
                  </div>

                  <div className="stageTabPanelCol">
                    <h4 className="stageTabSubhead">Execution Flow</h4>
                    {record ? (
                      <>
                        {record.error ? <p className="errorText">{record.error}</p> : null}
                        <div className="metaRow">
                          {typeof record.elapsedMs === "number" ? <span>{record.elapsedMs} ms</span> : null}
                          {record.searchResults ? <span>search facts {record.searchResults.length}</span> : null}
                        </div>

                        <details className="stageFlowBlock">
                          <summary className="stageFlowSummary">
                            <span className="stageFlowLabel">① LLM System Prompt</span>
                            <span className="stageFlowMeta">{(systemPrompt + "\n\n" + (record.prompt || DEFAULT_STAGE_PROMPTS[stage])).length.toLocaleString()} chars</span>
                          </summary>
                          <pre className="codeBlock stageResultBlock">{systemPrompt + "\n\n" + (record.prompt || DEFAULT_STAGE_PROMPTS[stage])}</pre>
                        </details>

                        <details className="stageFlowBlock">
                          <summary className="stageFlowSummary">
                            <span className="stageFlowLabel">② LLM User Input</span>
                            <span className="stageFlowMeta">
                              {record.userContent
                                ? `${record.userContent.length.toLocaleString()} chars`
                                : "not captured"}
                            </span>
                          </summary>
                          {record.userContent ? (
                            <pre className="codeBlock stageResultBlock">{(() => {
                              try { return prettyJson(JSON.parse(record.userContent)); }
                              catch { return record.userContent; }
                            })()}</pre>
                          ) : (
                            <pre className="codeBlock stageResultBlock">{prettyJson(record.input)}</pre>
                          )}
                        </details>

                        <div className="stageFlowBlock stageFlowBlockOpen">
                          <div className="stageFlowSummary">
                            <span className="stageFlowLabel">③ LLM Output</span>
                            <span className="stageFlowMeta">
                              {record.output ? `${JSON.stringify(record.output).length.toLocaleString()} chars` : "—"}
                            </span>
                          </div>
                          <pre className="codeBlock stageResultBlock">{prettyJson(record.output ?? record.input)}</pre>
                        </div>

                        {record.status === "success" && record.output ? (
                          <div className="stageEvalSection">
                            <div className="stageEvalHeader">
                              <button
                                type="button"
                                className="evalStageButton"
                                disabled={evaluatingStage === stage}
                                onClick={() => handleEvaluateStage(stage)}
                              >
                                {evaluatingStage === stage ? "Evaluating..." : "📋 Evaluate Stage"}
                              </button>
                              {stageEvaluations[stage] ? (
                                <span className={`evalScoreBadge ${stageEvaluations[stage]!.overall_score >= 80 ? "evalScoreGood" : stageEvaluations[stage]!.overall_score >= 50 ? "evalScoreOk" : "evalScoreBad"}`}>
                                  {stageEvaluations[stage]!.overall_score}/100
                                </span>
                              ) : null}
                            </div>

                            {stageEvaluations[stage] ? (
                              <div className="stageEvalResult">
                                <p className="evalSummary">{stageEvaluations[stage]!.summary}</p>
                                <div className="evalChecklist">
                                  {stageEvaluations[stage]!.checklist.map((item, idx) => (
                                    <div key={idx} className={`checklistItem checklistItem-${item.verdict}`}>
                                      <div className="checklistHeader">
                                        <span className="checklistVerdict">
                                          {item.verdict === "pass" ? "✅" : item.verdict === "partial" ? "⚠️" : "❌"}
                                        </span>
                                        <span className="checklistCriterion">{item.criterion}</span>
                                        <span className="checklistSource">{item.source}</span>
                                        <span className="checklistScore">{item.score}</span>
                                      </div>
                                      <p className="checklistComment">{item.comment}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="panelLead">이 단계는 아직 실행되지 않았습니다. ▶ Run This Stage 로 실행하세요.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {activeTab === "searchR1" ? (
            <div className="stageTabPanel searchTabPanel">
              <div className="stageTabPanelHeader">
                <div>
                  <h3 className="sectionTitle">Search Round 1 — Pre-Analysis</h3>
                  <p className="panelLead">파이프라인 시작 전 컨텍스트 수집을 위한 웹 검색 쿼리를 LLM으로 생성합니다.</p>
                </div>
                <div className="stageTabPanelActions">
                  {(() => {
                    const sr = searchRounds.find((r) => r.round === 1);
                    if (sr?.error) return <span className="statusBadge status-error">Error</span>;
                    if (sr?.results.length) return (
                      <span className="statusBadge status-success">{sr.results.length} results · {sr.queries.length} queries</span>
                    );
                    return null;
                  })()}
                </div>
              </div>
              <div className="stageTabPanelGrid">
                <div className="stageTabPanelCol">
                  <h4 className="stageTabSubhead">Query Generation Settings</h4>
                  <div className="stageSettingsCompact">
                    <span className="summaryPill">{searchR1Config.model || effectiveCommonModel}</span>
                    <span className="summaryPill">temp {(searchR1Config.temperature ?? 0.3).toFixed(1)}</span>
                    <span className="summaryPill">tokens {searchR1Config.maxTokens ?? 800}</span>
                  </div>
                  <div className="overrideFields">
                    <label className="fieldShell">
                      <span className="fieldLabel">Model (empty = Common)</span>
                      <select
                        className="selectInput"
                        value={searchR1Config.model || ""}
                        onChange={(e) => setSearchR1Config((prev) => ({ ...prev, model: e.target.value }))}
                      >
                        <option value="">Use Common Model</option>
                        {MODEL_GROUPS.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className="fieldShell">
                      <span className="fieldLabel">Temperature</span>
                      <div className="rangeRow">
                        <input type="range" min="0" max="1.5" step="0.1" value={searchR1Config.temperature ?? 0.3}
                          onChange={(e) => setSearchR1Config((prev) => ({ ...prev, temperature: Number(e.target.value) }))} />
                        <input type="number" min="0" max="1.5" step="0.1" className="textInput" value={searchR1Config.temperature ?? 0.3}
                          onChange={(e) => setSearchR1Config((prev) => ({ ...prev, temperature: Number(e.target.value) }))} />
                      </div>
                    </label>
                    <label className="fieldShell">
                      <span className="fieldLabel">Max Tokens</span>
                      <input type="number" min="256" max="4000" step="100" className="textInput" value={searchR1Config.maxTokens ?? 800}
                        onChange={(e) => setSearchR1Config((prev) => ({ ...prev, maxTokens: Number(e.target.value) }))} />
                    </label>
                  </div>
                  <label className="fieldShell promptFieldShell">
                    <div className="promptLabelRow">
                      <span className="fieldLabel">Query Generation Prompt</span>
                      {searchR1Config.prompt !== SEARCH_R1_DEFAULT_PROMPT ? (
                        <button type="button" className="miniButton"
                          onClick={() => setSearchR1Config((prev) => ({ ...prev, prompt: SEARCH_R1_DEFAULT_PROMPT }))}>
                          Reset Prompt
                        </button>
                      ) : null}
                    </div>
                    <textarea className="promptInput" value={searchR1Config.prompt ?? ""} spellCheck={false} rows={6}
                      onChange={(e) => setSearchR1Config((prev) => ({ ...prev, prompt: e.target.value }))} />
                  </label>
                </div>
                <div className="stageTabPanelCol">
                  <h4 className="stageTabSubhead">Search Results</h4>
                  {(() => {
                    const sr = searchRounds.find((r) => r.round === 1);
                    if (!sr) return <p className="panelLead">검색 결과가 아직 없습니다. 파이프라인을 실행하면 결과가 여기에 표시됩니다.</p>;
                    return (
                      <>
                        {sr.error ? <p className="errorText">{sr.error}</p> : null}
                        <div className="stageSettingsCompact">
                          <span className="summaryPill">{sr.queries.length} queries</span>
                          <span className="summaryPill">{sr.results.length} results</span>
                        </div>
                        <h5 className="stageTabSubhead" style={{ marginTop: 12 }}>Generated Queries</h5>
                        <pre className="codeBlock stageResultBlock">{JSON.stringify(sr.queries, null, 2)}</pre>
                        {sr.results.length > 0 ? (
                          <>
                            <h5 className="stageTabSubhead" style={{ marginTop: 12 }}>Results</h5>
                            <pre className="codeBlock stageResultBlock">{JSON.stringify(sr.results, null, 2)}</pre>
                          </>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "searchR2" ? (
            <div className="stageTabPanel searchTabPanel">
              <div className="stageTabPanelHeader">
                <div>
                  <h3 className="sectionTitle">Search Round 2 — Counter-Argument</h3>
                  <p className="panelLead">분석 완료 후 반론과 검증을 위한 검색 쿼리를 생성합니다.</p>
                </div>
                <div className="stageTabPanelActions">
                  {(() => {
                    const sr = searchRounds.find((r) => r.round === 2);
                    if (sr?.error) return <span className="statusBadge status-error">Error</span>;
                    if (sr?.results.length) return (
                      <span className="statusBadge status-success">{sr.results.length} results · {sr.queries.length} queries</span>
                    );
                    return null;
                  })()}
                </div>
              </div>
              <div className="stageTabPanelGrid">
                <div className="stageTabPanelCol">
                  <h4 className="stageTabSubhead">Query Generation Settings</h4>
                  <div className="stageSettingsCompact">
                    <span className="summaryPill">{searchR2Config.model || effectiveCommonModel}</span>
                    <span className="summaryPill">temp {(searchR2Config.temperature ?? 0.3).toFixed(1)}</span>
                    <span className="summaryPill">tokens {searchR2Config.maxTokens ?? 800}</span>
                  </div>
                  <div className="overrideFields">
                    <label className="fieldShell">
                      <span className="fieldLabel">Model (empty = Common)</span>
                      <select
                        className="selectInput"
                        value={searchR2Config.model || ""}
                        onChange={(e) => setSearchR2Config((prev) => ({ ...prev, model: e.target.value }))}
                      >
                        <option value="">Use Common Model</option>
                        {MODEL_GROUPS.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className="fieldShell">
                      <span className="fieldLabel">Temperature</span>
                      <div className="rangeRow">
                        <input type="range" min="0" max="1.5" step="0.1" value={searchR2Config.temperature ?? 0.3}
                          onChange={(e) => setSearchR2Config((prev) => ({ ...prev, temperature: Number(e.target.value) }))} />
                        <input type="number" min="0" max="1.5" step="0.1" className="textInput" value={searchR2Config.temperature ?? 0.3}
                          onChange={(e) => setSearchR2Config((prev) => ({ ...prev, temperature: Number(e.target.value) }))} />
                      </div>
                    </label>
                    <label className="fieldShell">
                      <span className="fieldLabel">Max Tokens</span>
                      <input type="number" min="256" max="4000" step="100" className="textInput" value={searchR2Config.maxTokens ?? 800}
                        onChange={(e) => setSearchR2Config((prev) => ({ ...prev, maxTokens: Number(e.target.value) }))} />
                    </label>
                  </div>
                  <label className="fieldShell promptFieldShell">
                    <div className="promptLabelRow">
                      <span className="fieldLabel">Query Generation Prompt</span>
                      {searchR2Config.prompt !== SEARCH_R2_DEFAULT_PROMPT ? (
                        <button type="button" className="miniButton"
                          onClick={() => setSearchR2Config((prev) => ({ ...prev, prompt: SEARCH_R2_DEFAULT_PROMPT }))}>
                          Reset Prompt
                        </button>
                      ) : null}
                    </div>
                    <textarea className="promptInput" value={searchR2Config.prompt ?? ""} spellCheck={false} rows={6}
                      onChange={(e) => setSearchR2Config((prev) => ({ ...prev, prompt: e.target.value }))} />
                  </label>
                </div>
                <div className="stageTabPanelCol">
                  <h4 className="stageTabSubhead">Search Results</h4>
                  {(() => {
                    const sr = searchRounds.find((r) => r.round === 2);
                    if (!sr) return <p className="panelLead">검색 결과가 아직 없습니다. 파이프라인을 실행하면 결과가 여기에 표시됩니다.</p>;
                    return (
                      <>
                        {sr.error ? <p className="errorText">{sr.error}</p> : null}
                        <div className="stageSettingsCompact">
                          <span className="summaryPill">{sr.queries.length} queries</span>
                          <span className="summaryPill">{sr.results.length} results</span>
                        </div>
                        <h5 className="stageTabSubhead" style={{ marginTop: 12 }}>Generated Queries</h5>
                        <pre className="codeBlock stageResultBlock">{JSON.stringify(sr.queries, null, 2)}</pre>
                        {sr.results.length > 0 ? (
                          <>
                            <h5 className="stageTabSubhead" style={{ marginTop: 12 }}>Results</h5>
                            <pre className="codeBlock stageResultBlock">{JSON.stringify(sr.results, null, 2)}</pre>
                          </>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : null}

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
