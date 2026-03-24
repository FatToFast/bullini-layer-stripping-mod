import { beforeEach, describe, expect, it, vi } from "vitest";

const bootstrapPayload = {
  benchmarks: [
    {
      id: "benchmark-1",
      title: "Benchmark Scenario",
      input: {
        task: "A benchmark task that is long enough to validate correctly",
        stakeholders: ["Stakeholder 1"],
        successCriteria: ["Success criterion 1"],
      },
      expectedCriteria: ["Expected criterion 1"],
    },
  ],
  benchmarkRuns: [
    {
      id: "benchmark-run-1",
      timestamp: "2026-03-24T00:00:00.000Z",
      benchmarkId: "benchmark-1",
      benchmarkTitle: "Benchmark Scenario",
      score: 88,
      verdict: "keep" as const,
      filename: "benchmark-run-1.json",
    },
  ],
  decisionRuns: [
    {
      id: "decision-run-1",
      timestamp: "2026-03-24T00:00:00.000Z",
      runId: "decision-run-1",
      taskPreview: "Preview",
      recommendedQuestion: "What should we decide?",
      filename: "decision-run-1.json",
    },
  ],
};

describe("decision api bootstrap caching", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("shares a single bootstrap request across list calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => bootstrapPayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("./api");
    const [benchmarks, benchmarkRuns, decisionRuns] = await Promise.all([
      api.listDecisionBenchmarks(),
      api.listSavedDecisionBenchmarkRuns(),
      api.listSavedDecisionRuns(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/decision/bootstrap", { signal: undefined });
    expect(Array.isArray(benchmarks) && benchmarks[0]?.id).toBe("benchmark-1");
    expect(Array.isArray(benchmarkRuns) && benchmarkRuns[0]?.id).toBe("benchmark-run-1");
    expect(Array.isArray(decisionRuns) && decisionRuns[0]?.id).toBe("decision-run-1");
  });

  it("invalidates the bootstrap cache after a successful save", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => bootstrapPayload,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ saved: true, filename: "decision-run.json", path: "/tmp/decision-run.json" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => bootstrapPayload,
      });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("./api");

    await api.listSavedDecisionRuns();
    await api.saveDecisionRun({
      input: { task: "Run task" },
      run: { runId: "decision-run-1", stages: [], finalOutput: null },
      savedAt: "2026-03-24T00:00:00.000Z",
    });
    await api.listSavedDecisionRuns();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/decision/bootstrap");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/decision/save-run");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/decision/bootstrap");
  });
});
