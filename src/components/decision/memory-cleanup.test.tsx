import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DecisionBenchmarkPanel } from "@/components/decision/benchmark-panel";
import { WorkflowMermaidPanel } from "@/components/decision/workflow-mermaid-panel";
import type { DecisionBenchmarkCase, DecisionBenchmarkRun, DecisionModelSettings } from "@/lib/decision/types";

const mockListDecisionBenchmarks = vi.fn();
const mockListSavedDecisionBenchmarkRuns = vi.fn();
const mockRunDecisionBenchmarkApi = vi.fn();
const mockSaveDecisionBenchmarkRun = vi.fn();
const mockCompareDecisionBenchmarkRuns = vi.fn();
const mockSaveLocalBenchmarkRun = vi.fn();
const mockLoadLocalBenchmarkRun = vi.fn();

vi.mock("@/lib/decision/api", () => ({
  listDecisionBenchmarks: (...args: unknown[]) => mockListDecisionBenchmarks(...args),
  listSavedDecisionBenchmarkRuns: (...args: unknown[]) => mockListSavedDecisionBenchmarkRuns(...args),
  loadSavedDecisionBenchmarkRun: vi.fn(),
  runDecisionBenchmarkApi: (...args: unknown[]) => mockRunDecisionBenchmarkApi(...args),
  saveDecisionBenchmarkCase: vi.fn(),
  saveDecisionBenchmarkRun: (...args: unknown[]) => mockSaveDecisionBenchmarkRun(...args),
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

describe("Memory cleanup guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockListDecisionBenchmarks.mockResolvedValue([benchmarkCase]);
    mockListSavedDecisionBenchmarkRuns.mockResolvedValue([]);
    mockRunDecisionBenchmarkApi.mockResolvedValue(benchmarkRun);
    mockSaveDecisionBenchmarkRun.mockResolvedValue({
      saved: true,
      filename: "benchmark-run.json",
      path: "/tmp/benchmark-run.json",
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
  });

  it("clears the pending benchmark reset timer on unmount", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const { unmount } = render(
      <DecisionBenchmarkPanel
        decisionModelSettings={decisionModelSettings}
        onApplySuggestedSettings={vi.fn()}
      />,
    );

    const runButton = await screen.findByRole("button", { name: "Benchmark 실행" });

    await waitFor(() => {
      expect(runButton).toBeEnabled();
    });

    fireEvent.click(runButton);

    await waitFor(() => {
      expect(mockRunDecisionBenchmarkApi).toHaveBeenCalledTimes(1);
      expect(mockSaveDecisionBenchmarkRun).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });

    const clearCallsBeforeUnmount = clearTimeoutSpy.mock.calls.length;
    unmount();

    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearCallsBeforeUnmount);

    clearTimeoutSpy.mockRestore();
  });

  it("reuses the mermaid loader promise instead of stacking duplicate script listeners", async () => {
    const existingScript = document.createElement("script");
    existingScript.dataset.mermaidLoader = "true";
    const addEventListenerSpy = vi.spyOn(existingScript, "addEventListener");
    document.head.appendChild(existingScript);

    const renderMermaid = vi.fn().mockResolvedValue({ svg: "<svg></svg>" });
    const initializeMermaid = vi.fn();

    render(
      <>
        <WorkflowMermaidPanel />
        <WorkflowMermaidPanel />
      </>,
    );

    expect(addEventListenerSpy).toHaveBeenCalledTimes(2);

    window.mermaid = {
      initialize: initializeMermaid,
      render: renderMermaid,
    };

    await act(async () => {
      existingScript.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(initializeMermaid).toHaveBeenCalledTimes(2);
      expect(renderMermaid).toHaveBeenCalledTimes(6);
    });

    addEventListenerSpy.mockRestore();
    delete window.mermaid;
  });
});
