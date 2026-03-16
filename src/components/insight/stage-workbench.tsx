import type { Dispatch, SetStateAction } from "react";

import { CUSTOM_MODEL_VALUE, MODEL_GROUPS } from "@/lib/insight/model-catalog";
import { DEFAULT_STAGE_PROMPTS } from "@/lib/insight/prompts";
import {
  SEARCH_R1_DEFAULT_PROMPT,
  SEARCH_R2_DEFAULT_PROMPT,
} from "@/lib/insight/search-query-prompts";
import { STAGE_DESCRIPTIONS, STAGE_LABELS, STAGE_ORDER } from "@/lib/insight/stage-labels";
import type {
  InsightStageName,
  SearchRoundConfig,
  StageEvaluationResult,
  StageStatus,
} from "@/lib/insight/types";
import type { SearchRoundState, StageUiConfig } from "@/hooks/use-pipeline-state";

const TOKEN_PRESETS = [1200, 1800, 2500, 4000];
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

type StageWorkbenchProps = {
  activeTab: InsightStageName | "searchR1" | "searchR2";
  setActiveTab: (tab: InsightStageName | "searchR1" | "searchR2") => void;
  tunedStages: InsightStageName[];
  stageRecords: Array<{
    stage: InsightStageName;
    status: StageStatus;
    input: unknown;
    userContent?: string;
    searchResults?: unknown[];
    prompt?: string;
    output?: unknown;
    elapsedMs?: number;
    error?: string;
  }>;
  stageConfigs: Record<InsightStageName, StageUiConfig>;
  searchRounds: SearchRoundState[];
  runningStage: InsightStageName | null;
  isRunning: boolean;
  activeStage: InsightStageName | null;
  rawJson: string;
  commonModel: string;
  commonCustomModel: string;
  commonTemperature: number;
  commonMaxTokens: number;
  effectiveCommonModel: string;
  systemPrompt: string;
  evaluatingStage: InsightStageName | null;
  stageEvaluations: Partial<Record<InsightStageName, StageEvaluationResult>>;
  searchR1Config: SearchRoundConfig;
  setSearchR1Config: Dispatch<SetStateAction<SearchRoundConfig>>;
  searchR2Config: SearchRoundConfig;
  setSearchR2Config: Dispatch<SetStateAction<SearchRoundConfig>>;
  updateStageConfig: (stage: InsightStageName, updater: (current: StageUiConfig) => StageUiConfig) => void;
  handleStageModelChange: (stage: InsightStageName, value: string) => void;
  resetStageOverride: (stage: InsightStageName) => void;
  handleRunStage: (stage: InsightStageName) => void;
  handleEvaluateStage: (stage: InsightStageName) => void;
  applyCommonToAll: () => void;
  resetAllOverrides: () => void;
};

