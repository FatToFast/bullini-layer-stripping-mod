import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DecisionBenchmarkPanel } from "@/components/decision/benchmark-panel";
import { DecisionExecutionPanel } from "@/components/decision/execution-panel";
import type {
  DecisionBenchmarkCase,
  DecisionBenchmarkRun,
  DecisionExecutionRun,
  DecisionModelSettings,
  DecisionRunResult,
} from "@/lib/decision/types";

const mockListDecisionBenchmarks = vi.fn();
const mockListSavedDecisionBenchmarkRuns = vi.fn();
const mockLoadSavedDecisionBenchmarkRun = vi.fn();
const mockRunDecisionBenchmarkApi = vi.fn();
const mockSaveDecisionBenchmarkCase = vi.fn();
const mockSaveDecisionBenchmarkRun = vi.fn();
const mockListSavedDecisionRuns = vi.fn();
const mockLoadSavedDecisionRun = vi.fn();
const mockRunDecisionPipelineApi = vi.fn();
const mockSaveDecisionRun = vi.fn();
const mockCompareDecisionBenchmarkRuns = vi.fn();
const mockCompareDecisionExecutionRuns = vi.fn();
const mockSaveLocalBenchmarkRun = vi.fn();
const mockLoadLocalBenchmarkRun = vi.fn();
const mockSaveLocalDecisionRun = vi.fn();
const mockLoadLocalDecisionRun = vi.fn();
const mockBuildDecisionBenchmarkFromExecutionRun = vi.fn();

vi.mock("@/lib/decision/api", () => ({
  listDecisionBenchmarks: (...args: unknown[]) => mockListDecisionBenchmarks(...args),
  listSavedDecisionBenchmarkRuns: (...args: unknown[]) => mockListSavedDecisionBenchmarkRuns(...args),
  loadSavedDecisionBenchmarkRun: (...args: unknown[]) => mockLoadSavedDecisionBenchmarkRun(...args),
  runDecisionBenchmarkApi: (...args: unknown[]) => mockRunDecisionBenchmarkApi(...args),
  saveDecisionBenchmarkCase: (...args: unknown[]) => mockSaveDecisionBenchmarkCase(...args),
  saveDecisionBenchmarkRun: (...args: unknown[]) => mockSaveDecisionBenchmarkRun(...args),
  listSavedDecisionRuns: (...args: unknown[]) => mockListSavedDecisionRuns(...args),
  loadSavedDecisionRun: (...args: unknown[]) => mockLoadSavedDecisionRun(...args),
  runDecisionPipelineApi: (...args: unknown[]) => mockRunDecisionPipelineApi(...args),
  saveDecisionRun: (...args: unknown[]) => mockSaveDecisionRun(...args),
}));

vi.mock("@/hooks/use-decision-benchmark-history", () => ({
  compareDecisionBenchmarkRuns: (...args: unknown[]) => mockCompareDecisionBenchmarkRuns(...args),
  formatDecisionBenchmarkDate: (timestamp: number) => `formatted-${timestamp}`,
  useDecisionBenchmarkHistory: () => ({
    saveBenchmarkRun: mockSaveLocalBenchmarkRun,
    loadBenchmarkRun: mockLoadLocalBenchmarkRun,
    latestRunsByBenchmark: new Map(),
  }),
}));

vi.mock("@/hooks/use-decision-run-history", () => ({
  compareDecisionExecutionRuns: (...args: unknown[]) => mockCompareDecisionExecutionRuns(...args),
  formatDecisionRunDate: (timestamp: number) => `formatted-${timestamp}`,
  useDecisionRunHistory: () => ({
    saveDecisionRun: mockSaveLocalDecisionRun,
    loadDecisionRun: mockLoadLocalDecisionRun,
    latestRun: null,
  }),
}));

vi.mock("@/lib/decision/article-benchmark", () => ({
  buildDecisionBenchmarkFromExecutionRun: (...args: unknown[]) => mockBuildDecisionBenchmarkFromExecutionRun(...args),
}));

const decisionModelSettings: DecisionModelSettings = {
  defaults: {
    model: "gpt-4.1",
    temperature: 0.3,
    maxTokens: 2000,
  },
  stages: {},
};

