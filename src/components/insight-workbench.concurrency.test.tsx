import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchArticleText = vi.fn();
const mockStructureWithLlm = vi.fn();

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
    rawJson: "",
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
    newsUrl: "https://example.com/article",
    setNewsUrl: vi.fn(),
    analysisPrompt: "Analyze this article",
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
    deferredRawJson: null,
    deferredFinalResult: null,
  };
};

let currentMockState = createMockPipelineState();

vi.mock("@/lib/insight/api", () => ({
  fetchArticleText: (...args: unknown[]) => mockFetchArticleText(...args),
  structureWithLlm: (...args: unknown[]) => mockStructureWithLlm(...args),
  runInsightApiStream: vi.fn(),
  evaluateStage: vi.fn(),
}));

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
  getEventIdFromRawJson: vi.fn(() => null),
  readStoredAnalysis: vi.fn(() => null),
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

vi.mock("@/components/insight/lazy-panels", () => ({
  AnalysisHistory: () => <div>AnalysisHistory</div>,
  DecisionBenchmarkPanel: () => <div>DecisionBenchmarkPanel</div>,
  DecisionExecutionPanel: () => <div>DecisionExecutionPanel</div>,
  FinalOutputPanel: () => <div>FinalOutputPanel</div>,
  OutputEditor: () => <div>OutputEditor</div>,
  QualityDashboard: () => <div>QualityDashboard</div>,
  SearchRoundsLog: () => <div>SearchRoundsLog</div>,
  StageWorkbench: () => <div>StageWorkbench</div>,
  WorkflowMermaidPanel: () => <div>WorkflowMermaidPanel</div>,
}));

vi.mock("@/components/insight/run-profile-panel", () => ({
  RunProfilePanel: ({ onExtract }: { onExtract: () => void }) => (
    <button type="button" onClick={() => void onExtract()}>
      Extract
    </button>
  ),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("InsightWorkbench concurrency control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockState = createMockPipelineState();
  });

  it("ignores stale extract responses after a newer extract starts", async () => {
    const firstFetch = deferred<{ text: string; charCount: number; truncated: boolean; originalCharCount: number }>();
    const secondFetch = deferred<{ text: string; charCount: number; truncated: boolean; originalCharCount: number }>();
    const secondStructure = deferred<{ dataset: Record<string, unknown> }>();

    mockFetchArticleText
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise);
    mockStructureWithLlm.mockReturnValueOnce(secondStructure.promise);

    render(<InsightWorkbench {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    await act(async () => {
      firstFetch.resolve({
        text: "first article",
        charCount: 13,
        truncated: false,
        originalCharCount: 13,
      });
      await Promise.resolve();
    });

    expect(mockStructureWithLlm).not.toHaveBeenCalled();
    expect(currentMockState.setFetchedText).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: "first article" }),
    );

    await act(async () => {
      secondFetch.resolve({
        text: "second article",
        charCount: 14,
        truncated: false,
        originalCharCount: 14,
      });
      await Promise.resolve();
    });

    expect(mockStructureWithLlm).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondStructure.resolve({ dataset: { source: "second" } });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(currentMockState.setFetchedText).toHaveBeenCalledWith(
        expect.objectContaining({ text: "second article" }),
      );
      expect(currentMockState.setRawJson).toHaveBeenCalledWith('{\n  "source": "second"\n}');
      expect(currentMockState.setExtractPhase).toHaveBeenCalledWith("done");
    });
  });
});