export function StageWorkbench({
  activeTab,
  setActiveTab,
  tunedStages,
  stageRecords,
  stageConfigs,
  searchRounds,
  runningStage,
  isRunning,
  activeStage,
  rawJson,
  commonModel,
  commonCustomModel,
  commonTemperature,
  commonMaxTokens,
  effectiveCommonModel,
  systemPrompt,
  evaluatingStage,
  stageEvaluations,
  searchR1Config,
  setSearchR1Config,
  searchR2Config,
  setSearchR2Config,
  updateStageConfig,
  handleStageModelChange,
  resetStageOverride,
  handleRunStage,
  handleEvaluateStage,
  applyCommonToAll,
  resetAllOverrides,
}: StageWorkbenchProps) {
  function renderSearchTab(
    round: 1 | 2,
    config: SearchRoundConfig,
    setConfig: Dispatch<SetStateAction<SearchRoundConfig>>,
    defaultPrompt: string,
    title: string,
    description: string
  ) {
    const result = searchRounds.find((item) => item.round === round);
    return (
      <div className="stageTabPanel searchTabPanel">
        <div className="stageTabPanelHeader">
          <div>
            <h3 className="sectionTitle">{title}</h3>
            <p className="panelLead">{description}</p>
          </div>
          <div className="stageTabPanelActions">
            {result?.error ? <span className="statusBadge status-error">Error</span> : null}
            {!result?.error && result?.results.length ? (
              <span className="statusBadge status-success">{result.results.length} results · {result.queries.length} queries</span>
            ) : null}
          </div>
        </div>
        <div className="stageTabPanelGrid">
          <div className="stageTabPanelCol">
            <h4 className="stageTabSubhead">Query Generation Settings</h4>
            <div className="stageSettingsCompact">
              <span className="summaryPill">{config.model || effectiveCommonModel}</span>
              <span className="summaryPill">temp {(config.temperature ?? 0.3).toFixed(1)}</span>
              <span className="summaryPill">tokens {config.maxTokens ?? 800}</span>
            </div>
            <div className="overrideFields">
              <label className="fieldShell">
                <span className="fieldLabel">Model (empty = Common)</span>
                <select className="selectInput" value={config.model || ""} onChange={(event) => setConfig((prev) => ({ ...prev, model: event.target.value }))}>
                  <option value="">Use Common Model</option>
                  {MODEL_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="fieldShell">
                <span className="fieldLabel">Temperature</span>
                <div className="rangeRow">
                  <input type="range" min="0" max="1.5" step="0.1" value={config.temperature ?? 0.3} onChange={(event) => setConfig((prev) => ({ ...prev, temperature: Number(event.target.value) }))} />
                  <input type="number" min="0" max="1.5" step="0.1" className="textInput" value={config.temperature ?? 0.3} onChange={(event) => setConfig((prev) => ({ ...prev, temperature: Number(event.target.value) }))} />
                </div>
              </label>
              <label className="fieldShell">
                <span className="fieldLabel">Max Tokens</span>
                <input type="number" min="256" max="4000" step="100" className="textInput" value={config.maxTokens ?? 800} onChange={(event) => setConfig((prev) => ({ ...prev, maxTokens: Number(event.target.value) }))} />
              </label>
            </div>
            <label className="fieldShell promptFieldShell">
              <div className="promptLabelRow">
                <span className="fieldLabel">Query Generation Prompt</span>
                {config.prompt !== defaultPrompt ? <button type="button" className="miniButton" onClick={() => setConfig((prev) => ({ ...prev, prompt: defaultPrompt }))}>Reset Prompt</button> : null}
              </div>
              <textarea className="promptInput" value={config.prompt ?? ""} spellCheck={false} rows={6} onChange={(event) => setConfig((prev) => ({ ...prev, prompt: event.target.value }))} />
            </label>
          </div>
          <div className="stageTabPanelCol">
            <h4 className="stageTabSubhead">Search Results</h4>
            {!result ? <p className="panelLead">검색 결과가 아직 없습니다. 파이프라인을 실행하면 결과가 여기에 표시됩니다.</p> : null}
            {result ? (
              <>
                {result.error ? <p className="errorText">{result.error}</p> : null}
                <div className="stageSettingsCompact">
                  <span className="summaryPill">{result.queries.length} queries</span>
                  <span className="summaryPill">{result.results.length} results</span>
                </div>
                <h5 className="stageTabSubhead" style={{ marginTop: 12 }}>Generated Queries</h5>
                <pre className="codeBlock stageResultBlock">{JSON.stringify(result.queries, null, 2)}</pre>
                {result.results.length > 0 ? (
                  <>
                    <h5 className="stageTabSubhead" style={{ marginTop: 12 }}>Results</h5>
                    <pre className="codeBlock stageResultBlock">{JSON.stringify(result.results, null, 2)}</pre>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stageTabs">
      <div className="stageTabStrip">
        {tunedStages.map((stage) => {
          const record = stageRecords.find((item) => item.stage === stage);
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
        <button type="button" className={`stageTab stageTabSearch ${activeTab === "searchR1" ? "stageTabActive" : ""} ${searchRounds.find((item) => item.round === 1 && item.results.length > 0) ? "stageTabDone" : ""}`} onClick={() => setActiveTab("searchR1")}>
          <span className="stageTabNum">🔍</span>
          <span className="stageTabName">Search R1</span>
        </button>
        <button type="button" className={`stageTab stageTabSearch ${activeTab === "searchR2" ? "stageTabActive" : ""} ${searchRounds.find((item) => item.round === 2 && item.results.length > 0) ? "stageTabDone" : ""}`} onClick={() => setActiveTab("searchR2")}>
          <span className="stageTabNum">🔍</span>
          <span className="stageTabName">Search R2</span>
        </button>
      </div>

      {tunedStages.map((stage) => {
        if (activeTab !== stage) return null;
        const config = stageConfigs[stage];
        const record = stageRecords.find((item) => item.stage === stage);
        const effectiveModel = config.enabled ? getEffectiveModel(config.model, config.customModel) : effectiveCommonModel;
        const effectiveTemperature = config.enabled ? config.temperature : commonTemperature;
        const effectiveMaxTokens = config.enabled ? config.maxTokens : commonMaxTokens;
        const isBusy = runningStage === stage || isRunning;
        const evaluation = stageEvaluations[stage];

        return (
          <div key={stage} className="stageTabPanel">
            <div className="stageTabPanelHeader">
              <div>
                <h3 className="sectionTitle">{STAGE_LABELS[stage]}</h3>
                <p className="panelLead">{STAGE_DESCRIPTIONS[stage]}</p>
              </div>
              <div className="stageTabPanelActions">
                <button type="button" className="runStageButton" disabled={isBusy || !rawJson.trim()} onClick={() => handleRunStage(stage)}>
                  {runningStage === stage ? "분석 중..." : "▶ Run This Stage"}
                </button>
                {record?.status === "success" ? <span className="statusBadge status-success">{typeof record.elapsedMs === "number" ? `${record.elapsedMs}ms` : "Done"}</span> : null}
                {record?.status === "error" ? <span className="statusBadge status-error">Error</span> : null}
                {record?.status === "running" ? <span className="statusBadge status-running">Running</span> : null}
              </div>
            </div>

            <div className="stageTabPanelGrid">
              <div className="stageTabPanelCol">
                <h4 className="stageTabSubhead">Settings</h4>
                <div className="stageSettingsCompact">
                  <span className="summaryPill">{effectiveModel}</span>
                  <span className="summaryPill">temp {effectiveTemperature.toFixed(1)}</span>
                  <span className="summaryPill">tokens {effectiveMaxTokens}</span>
                  <span className={`summaryPill ${config.enabled ? "summaryPillAccent" : ""}`}>{config.enabled ? "Custom" : "Common"}</span>
                </div>

                <label className="toggleRow">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) => updateStageConfig(stage, (current) => ({
                      ...current,
                      enabled: event.target.checked,
                      model: commonModel,
                      customModel: commonCustomModel,
                      temperature: commonTemperature,
                      maxTokens: stage === "output_formatting" ? 4000 : commonMaxTokens,
                    }))}
                  />
                  <span>Use custom settings</span>
                </label>

                {config.enabled ? (
                  <>
                    <div className="overrideFields">
                      <label className="fieldShell">
                        <span className="fieldLabel">Model</span>
                        <select className="selectInput" value={getSelectValue(config.model)} onChange={(event) => handleStageModelChange(stage, event.target.value)}>
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
                          <input type="range" min="0" max="1.5" step="0.1" value={config.temperature} onChange={(event) => updateStageConfig(stage, (current) => ({ ...current, temperature: Number(event.target.value) }))} />
                          <input type="number" min="0" max="1.5" step="0.1" className="textInput" value={config.temperature} onChange={(event) => updateStageConfig(stage, (current) => ({ ...current, temperature: Number(event.target.value) }))} />
                        </div>
                      </label>
                      <label className="fieldShell">
                        <span className="fieldLabel">Max Tokens</span>
                        <input type="number" min="256" max="16000" step="100" className="textInput" value={config.maxTokens} onChange={(event) => updateStageConfig(stage, (current) => ({ ...current, maxTokens: Number(event.target.value) }))} />
                      </label>
                    </div>

                    {getSelectValue(config.model) === CUSTOM_MODEL_VALUE ? (
                      <label className="fieldShell">
                        <span className="fieldLabel">Custom Model Id</span>
                        <input className="textInput" value={config.customModel} placeholder="x-ai/grok-4.1-fast" onChange={(event) => updateStageConfig(stage, (current) => ({ ...current, customModel: event.target.value }))} />
                      </label>
                    ) : null}

                    <label className="fieldShell promptFieldShell">
                      <div className="promptLabelRow">
                        <span className="fieldLabel">Stage Prompt</span>
                        {config.prompt.trim() !== DEFAULT_STAGE_PROMPTS[stage].trim() ? <button type="button" className="miniButton" onClick={() => updateStageConfig(stage, (current) => ({ ...current, prompt: DEFAULT_STAGE_PROMPTS[stage] }))}>Reset Prompt</button> : null}
                      </div>
                      <textarea className="promptInput" value={config.prompt} spellCheck={false} rows={6} onChange={(event) => updateStageConfig(stage, (current) => ({ ...current, prompt: event.target.value }))} />
                    </label>

                    <div className="presetRow">
                      {TOKEN_PRESETS.map((tokenPreset) => (
                        <button key={`${stage}-${tokenPreset}`} type="button" className={`tokenPill ${config.maxTokens === tokenPreset ? "tokenPillActive" : ""}`} onClick={() => updateStageConfig(stage, (current) => ({ ...current, maxTokens: tokenPreset }))}>
                          {tokenPreset}
                        </button>
                      ))}
                    </div>

                    <div className="overrideFooter">
                      <span className="hintText">{MODEL_NOTE_LOOKUP.get(effectiveModel) ?? "커스텀 모델 ID가 그대로 사용됩니다."}</span>
                      <button type="button" className="miniButton" onClick={() => resetStageOverride(stage)}>Reset</button>
                    </div>
                  </>
                ) : null}

                <details className="fullPromptPreview">
                  <summary className="fullPromptSummary">Full Prompt Preview (System + Stage)</summary>
                  <pre className="codeBlock stageResultBlock">{`${systemPrompt}\n\n${config.enabled ? config.prompt : DEFAULT_STAGE_PROMPTS[stage]}`}</pre>
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
                        <span className="stageFlowMeta">{`${systemPrompt}\n\n${record.prompt || DEFAULT_STAGE_PROMPTS[stage]}`.length.toLocaleString()} chars</span>
                      </summary>
                      <pre className="codeBlock stageResultBlock">{`${systemPrompt}\n\n${record.prompt || DEFAULT_STAGE_PROMPTS[stage]}`}</pre>
                    </details>

                    <details className="stageFlowBlock">
                      <summary className="stageFlowSummary">
                        <span className="stageFlowLabel">② LLM User Input</span>
                        <span className="stageFlowMeta">{record.userContent ? `${record.userContent.length.toLocaleString()} chars` : "not captured"}</span>
                      </summary>
                      {record.userContent ? (
                        <pre className="codeBlock stageResultBlock">{(() => { try { return prettyJson(JSON.parse(record.userContent)); } catch { return record.userContent; } })()}</pre>
                      ) : (
                        <pre className="codeBlock stageResultBlock">{prettyJson(record.input)}</pre>
                      )}
                    </details>

                    <div className="stageFlowBlock stageFlowBlockOpen">
                      <div className="stageFlowSummary">
                        <span className="stageFlowLabel">③ LLM Output</span>
                        <span className="stageFlowMeta">{record.output ? `${JSON.stringify(record.output).length.toLocaleString()} chars` : "—"}</span>
                      </div>
                      <pre className="codeBlock stageResultBlock">{prettyJson(record.output ?? record.input)}</pre>
                    </div>

                    {record.status === "success" && record.output ? (
                      <div className="stageEvalSection">
                        <div className="stageEvalHeader">
                          <button type="button" className="evalStageButton" disabled={evaluatingStage === stage} onClick={() => handleEvaluateStage(stage)}>
                            {evaluatingStage === stage ? "Evaluating..." : "📋 Evaluate Stage"}
                          </button>
                          {evaluation ? <span className={`evalScoreBadge ${evaluation.overall_score >= 80 ? "evalScoreGood" : evaluation.overall_score >= 50 ? "evalScoreOk" : "evalScoreBad"}`}>{evaluation.overall_score}/100</span> : null}
                        </div>

                        {evaluation ? (
                          <div className="stageEvalResult">
                            <p className="evalSummary">{evaluation.summary}</p>
                            <div className="evalChecklist">
                              {evaluation.checklist.map((item, index) => (
                                <div key={index} className={`checklistItem checklistItem-${item.verdict}`}>
                                  <div className="checklistHeader">
                                    <span className="checklistVerdict">{item.verdict === "pass" ? "✅" : item.verdict === "partial" ? "⚠️" : "❌"}</span>
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

      {activeTab === "searchR1" ? renderSearchTab(1, searchR1Config, setSearchR1Config, SEARCH_R1_DEFAULT_PROMPT, "Search Round 1 — Pre-Analysis", "파이프라인 시작 전 컨텍스트 수집을 위한 웹 검색 쿼리를 LLM으로 생성합니다.") : null}
      {activeTab === "searchR2" ? renderSearchTab(2, searchR2Config, setSearchR2Config, SEARCH_R2_DEFAULT_PROMPT, "Search Round 2 — Counter-Argument", "분석 완료 후 반론과 검증을 위한 검색 쿼리를 생성합니다.") : null}

      <div className="inlineActions" style={{ marginTop: 8 }}>
        <button type="button" className="miniButton" onClick={applyCommonToAll}>Apply Common To All</button>
        <button type="button" className="miniButton" onClick={resetAllOverrides}>Reset All Overrides</button>
      </div>
    </div>
  );
}