const benchmarkCase: DecisionBenchmarkCase = {
  id: "benchmark-1",
  title: "Benchmark Scenario",
  input: {
    task: "A benchmark task that is long enough to validate correctly",
    background: "Background",
    context: ["Context 1"],
    stakeholders: ["Stakeholder 1"],
    successCriteria: ["Success criterion 1"],
  },
  expectedCriteria: ["Expected criterion 1"],
  notes: "source: test",
};

const benchmarkRun: DecisionBenchmarkRun = {
  benchmark: benchmarkCase,
  run: {
    runId: "decision-run-1",
    stages: [],
    finalOutput: null,
  },
  evaluation: {
    score: 87,
    reasoning: "Finance and banking signals look strong.",
    verdict: "iterate",
    breakdown: [{ criterion: "clarity", score: 87, comment: "Clear enough" }],
    improvementHypotheses: ["Refine prompt"],
  },
  suggestedModelSettings: {
    defaults: {
      model: "gpt-4.1-mini",
      temperature: 0.2,
      maxTokens: 1500,
    },
    stages: {},
  },
  promptTuningNotes: ["Tighten framing"],
};

const decisionRunResult: DecisionRunResult = {
  runId: "execution-run-1",
  stages: [
    {
      stage: "task_reframing",
      status: "success",
      input: null,
    },
  ],
  finalOutput: {
    recommendedQuestion: "What should we actually decide?",
    decisionStatement: "Prioritize the lowest-risk option.",
    recommendedOptionId: "opt-1",
    options: [
      {
        id: "opt-1",
        label: "Option 1",
        summary: "Summary",
        whenItWins: "When evidence holds",
        failureMode: "If demand weakens",
        evidenceNeeded: ["Evidence 1"],
      },
    ],
    orchestrationPlan: [],
    stakeholderBriefs: [],
    rehearsalFindings: [],
    keyAssumptions: [],
    revisitTriggers: ["Trigger 1"],
    metaTuning: { observedBiases: [], skippedChecks: [], nextTimeAdjustments: [] },
    insightHandoff: {
      analysisPrompt: "Analyze the implications.",
      additionalContext: ["Extra context 1", "Extra context 2"],
    },
  },
};

const executionBenchmarkDraft: DecisionBenchmarkCase = {
  id: "execution-benchmark",
  title: "Execution Benchmark",
  input: {
    task: "Execution-derived benchmark task",
    stakeholders: ["Stakeholder 1"],
    successCriteria: ["Success criterion 1"],
  },
  expectedCriteria: ["Expected criterion 1"],
};

