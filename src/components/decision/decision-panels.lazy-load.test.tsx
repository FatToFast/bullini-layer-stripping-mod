import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DecisionBenchmarkPanel } from "@/components/decision/benchmark-panel";
import { DecisionExecutionPanel } from "@/components/decision/execution-panel";
import type { DecisionBenchmarkCase, DecisionModelSettings } from "@/lib/decision/types";

const mockListDecisionBenchmarks = vi.fn();
const mockListSavedDecisionBenchmarkRuns = vi.fn();
const mockListSavedDecisionRuns = vi.fn();

vi.mock("@/lib/decision/api", () => ({
  listDecisionBenchmarks: (...args: unknown[]) => mockListDecisionBenchmarks(...args),
  listSavedDecisionBenchmarkRuns: (...args: unknown[]) => mockListSavedDecisionBenchmarkRuns(...args),
  loadSavedDecisionBenchmarkRun: vi.fn(),
  runDecisionBenchmarkApi: vi.fn(),
  saveDecisionBenchmarkCase: vi.fn(),
  saveDecisionBenchmarkRun: vi.fn(),
  listSavedDecisionRuns: (...args: unknown[]) => mockListSavedDecisionRuns(...args),
  loadSavedDecisionRun: vi.fn(),
  runDecisionPipelineApi: vi.fn(),
  saveDecisionRun: vi.fn(),
}));

vi.mock("@/hooks/use-decision-benchmark-history", () => ({
  compareDecisionBenchmarkRuns: vi.fn(),
  formatDecisionBenchmarkDate: (timestamp: number) => `formatted-${timestamp}`,
  useDecisionBenchmarkHistory: () => ({
    saveBenchmarkRun: vi.fn(),
    loadBenchmarkRun: vi.fn(),
    latestRunsByBenchmark: new Map(),
  }),
}));

vi.mock("@/hooks/use-decision-run-history", () => ({
  compareDecisionExecutionRuns: vi.fn(),
  formatDecisionRunDate: (timestamp: number) => `formatted-${timestamp}`,
  useDecisionRunHistory: () => ({
    saveDecisionRun: vi.fn(),
    loadDecisionRun: vi.fn(),
    latestRun: null,
  }),
}));

vi.mock("@/lib/decision/article-benchmark", () => ({
  buildDecisionBenchmarkFromExecutionRun: vi.fn(() => null),
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

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

let observers: ObserverRecord[] = [];

describe("Decision panels lazy loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    observers = [];

    mockListDecisionBenchmarks.mockResolvedValue([benchmarkCase]);
    mockListSavedDecisionBenchmarkRuns.mockResolvedValue([]);
    mockListSavedDecisionRuns.mockResolvedValue([]);

    class MockIntersectionObserver {
      callback: IntersectionObserverCallback;
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push({
          callback,
          observe: this.observe,
          disconnect: this.disconnect,
        });
      }
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver as unknown as typeof IntersectionObserver);
  });

  it("defers benchmark panel list requests until the panel intersects", async () => {
    render(
      <DecisionBenchmarkPanel
        decisionModelSettings={decisionModelSettings}
        onApplySuggestedSettings={vi.fn()}
        deferInitialLoad
      />,
    );

    expect(mockListDecisionBenchmarks).not.toHaveBeenCalled();
    expect(mockListSavedDecisionBenchmarkRuns).not.toHaveBeenCalled();
    expect(observers).toHaveLength(1);

    observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    await waitFor(() => {
      expect(mockListDecisionBenchmarks).toHaveBeenCalledTimes(1);
      expect(mockListSavedDecisionBenchmarkRuns).toHaveBeenCalledTimes(1);
    });
  });

  it("defers execution panel saved-run requests until the panel intersects", async () => {
    render(
      <DecisionExecutionPanel
        decisionModelSettings={decisionModelSettings}
        deferInitialLoad
      />,
    );

    expect(mockListSavedDecisionRuns).not.toHaveBeenCalled();
    expect(observers).toHaveLength(1);

    observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    await waitFor(() => {
      expect(mockListSavedDecisionRuns).toHaveBeenCalledTimes(1);
    });
  });
});
