import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DecisionBenchmarkPanel } from "@/components/decision/benchmark-panel";
import { DecisionExecutionPanel } from "@/components/decision/execution-panel";
import type {
  DecisionBenchmarkCase,
  DecisionBenchmarkRun,
  DecisionExecutionRun,
  DecisionModelSettings,
  DecisionRunFileSummary,
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
    saveBenchmarkRun: vi.fn(),
    loadBenchmarkRun: vi.fn(),
    latestRunsByBenchmark: new Map(),
  }),
}));

vi.mock("@/hooks/use-decision-run-history", () => ({
  compareDecisionExecutionRuns: (...args: unknown[]) => mockCompareDecisionExecutionRuns(...args),
  formatDecisionRunDate: (timestamp: number) => `formatted-${timestamp}`,
  useDecisionRunHistory: () => ({
    saveDecisionRun: vi.fn(),
    loadDecisionRun: vi.fn(),
    latestRun: null,
  }),
}));

vi.mock("@/lib/decision/article-benchmark", () => ({
  buildDecisionBenchmarkFromExecutionRun: vi.fn(() => ({
    id: "execution-benchmark",
    title: "Execution Benchmark",
    input: {
      task: "Execution-derived benchmark task",
      stakeholders: ["Stakeholder 1"],
      successCriteria: ["Success criterion 1"],
    },
    expectedCriteria: ["Expected criterion 1"],
  })),
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
    stakeholders: ["Stakeholder 1"],
    successCriteria: ["Success criterion 1"],
  },
  expectedCriteria: ["Expected criterion 1"],
};

function createBenchmarkRun(label: string): DecisionBenchmarkRun {
  return {
    benchmark: {
      ...benchmarkCase,
      title: label,
    },
    run: {
      runId: `decision-run-${label}`,
      stages: [],
      finalOutput: null,
    },
    evaluation: {
      score: 80,
      reasoning: `${label} reasoning`,
      verdict: "iterate",
      breakdown: [{ criterion: "clarity", score: 80, comment: "Clear enough" }],
      improvementHypotheses: [],
    },
  };
}

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
    options: [],
    orchestrationPlan: [],
    stakeholderBriefs: [],
    rehearsalFindings: [],
    keyAssumptions: [],
    revisitTriggers: ["Trigger 1"],
    metaTuning: { observedBiases: [], skippedChecks: [], nextTimeAdjustments: [] },
    insightHandoff: {
      analysisPrompt: "Analyze the implications.",
      additionalContext: ["Extra context 1"],
    },
  },
};