describe("Decision panels button behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockListDecisionBenchmarks.mockResolvedValue([benchmarkCase]);
    mockListSavedDecisionBenchmarkRuns.mockResolvedValue([]);
    mockLoadSavedDecisionBenchmarkRun.mockResolvedValue(benchmarkRun);
    mockRunDecisionBenchmarkApi.mockResolvedValue(benchmarkRun);
    mockSaveDecisionBenchmarkCase.mockResolvedValue({
      saved: true,
      filename: "benchmark.json",
      path: "/tmp/benchmark.json",
    });
    mockSaveDecisionBenchmarkRun.mockResolvedValue({
      saved: true,
      filename: "benchmark-run.json",
      path: "/tmp/benchmark-run.json",
    });
    mockListSavedDecisionRuns.mockResolvedValue([]);
    mockLoadSavedDecisionRun.mockResolvedValue({ input: benchmarkCase.input, run: decisionRunResult, savedAt: "2026-03-24T00:00:00.000Z" });
    mockRunDecisionPipelineApi.mockResolvedValue(decisionRunResult);
    mockSaveDecisionRun.mockResolvedValue({
      saved: true,
      filename: "decision-run.json",
      path: "/tmp/decision-run.json",
    });
    mockCompareDecisionBenchmarkRuns.mockReturnValue({
      scoreDelta: 0,
      verdictChanged: false,
      changedCriteria: [],
      addedNotes: [],
      removedNotes: [],
      suggestedStageCountDelta: 0,
      hasChanges: false,
    });
    mockCompareDecisionExecutionRuns.mockReturnValue({
      taskChanged: false,
      recommendedQuestionChanged: false,
      decisionStatementChanged: false,
      stageStatusChanges: [],
      warningCountDelta: 0,
      addedContext: [],
      removedContext: [],
      hasChanges: false,
    });
    mockBuildDecisionBenchmarkFromExecutionRun.mockReturnValue(executionBenchmarkDraft);
  });

  it("runs a benchmark and enables suggested settings apply", async () => {
    const onApplySuggestedSettings = vi.fn();

    render(
      <DecisionBenchmarkPanel
        decisionModelSettings={decisionModelSettings}
        onApplySuggestedSettings={onApplySuggestedSettings}
      />,
    );

    const runButton = await screen.findByRole("button", { name: "Benchmark 실행" });
    const editButton = screen.getByRole("button", { name: "편집 시작" });
    const applyButton = screen.getByRole("button", { name: "Suggested settings 적용" });

    await waitFor(() => {
      expect(runButton).toBeEnabled();
      expect(editButton).toBeEnabled();
    });
    expect(applyButton).toBeDisabled();

    fireEvent.click(runButton);

    await waitFor(() => {
      expect(mockRunDecisionBenchmarkApi).toHaveBeenCalledWith(
        expect.objectContaining({ id: "benchmark-1" }),
        expect.objectContaining({ pipelineModelSettings: decisionModelSettings }),
        expect.any(AbortSignal),
      );
      expect(mockSaveDecisionBenchmarkRun).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Suggested settings 적용" })).toBeEnabled();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByRole("button", { name: "Suggested settings 적용" }));
    expect(onApplySuggestedSettings).toHaveBeenCalledWith(benchmarkRun.suggestedModelSettings);
  }, 12000);

  it("opens benchmark edit mode with active save and run/apply controls", async () => {
    render(
      <DecisionBenchmarkPanel
        decisionModelSettings={decisionModelSettings}
        onApplySuggestedSettings={vi.fn()}
      />,
    );

    const editButton = await screen.findByRole("button", { name: "편집 시작" });
    await waitFor(() => expect(editButton).toBeEnabled());
    fireEvent.click(editButton);

    expect(screen.getByRole("button", { name: "편집 닫기" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "편집본 저장" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "▶ Run & Apply" })).toBeEnabled();
  });

  it("runs decision execution and enables handoff/apply benchmark actions", async () => {
    const onApplyInsightHandoff = vi.fn();
    const onBenchmarkCreated = vi.fn();

    render(
      <DecisionExecutionPanel
        decisionModelSettings={decisionModelSettings}
        defaultTask="Manual decision task"
        onApplyInsightHandoff={onApplyInsightHandoff}
        onBenchmarkCreated={onBenchmarkCreated}
      />,
    );

    const runButton = screen.getByRole("button", { name: "Decision 실행" });
    const handoffButton = screen.getByRole("button", { name: "Insight handoff 적용" });
    const saveBenchmarkButton = screen.getByRole("button", { name: "이 decision run을 benchmark로 저장" });

    expect(runButton).toBeEnabled();
    expect(handoffButton).toBeDisabled();
    expect(saveBenchmarkButton).toBeDisabled();

    fireEvent.click(runButton);

    await waitFor(() => {
      expect(mockRunDecisionPipelineApi).toHaveBeenCalledWith(
        expect.objectContaining({ task: "Manual decision task" }),
        expect.objectContaining({ modelSettings: decisionModelSettings }),
        expect.any(AbortSignal),
      );
      expect(screen.getByRole("button", { name: "Insight handoff 적용" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "이 decision run을 benchmark로 저장" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Insight handoff 적용" }));
    expect(onApplyInsightHandoff).toHaveBeenCalledWith("Analyze the implications.", ["Extra context 1", "Extra context 2"]);

    fireEvent.click(screen.getByRole("button", { name: "이 decision run을 benchmark로 저장" }));

    await waitFor(() => {
      expect(mockSaveDecisionBenchmarkCase).toHaveBeenCalledWith(executionBenchmarkDraft);
      expect(onBenchmarkCreated).toHaveBeenCalledWith(executionBenchmarkDraft);
    });
  });

  it("keeps execution buttons disabled only for real prerequisites", () => {
    render(
      <DecisionExecutionPanel
        decisionModelSettings={decisionModelSettings}
        defaultTask=""
      />,
    );

    expect(screen.getByRole("button", { name: "Decision 실행" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Insight handoff 적용" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "이 decision run을 benchmark로 저장" })).toBeDisabled();
  });
});
