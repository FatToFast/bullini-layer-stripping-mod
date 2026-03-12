"use client";

import { useDeferredValue, useMemo, useState, startTransition } from "react";
import { runInsightApiStream } from "@/lib/insight/api";
import {
  CUSTOM_MODEL_VALUE,
  MODEL_GROUPS,
  TUNABLE_STAGES,
} from "@/lib/insight/model-catalog";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/insight/stage-labels";
import type {
  InsightRunResult,
  InsightStageName,
  PipelineModelSettings,
  StageRecord,
  StageStatus,
} from "@/lib/insight/types";

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
};

type Props = {
  defaultModel: string;
  providerLabel: string;
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
  return {
    input_validation: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    layer0_layer1: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    event_classification: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    layer2_reverse_paths: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    layer3_adjacent_spillover: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    portfolio_impact: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    layer4_time_horizon: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    layer5_structural_premortem: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    evidence_consolidation: {
      enabled: false,
      expanded: false,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    },
    output_formatting: {
      enabled: true,
      expanded: true,
      model: defaultModel,
      customModel: isKnownModel(defaultModel) ? "" : defaultModel,
      temperature: defaultTemperature,
      maxTokens: OUTPUT_STAGE_TOKENS,
    },
  };
}

export function InsightWorkbench({ defaultModel, providerLabel, samples }: Props) {
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
          return [
            stage,
            {
              model: getEffectiveModel(config.model, config.customModel),
              temperature: config.temperature,
              maxTokens: config.maxTokens,
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

  async function handleRun() {
    setIsRunning(true);
    setError(null);
    setActiveStage("input_validation");
    setStageRecords([]);
    setSearchRounds([]);
    setFinalResult(null);

    try {
      const result = await runInsightApiStream(rawJson, buildModelSettings(), {
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
      });

      setFinalResult(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "분석 실행에 실패했습니다.");
    } finally {
      setIsRunning(false);
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
            <span className="metaLabel">Provider</span>
            <div className="metaValue">{providerLabel}</div>
          </div>
          <div className="metaPill">
            <span className="metaLabel">Required Env</span>
            <div className="metaValue">
              <code>OPENROUTER_API_KEY</code>
            </div>
          </div>
          <div className="metaPill">
            <span className="metaLabel">Search Default</span>
            <div className="metaValue">검색 provider를 붙이지 않으면 no-op로 실행됩니다.</div>
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <h2 className="panelTitle">Run Profile</h2>
          <p className="panelLead">
            공통 설정을 기준으로 전체 단계를 돌리고, 필요한 단계만 별도 모델 프로필을 씌울 수 있습니다.
          </p>

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

          <div className="configCard">
            <div className="sectionHeader">
              <div>
                <h3 className="sectionTitle">Stage Overrides</h3>
                <p className="panelLead">`input_validation`은 비모델 단계라 제외됩니다.</p>
              </div>
              <div className="inlineActions">
                <button type="button" className="miniButton" onClick={applyCommonToAll}>
                  Apply Common To All
                </button>
                <button type="button" className="miniButton" onClick={expandCustomizedOnly}>
                  Expand Customized Only
                </button>
                <button type="button" className="miniButton" onClick={resetAllOverrides}>
                  Reset All Overrides
                </button>
              </div>
            </div>

            <div className="overrideList">
              {tunedStages.map((stage) => {
                const config = stageConfigs[stage];
                const effectiveModel = config.enabled
                  ? getEffectiveModel(config.model, config.customModel)
                  : effectiveCommonModel;
                const effectiveTemperature = config.enabled ? config.temperature : commonTemperature;
                const effectiveMaxTokens = config.enabled ? config.maxTokens : commonMaxTokens;

                return (
                  <article
                    key={stage}
                    className={`overrideCard ${config.enabled ? "overrideCardActive" : ""}`}
                  >
                    <button
                      type="button"
                      className="overrideHeader"
                      onClick={() =>
                        updateStageConfig(stage, (current) => ({
                          ...current,
                          expanded: !current.expanded,
                        }))
                      }
                      aria-expanded={config.expanded}
                    >
                      <div>
                        <div className="overrideTitle">{STAGE_LABELS[stage]}</div>
                        <div className="overrideSummary">
                          {config.enabled
                            ? `${effectiveModel} · temp ${effectiveTemperature.toFixed(1)} · ${effectiveMaxTokens}`
                            : "Using common settings"}
                        </div>
                      </div>
                      <span className={`summaryPill ${config.enabled ? "summaryPillAccent" : ""}`}>
                        {config.enabled ? "Custom" : "Common"}
                      </span>
                    </button>

                    {config.expanded ? (
                      <div className="overrideBody">
                        <label className="toggleRow">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(event) =>
                              updateStageConfig(stage, (current) => ({
                                ...current,
                                enabled: event.target.checked,
                                model: event.target.checked ? commonModel : commonModel,
                                customModel: event.target.checked ? commonCustomModel : commonCustomModel,
                                temperature: event.target.checked ? commonTemperature : commonTemperature,
                                maxTokens: event.target.checked
                                  ? stage === "output_formatting"
                                    ? OUTPUT_STAGE_TOKENS
                                    : commonMaxTokens
                                  : stage === "output_formatting"
                                    ? OUTPUT_STAGE_TOKENS
                                    : commonMaxTokens,
                              }))
                            }
                          />
                          <span>Use custom settings for this stage</span>
                        </label>

                        {config.enabled ? (
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
                                <input
                                  type="range"
                                  min="0"
                                  max="1.5"
                                  step="0.1"
                                  value={config.temperature}
                                  onChange={(event) =>
                                    updateStageConfig(stage, (current) => ({
                                      ...current,
                                      temperature: Number(event.target.value),
                                    }))
                                  }
                                />
                                <input
                                  type="number"
                                  min="0"
                                  max="1.5"
                                  step="0.1"
                                  className="textInput"
                                  value={config.temperature}
                                  onChange={(event) =>
                                    updateStageConfig(stage, (current) => ({
                                      ...current,
                                      temperature: Number(event.target.value),
                                    }))
                                  }
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
                                value={config.maxTokens}
                                onChange={(event) =>
                                  updateStageConfig(stage, (current) => ({
                                    ...current,
                                    maxTokens: Number(event.target.value),
                                  }))
                                }
                              />
                            </label>
                          </div>
                        ) : null}

                        {config.enabled && getSelectValue(config.model) === CUSTOM_MODEL_VALUE ? (
                          <label className="fieldShell">
                            <span className="fieldLabel">Custom Model Id</span>
                            <input
                              className="textInput"
                              value={config.customModel}
                              onChange={(event) =>
                                updateStageConfig(stage, (current) => ({
                                  ...current,
                                  customModel: event.target.value,
                                }))
                              }
                              placeholder="x-ai/grok-4.1-fast"
                            />
                          </label>
                        ) : null}

                        {config.enabled ? (
                          <>
                            <div className="presetRow">
                              {TOKEN_PRESETS.map((tokenPreset) => (
                                <button
                                  key={`${stage}-${tokenPreset}`}
                                  type="button"
                                  className={`tokenPill ${config.maxTokens === tokenPreset ? "tokenPillActive" : ""}`}
                                  onClick={() =>
                                    updateStageConfig(stage, (current) => ({
                                      ...current,
                                      maxTokens: tokenPreset,
                                    }))
                                  }
                                >
                                  {tokenPreset}
                                </button>
                              ))}
                            </div>
                            <div className="overrideFooter">
                              <span className="hintText">
                                {MODEL_NOTE_LOOKUP.get(effectiveModel) ??
                                  "커스텀 모델 ID가 그대로 사용됩니다."}
                              </span>
                              <button
                                type="button"
                                className="miniButton"
                                onClick={() => resetStageOverride(stage)}
                              >
                                Reset
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>

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

          <div className="actions">
            <button type="button" className="primaryButton" onClick={handleRun} disabled={isRunning}>
              {isRunning ? "Running..." : "Run Pipeline"}
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => setRawJson(defaultSample?.rawJson ?? "")}
              disabled={isRunning}
            >
              Reset to Default Sample
            </button>
            <span className="statusLine">
              {activeStage ? `Active stage: ${STAGE_LABELS[activeStage]}` : "Idle"}
            </span>
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
              <h2 className="resultTitle">Stages</h2>
              <span className="statusBadge status-running">{orderedStageRecords.length} records</span>
            </div>
            <div className="stack">
              {orderedStageRecords.length === 0 ? (
                <p className="panelLead">실행 전에는 단계 기록이 비어 있습니다.</p>
              ) : (
                orderedStageRecords.map((record) => (
                  <article key={record.stage} className="stageCard">
                    <div className="stageHeader">
                      <h3 className="stageTitle">{STAGE_LABELS[record.stage]}</h3>
                      <span
                        className={`statusBadge status-${
                          record.status === "success"
                            ? "success"
                            : record.status === "error"
                              ? "error"
                              : "running"
                        }`}
                      >
                        {statusLabel[record.status]}
                      </span>
                    </div>
                    <div className="metaRow">
                      {typeof record.elapsedMs === "number" ? <span>{record.elapsedMs} ms</span> : null}
                      {record.searchResults ? <span>search facts {record.searchResults.length}</span> : null}
                    </div>
                    {record.error ? <p className="errorText">{record.error}</p> : null}
                    <pre className="codeBlock">{prettyJson(record.output ?? record.input)}</pre>
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
            <div className="resultHeader">
              <h2 className="resultTitle">Current Input Snapshot</h2>
              <span className="statusBadge status-running">Live</span>
            </div>
            <pre className="codeBlock">{deferredRawJson}</pre>
          </section>
        </div>
      </section>
    </main>
  );
}