function createExecutionRun(taskLabel: string): DecisionExecutionRun {
  return {
    input: {
      task: taskLabel,
      stakeholders: ["Stakeholder 1"],
      successCriteria: ["Success criterion 1"],
    },
    run: decisionRunResult,
    savedAt: "2026-03-24T00:00:00.000Z",
    label: taskLabel,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("Decision panel concurrency control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDecisionBenchmarks.mockResolvedValue([benchmarkCase]);
    mockListSavedDecisionBenchmarkRuns.mockResolvedValue([
      { filename: "benchmark-a.json", benchmarkId: "benchmark-1", title: "A", savedAt: "2026-03-24T00:00:00.000Z" },
      { filename: "benchmark-b.json", benchmarkId: "benchmark-1", title: "B", savedAt: "2026-03-24T00:00:01.000Z" },
      { filename: "benchmark-c.json", benchmarkId: "benchmark-1", title: "C", savedAt: "2026-03-24T00:00:02.000Z" },
    ]);
    mockListSavedDecisionRuns.mockResolvedValue([
      { id: "run-a", timestamp: "2026-03-24T00:00:00.000Z", runId: "run-a", filename: "decision-a.json", taskPreview: "A", recommendedQuestion: "Q1" },
      { id: "run-b", timestamp: "2026-03-24T00:00:01.000Z", runId: "run-b", filename: "decision-b.json", taskPreview: "B", recommendedQuestion: "Q2" },
      { id: "run-c", timestamp: "2026-03-24T00:00:02.000Z", runId: "run-c", filename: "decision-c.json", taskPreview: "C", recommendedQuestion: "Q3" },
    ] satisfies DecisionRunFileSummary[]);
    mockRunDecisionBenchmarkApi.mockResolvedValue(createBenchmarkRun("default"));
    mockSaveDecisionBenchmarkCase.mockResolvedValue({ saved: true, filename: "benchmark.json", path: "/tmp/benchmark.json" });
    mockSaveDecisionBenchmarkRun.mockResolvedValue({ saved: true, filename: "benchmark-run.json", path: "/tmp/benchmark-run.json" });
    mockRunDecisionPipelineApi.mockResolvedValue(decisionRunResult);
    mockSaveDecisionRun.mockResolvedValue({ saved: true, filename: "decision-run.json", path: "/tmp/decision-run.json" });
  });

  it("keeps the latest benchmark file comparison when older loads finish later", async () => {
    const aFirst = deferred<DecisionBenchmarkRun | { error: string }>();
    const bFirst = deferred<DecisionBenchmarkRun | { error: string }>();
    const bSecond = deferred<DecisionBenchmarkRun | { error: string }>();
    const cSecond = deferred<DecisionBenchmarkRun | { error: string }>();

    mockLoadSavedDecisionBenchmarkRun
      .mockReturnValueOnce(aFirst.promise)
      .mockReturnValueOnce(bFirst.promise)
      .mockReturnValueOnce(bSecond.promise)
      .mockReturnValueOnce(cSecond.promise);
    mockCompareDecisionBenchmarkRuns.mockImplementation((current: DecisionBenchmarkRun) => ({
      scoreDelta: current.benchmark.title === "C" ? 22 : 11,
      verdictChanged: false,
      changedCriteria: [],
      addedNotes: [],
      removedNotes: [],
      suggestedStageCountDelta: 0,
      hasChanges: true,
    }));

    render(
      <DecisionBenchmarkPanel
        decisionModelSettings={decisionModelSettings}
        onApplySuggestedSettings={vi.fn()}
      />,
    );

    await screen.findByRole("button", { name: /benchmark-a\.json/i });

    fireEvent.click(screen.getByRole("button", { name: /benchmark-a\.json/i }));
    fireEvent.click(screen.getByRole("button", { name: /benchmark-b\.json/i }));
    fireEvent.click(screen.getByRole("button", { name: /benchmark-c\.json/i }));

    bSecond.resolve(createBenchmarkRun("B"));
    cSecond.resolve(createBenchmarkRun("C"));

    await waitFor(() => {
      expect(screen.getByText("score +22.0")).toBeInTheDocument();
    });

    aFirst.resolve(createBenchmarkRun("A"));
    bFirst.resolve(createBenchmarkRun("B"));

    await waitFor(() => {
      expect(screen.getByText("score +22.0")).toBeInTheDocument();
    });
    expect(screen.queryByText("score +11.0")).not.toBeInTheDocument();
  });

  it("keeps the latest decision file comparison when older loads finish later", async () => {
    const aFirst = deferred<DecisionExecutionRun | { error: string }>();
    const bFirst = deferred<DecisionExecutionRun | { error: string }>();
    const bSecond = deferred<DecisionExecutionRun | { error: string }>();
    const cSecond = deferred<DecisionExecutionRun | { error: string }>();

    mockLoadSavedDecisionRun
      .mockReturnValueOnce(aFirst.promise)
      .mockReturnValueOnce(bFirst.promise)
      .mockReturnValueOnce(bSecond.promise)
      .mockReturnValueOnce(cSecond.promise);
    mockCompareDecisionExecutionRuns.mockImplementation((current: DecisionExecutionRun) => ({
      taskChanged: false,
      recommendedQuestionChanged: false,
      decisionStatementChanged: false,
      stageStatusChanges: [],
      warningCountDelta: current.input.task === "C-task" ? 7 : 2,
      addedContext: [],
      removedContext: [],
      hasChanges: true,
    }));

    render(
      <DecisionExecutionPanel
        decisionModelSettings={decisionModelSettings}
        defaultTask="Manual decision task"
      />,
    );

    await screen.findByRole("button", { name: /decision-a\.json/i });

    fireEvent.click(screen.getByRole("button", { name: /decision-a\.json/i }));
    fireEvent.click(screen.getByRole("button", { name: /decision-b\.json/i }));
    fireEvent.click(screen.getByRole("button", { name: /decision-c\.json/i }));

    bSecond.resolve(createExecutionRun("B-task"));
    cSecond.resolve(createExecutionRun("C-task"));

    await waitFor(() => {
      expect(screen.getByText("warnings +7")).toBeInTheDocument();
    });

    aFirst.resolve(createExecutionRun("A-task"));
    bFirst.resolve(createExecutionRun("B-task"));

    await waitFor(() => {
      expect(screen.getByText("warnings +7")).toBeInTheDocument();
    });
    expect(screen.queryByText("warnings +2")).not.toBeInTheDocument();
  });
});
