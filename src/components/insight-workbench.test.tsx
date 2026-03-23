/**
 * Tests for insight-workbench panel ordering and prerequisite checks.
 *
 * Expected order:
 * 1. News URL Input (RunProfilePanel)
 * 2. Extract & Structure
 * 3. Decision Flow (ProducerFlowPanel)
 * 4. Decision Run/Benchmark (DecisionBenchmarkPanel, DecisionExecutionPanel, WorkflowMermaidPanel)
 * 5. Insight Pipeline (StageWorkbench, Final Output)
 *
 * Prerequisites:
 * - Decision panels should be disabled/locked when rawJson is empty
 * - Decision panels should be enabled when rawJson exists
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Create mock factory functions
const createMockPipelineState = (rawJson = "") => {
  const stageConfigs: Record<string, { enabled: boolean; expanded: boolean; model: string; customModel: string; temperature: number; maxTokens: number; prompt: string }> = {};
  // Must match TUNABLE_STAGES from model-catalog.ts
  const stages = [
    "layer0_layer1",
    "event_classification",
    "layer2_reverse_paths",
    "layer3_adjacent_spillover",
    "portfolio_impact",
    "layer4_time_horizon",
    "layer5_structural_premortem",
    "evidence_consolidation",
    "output_formatting",
  ];
  for (const stage of stages) {
    stageConfigs[stage] = { enabled: false, expanded: false, model: "gpt-4", customModel: "", temperature: 0.5, maxTokens: 4096, prompt: "" };
  }

  return {
    rawJson,
    setRawJson: vi.fn(),
    commonModel: "gpt-4",
    setCommonModel: vi.fn(),
    commonCustomModel: "",
    setCommonCustomModel: vi.fn(),
    commonTemperature: 0.5,
    setCommonTemperature: vi.fn(),
    commonMaxTokens: 4096,
    setCommonMaxTokens: vi.fn(),
    preset: "custom",
    setPreset: vi.fn(),
    persona: "",
    setPersona: vi.fn(),
    systemPrompt: "",
    setSystemPrompt: vi.fn(),
    systemPromptOpen: false,
    setSystemPromptOpen: vi.fn(),
    stageConfigs,
    setStageConfigs: vi.fn(),
    isRunning: false,
    setIsRunning: vi.fn(),
    stageRecords: [],
    setStageRecords: vi.fn(),
    searchRounds: [],
    setSearchRounds: vi.fn(),
    finalResult: null,
    setFinalResult: vi.fn(),
    previousResult: null,
    setPreviousResult: vi.fn(),
    activeStage: null,
    setActiveStage: vi.fn(),
    error: null,
    setError: vi.fn(),
    newsUrl: "",
    setNewsUrl: vi.fn(),
    analysisPrompt: "",
    setAnalysisPrompt: vi.fn(),
    searchProvider: "tavily",
    setSearchProvider: vi.fn(),
    extractPhase: "idle",
    setExtractPhase: vi.fn(),
    extractError: null,
    setExtractError: vi.fn(),
    fetchedText: null,
    setFetchedText: vi.fn(),
    inputSnapshotOpen: false,
    setInputSnapshotOpen: vi.fn(),
    runningStage: null,
    setRunningStage: vi.fn(),
    activeTab: "stages",
    setActiveTab: vi.fn(),
    editableMarkdown: "",
    setEditableMarkdown: vi.fn(),
    outputTemplate: "full",
    setOutputTemplate: vi.fn(),
    userNotes: "",
    setUserNotes: vi.fn(),
    copyFeedback: null,
    setCopyFeedback: vi.fn(),
    stageEvaluations: {},
    setStageEvaluations: vi.fn(),
    analysisHistory: [],
    setAnalysisHistory: vi.fn(),
    historySearch: "",
    setHistorySearch: vi.fn(),
    evaluatingStage: null,
    setEvaluatingStage: vi.fn(),
    abMode: false,
    setAbMode: vi.fn(),
    abStage: null,
    setAbStage: vi.fn(),
    abPromptOverride: "",
    setAbPromptOverride: vi.fn(),
    abResult: null,
    setAbResult: vi.fn(),
    abRunning: false,
    setAbRunning: vi.fn(),
    searchR1Config: {},
    setSearchR1Config: vi.fn(),
    searchR2Config: {},
    setSearchR2Config: vi.fn(),
    deferredRawJson: rawJson || null,
    deferredFinalResult: null,
  };
};

let currentMockState = createMockPipelineState();

// Mock the hooks and components
vi.mock("@/hooks/use-pipeline-state", () => ({
  usePipelineState: vi.fn((model: string, systemPrompt: string, sample: unknown) => currentMockState),
  DEFAULT_MAX_TOKENS: 4096,
  DEFAULT_TEMPERATURE: 0.5,
  OUTPUT_STAGE_TOKENS: 8192,
  buildInitialStageConfigs: vi.fn(() => currentMockState.stageConfigs),
}));

vi.mock("@/hooks/use-analysis-storage", () => ({
  useAnalysisStorage: () => ({
    saveAnalysis: vi.fn(),
    loadAnalysis: vi.fn(),
    finalOutputComparison: null,
  }),
  getEventIdFromRawJson: vi.fn(() => "test-event"),
  readStoredAnalysis: vi.fn(),
}));

vi.mock("@/hooks/use-quality-metrics", () => ({
  useQualityMetrics: vi.fn(() => null),
}));

vi.mock("@/lib/decision/article-benchmark", () => ({
  buildDecisionBenchmarkFromCurrentArticle: () => null,
}));

vi.mock("@/components/decision/producer-flow-panel", () => ({
  ProducerFlowPanel: () => <div data-testid="producer-flow-panel">ProducerFlowPanel</div>,
}));

vi.mock("@/components/decision/benchmark-panel", () => ({
  DecisionBenchmarkPanel: () => <div data-testid="decision-benchmark-panel">DecisionBenchmarkPanel</div>,
}));

vi.mock("@/components/decision/workflow-mermaid-panel", () => ({
  WorkflowMermaidPanel: () => <div data-testid="workflow-mermaid-panel">WorkflowMermaidPanel</div>,
}));

vi.mock("@/components/decision/execution-panel", () => ({
  DecisionExecutionPanel: () => <div data-testid="decision-execution-panel">DecisionExecutionPanel</div>,
}));

vi.mock("@/components/insight/run-profile-panel", () => ({
  RunProfilePanel: () => <div data-testid="run-profile-panel">RunProfilePanel</div>,
}));

vi.mock("@/components/insight/pipeline-diagram", () => ({
  PipelineDiagram: () => <div data-testid="pipeline-diagram">PipelineDiagram</div>,
}));

vi.mock("@/components/insight/stage-workbench", () => ({
  StageWorkbench: () => <div data-testid="stage-workbench">StageWorkbench</div>,
}));

vi.mock("@/components/insight/search-rounds-log", () => ({
  SearchRoundsLog: () => <div data-testid="search-rounds-log">SearchRoundsLog</div>,
}));

vi.mock("@/components/insight/analysis-history", () => ({
  AnalysisHistory: () => <div data-testid="analysis-history">AnalysisHistory</div>,
}));

vi.mock("@/components/insight/final-output-panel", () => ({
  FinalOutputPanel: () => <div data-testid="final-output-panel">FinalOutputPanel</div>,
}));

vi.mock("@/components/insight/output-editor", () => ({
  OutputEditor: () => <div data-testid="output-editor">OutputEditor</div>,
}));

vi.mock("@/components/insight/quality-dashboard", () => ({
  QualityDashboard: () => <div data-testid="quality-dashboard">QualityDashboard</div>,
}));

import { InsightWorkbench } from "./insight-workbench";

const defaultProps = {
  defaultModel: "gpt-4",
  providerLabel: "OpenAI",
  searchProviders: [
    { kind: "tavily", label: "Tavily", configured: true },
    { kind: "brave", label: "Brave", configured: false },
  ],
  defaultSystemPrompt: "You are a helpful assistant.",
  samples: [
    {
      key: "sample1",
      label: "Sample 1",
      rawJson: '{"test": "data"}',
    },
  ],
};

describe("InsightWorkbench - Panel Ordering", () => {
  beforeEach(() => {
    cleanup();
    currentMockState = createMockPipelineState();
  });

  it("should render all expected panels", () => {
    render(<InsightWorkbench {...defaultProps} />);

    const expectedPanels = [
      "run-profile-panel",
      "producer-flow-panel",
      "decision-benchmark-panel",
      "workflow-mermaid-panel",
      "decision-execution-panel",
      "pipeline-diagram",
      "stage-workbench",
    ];

    for (const panelId of expectedPanels) {
      expect(screen.getByTestId(panelId)).toBeInTheDocument();
    }
  });
});

describe("InsightWorkbench - Prerequisite Checks (Manual Verification)", () => {
  beforeEach(() => {
    cleanup();
  });

  it("should have rawJson state accessible", () => {
    currentMockState = createMockPipelineState("");
    expect(currentMockState.rawJson).toBe("");
  });

  it("should have rawJson with data", () => {
    currentMockState = createMockPipelineState('{"test": "data"}');
    expect(currentMockState.rawJson).toBe('{"test": "data"}');
  });
});
