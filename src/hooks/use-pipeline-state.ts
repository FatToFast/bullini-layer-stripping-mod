import { useDeferredValue, useState } from "react";

import { MODEL_GROUPS } from "@/lib/insight/model-catalog";
import { DEFAULT_STAGE_PROMPTS } from "@/lib/insight/prompts";
import {
  SEARCH_R1_DEFAULT_PROMPT,
  SEARCH_R2_DEFAULT_PROMPT,
} from "@/lib/insight/search-query-prompts";
import type { FetchTextResult } from "@/lib/insight/api";
import type {
  FinalOutput,
  InsightRunResult,
  InsightStageName,
  SearchRoundConfig,
  StageEvaluationResult,
  StageRecord,
} from "@/lib/insight/types";

export type TabId = InsightStageName | "searchR1" | "searchR2";

export type ExtractPhase = "idle" | "fetching" | "previewing" | "structuring" | "done" | "error";

export type SearchRoundState = {
  round: 1 | 2;
  queries: string[];
  results: unknown[];
  error?: string;
};

export type StageUiConfig = {
  enabled: boolean;
  expanded: boolean;
  model: string;
  customModel: string;
  temperature: number;
  maxTokens: number;
  prompt: string;
};

export type SampleItem = {
  key: string;
  label: string;
  rawJson: string;
};

const MODEL_NOTE_LOOKUP = new Map(
  MODEL_GROUPS.flatMap((group) => group.options.map((option) => [option.value, option.note] as const))
);

function isKnownModel(model: string) {
  return MODEL_NOTE_LOOKUP.has(model);
}

export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_TOKENS = 1800;
export const OUTPUT_STAGE_TOKENS = 4000;

export function buildInitialStageConfigs(
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
    output_formatting: base("output_formatting", {
      enabled: true,
      expanded: true,
      maxTokens: OUTPUT_STAGE_TOKENS,
    }),
  };
}

export function usePipelineState(defaultModel: string, defaultSystemPrompt: string, defaultSample?: SampleItem) {
  const [rawJson, setRawJson] = useState(defaultSample?.rawJson ?? "");
  const [commonModel, setCommonModel] = useState(defaultModel);
  const [commonCustomModel, setCommonCustomModel] = useState(isKnownModel(defaultModel) ? "" : defaultModel);
  const [commonTemperature, setCommonTemperature] = useState(DEFAULT_TEMPERATURE);
  const [commonMaxTokens, setCommonMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [preset, setPreset] = useState<"custom" | "deep" | "balanced" | "quick">("custom");
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [stageConfigs, setStageConfigs] = useState<Record<InsightStageName, StageUiConfig>>(
    buildInitialStageConfigs(defaultModel, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS)
  );
  const [isRunning, setIsRunning] = useState(false);
  const [stageRecords, setStageRecords] = useState<StageRecord[]>([]);
  const [searchRounds, setSearchRounds] = useState<SearchRoundState[]>([]);
  const [finalResult, setFinalResult] = useState<InsightRunResult | null>(null);
  const [previousResult, setPreviousResult] = useState<{ timestamp: number; output: FinalOutput } | null>(null);
  const [activeStage, setActiveStage] = useState<InsightStageName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newsUrl, setNewsUrl] = useState("");
  const [analysisPrompt, setAnalysisPrompt] = useState("이 뉴스가 내 포트폴리오에 미치는 영향을 분석해주세요.");
  const [searchProvider, setSearchProvider] = useState("noop");
  const [extractPhase, setExtractPhase] = useState<ExtractPhase>("idle");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [fetchedText, setFetchedText] = useState<FetchTextResult | null>(null);
  const [inputSnapshotOpen, setInputSnapshotOpen] = useState(false);
  const [runningStage, setRunningStage] = useState<InsightStageName | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("layer0_layer1");
  const [editableMarkdown, setEditableMarkdown] = useState("");
  const [outputTemplate, setOutputTemplate] = useState<"full" | "summary" | "social">("full");
  const [userNotes, setUserNotes] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [stageEvaluations, setStageEvaluations] = useState<Partial<Record<InsightStageName, StageEvaluationResult>>>({});
  const [analysisHistory, setAnalysisHistory] = useState<Array<{ timestamp: number; eventId: string; output: FinalOutput }>>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [evaluatingStage, setEvaluatingStage] = useState<InsightStageName | null>(null);
  const [abMode, setAbMode] = useState(false);
  const [abStage, setAbStage] = useState<InsightStageName | null>(null);
  const [abPromptOverride, setAbPromptOverride] = useState("");
  const [abResult, setAbResult] = useState<InsightRunResult | null>(null);
  const [abRunning, setAbRunning] = useState(false);
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

  return {
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
  };
}
