import { CUSTOM_MODEL_VALUE, MODEL_GROUPS } from "@/lib/insight/model-catalog";
import { STAGE_LABELS } from "@/lib/insight/stage-labels";
import type { InsightRunResult, InsightStageName, ReaderPersona } from "@/lib/insight/types";
import { ABComparison } from "@/components/insight/ab-comparison";
import type { ExtractPhase, StageUiConfig } from "@/hooks/use-pipeline-state";

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

type SearchProviderOption = {
  kind: string;
  label: string;
  configured: boolean;
};

type RunProfilePanelProps = {
  rawJson: string;
  commonModel: string;
  onCommonModelChange: (value: string) => void;
  commonCustomModel: string;
  setCommonCustomModel: (value: string) => void;
  commonTemperature: number;
  commonMaxTokens: number;
  preset: "custom" | "deep" | "balanced" | "quick";
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  systemPromptOpen: boolean;
  setSystemPromptOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  activeStage: InsightStageName | null;
  newsUrl: string;
  setNewsUrl: (value: string) => void;
  analysisPrompt: string;
  setAnalysisPrompt: (value: string) => void;
  searchProvider: string;
  setSearchProvider: (value: string) => void;
  searchProviders: SearchProviderOption[];
  extractPhase: ExtractPhase;
  extractError: string | null;
  fetchedText: {
    text: string;
    charCount: number;
    originalCharCount: number;
    truncated: boolean;
  } | null;
  effectiveCommonModel: string;
  defaultSystemPrompt: string;
  overrideCount: number;
  tunedStages: InsightStageName[];
  isRunning: boolean;
  abMode: boolean;
  setAbMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  abStage: InsightStageName | null;
  setAbStage: (value: InsightStageName | null) => void;
  abPromptOverride: string;
  setAbPromptOverride: (value: string) => void;
  abResult: InsightRunResult | null;
  abRunning: boolean;
  finalResult: InsightRunResult | null;
  stageConfigs: Record<InsightStageName, StageUiConfig>;
  onCommonTemperatureChange: (value: number) => void;
  onCommonMaxTokensChange: (value: number) => void;
  onPresetChange: (preset: "custom" | "deep" | "balanced" | "quick") => void;
  persona: ReaderPersona;
  onPersonaChange: (persona: ReaderPersona) => void;
  onExtract: () => void;
  onResetExtraction: () => void;
  onRun: () => void;
  onRunAB: () => void;
};

export function RunProfilePanel({
  rawJson,
  commonModel,
  onCommonModelChange,
  commonCustomModel,
  setCommonCustomModel,
  commonTemperature,
  commonMaxTokens,
  preset,
  systemPrompt,
  setSystemPrompt,
  systemPromptOpen,
  setSystemPromptOpen,
  activeStage,
  newsUrl,
  setNewsUrl,
  analysisPrompt,
  setAnalysisPrompt,
  searchProvider,
  setSearchProvider,
  searchProviders,
  extractPhase,
  extractError,
  fetchedText,
  effectiveCommonModel,
  defaultSystemPrompt,
  overrideCount,
  tunedStages,
  isRunning,
  abMode,
  setAbMode,
  abStage,
  setAbStage,
  abPromptOverride,
  setAbPromptOverride,
  abResult,
  abRunning,
  finalResult,
  stageConfigs,
  onCommonTemperatureChange,
  onCommonMaxTokensChange,
  onPresetChange,
  persona,
  onPersonaChange,
  onExtract,
  onResetExtraction,
  onRun,
  onRunAB,
}: RunProfilePanelProps) {
  return (
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
          <button type="button" className="primaryButton" onClick={onExtract} disabled={extractPhase === "fetching" || extractPhase === "structuring" || !newsUrl.trim()}>
            {extractPhase === "fetching" ? "Fetching URL..." : extractPhase === "structuring" ? "Structuring..." : "Extract & Structure"}
          </button>
          {extractPhase === "done" || extractPhase === "error" ? <button type="button" className="secondaryButton" onClick={onResetExtraction}>Reset</button> : null}
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
              onClick={() => onPresetChange(presetOption)}
            >
              {presetOption === "custom" ? "Custom" : PRESETS[presetOption].label}
            </button>
          ))}
        </div>

        {preset !== "custom" ? <div className="hintText" style={{ marginBottom: 12 }}>{`Preset: ${PRESETS[preset].label} (temp ${PRESETS[preset].temperature}, tokens ${PRESETS[preset].maxTokens})`}</div> : null}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <span className="fieldLabel">Reader Persona</span>
          {(["beginner", "retail", "professional", "institutional"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`miniButton ${persona === p ? "summaryPillAccent" : ""}`}
              onClick={() => onPersonaChange(p)}
            >
              {p === "beginner" ? "초보" : p === "retail" ? "개인" : p === "professional" ? "전문가" : "기관"}
            </button>
          ))}
        </div>

        <div className="profileGrid">
          <label className="fieldShell">
            <span className="fieldLabel">Common Model</span>
            <select className="selectInput" value={getSelectValue(commonModel)} onChange={(event) => onCommonModelChange(event.target.value)}>
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
              <input type="range" min="0" max="1.5" step="0.1" value={commonTemperature} onChange={(event) => onCommonTemperatureChange(Number(event.target.value))} />
              <input type="number" min="0" max="1.5" step="0.1" className="textInput" value={commonTemperature} onChange={(event) => onCommonTemperatureChange(Number(event.target.value))} />
            </div>
          </label>

          <label className="fieldShell">
            <span className="fieldLabel">Max Tokens</span>
            <input type="number" min="256" max="16000" step="100" className="textInput" value={commonMaxTokens} onChange={(event) => onCommonMaxTokensChange(Number(event.target.value))} />
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
            <button key={tokenPreset} type="button" className={`tokenPill ${commonMaxTokens === tokenPreset ? "tokenPillActive" : ""}`} onClick={() => onCommonMaxTokensChange(tokenPreset)}>
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
        <button type="button" className="primaryButton" onClick={abMode ? onRunAB : onRun} disabled={isRunning || abRunning || !rawJson.trim() || (abMode && (!abStage || !abPromptOverride.trim()))}>
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
        finalResult={finalResult}
        abResult={abResult}
      />
    </div>
  );
}
