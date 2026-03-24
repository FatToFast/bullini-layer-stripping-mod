import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createMockPipelineState = () => {
  const stageConfigs: Record<string, { enabled: boolean; expanded: boolean; model: string; customModel: string; temperature: number; maxTokens: number; prompt: string }> = {};
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
    rawJson: '{"event":"test"}',
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
    analysisPrompt: "Test analysis prompt",
    setAnalysisPrompt: vi.fn(),
    searchProvider: "noop",
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
    editableMarkdown: "# Final output",
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
    deferredRawJson: '{"event":"test"}',
    deferredFinalResult: {
      finalOutput: {
        mode: "general",
        oneLineTake: "One line take",
        structuralRead: "Structural read",
        portfolioImpactTable: [{ company: "ABC", exposureType: "direct", whatChangesToday: "Higher demand" }],
        markdownOutput: "# Final output",
      },
    },
  };
};

let currentMockState = createMockPipelineState();
const outputEditorMock = vi.fn(
  ({ handleCopy }: { handleCopy: () => void }) => <button type="button" onClick={handleCopy}>Copy output</button>,
);

vi.mock("@/hooks/use-pipeline-state", () => ({
  usePipelineState: vi.fn(() => currentMockState),
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
  ProducerFlowPanel: () => <div>ProducerFlowPanel</div>,
}));

vi.mock("@/components/decision/benchmark-panel", () => ({
  DecisionBenchmarkPanel: () => <div>DecisionBenchmarkPanel</div>,
}));

vi.mock("@/components/decision/workflow-mermaid-panel", () => ({
  WorkflowMermaidPanel: () => <div>WorkflowMermaidPanel</div>,
}));

vi.mock("@/components/decision/execution-panel", () => ({
  DecisionExecutionPanel: () => <div>DecisionExecutionPanel</div>,
}));

vi.mock("@/components/insight/lazy-panels", () => ({
  AnalysisHistory: () => <div>AnalysisHistory</div>,
  DecisionBenchmarkPanel: () => <div>DecisionBenchmarkPanel</div>,
  DecisionExecutionPanel: () => <div>DecisionExecutionPanel</div>,
  FinalOutputPanel: () => <div>FinalOutputPanel</div>,
  OutputEditor: (props: { handleCopy: () => void }) => outputEditorMock(props),
  QualityDashboard: () => <div>QualityDashboard</div>,
  SearchRoundsLog: () => <div>SearchRoundsLog</div>,
  StageWorkbench: () => <div>StageWorkbench</div>,
  WorkflowMermaidPanel: () => <div>WorkflowMermaidPanel</div>,
}));

vi.mock("@/components/insight/run-profile-panel", () => ({
  RunProfilePanel: () => <div>RunProfilePanel</div>,
}));

vi.mock("@/components/insight/pipeline-diagram", () => ({
  PipelineDiagram: () => <div>PipelineDiagram</div>,
}));

import { InsightWorkbench } from "./insight-workbench";

const defaultProps = {
  defaultModel: "gpt-4",
  providerLabel: "OpenAI",
  searchProviders: [{ kind: "noop", label: "None", configured: true }],
  defaultSystemPrompt: "You are a helpful assistant.",
  samples: [{ key: "sample1", label: "Sample 1", rawJson: '{"test":"data"}' }],
};

describe("InsightWorkbench memory cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    currentMockState = createMockPipelineState();
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("clears the previous copy feedback timer before scheduling the next one and on unmount", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(<InsightWorkbench {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy output" }));
    await act(async () => {
      await Promise.resolve();
    });

    const clearCallsAfterFirstCopy = clearTimeoutSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Copy output" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearCallsAfterFirstCopy);

    const clearCallsBeforeUnmount = clearTimeoutSpy.mock.calls.length;
    unmount();

    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearCallsBeforeUnmount);
    clearTimeoutSpy.mockRestore();
  });
});
