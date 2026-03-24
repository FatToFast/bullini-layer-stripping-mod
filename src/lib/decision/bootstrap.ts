import { readdir, readFile } from "fs/promises";
import { join } from "path";

import { DEFAULT_DECISION_BENCHMARKS } from "@/lib/decision/benchmarks";
import { parseDecisionBenchmarkCase } from "@/lib/decision/schemas";
import type {
  DecisionBenchmarkCase,
  DecisionBenchmarkFileSummary,
  DecisionRunFileSummary,
} from "@/lib/decision/types";

const BENCHMARK_CASES_DIR = join(process.cwd(), "decision-benchmarks");
const BENCHMARK_RUNS_DIR = join(process.cwd(), "decision-runs");
const DECISION_RUNS_DIR = join(process.cwd(), "decision-execution-runs");

function safeParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listStoredBenchmarks(): Promise<DecisionBenchmarkCase[]> {
  try {
    const files = await readdir(BENCHMARK_CASES_DIR);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    const results = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const raw = await readFile(join(BENCHMARK_CASES_DIR, file), "utf-8");
          return parseDecisionBenchmarkCase(JSON.parse(raw) as unknown);
        } catch {
          return null;
        }
      }),
    );
    return results.filter((item): item is DecisionBenchmarkCase => item !== null);
  } catch {
    return [];
  }
}

async function readBenchmarkRunSummary(file: string): Promise<DecisionBenchmarkFileSummary | null> {
  const metaFile = file.replace(/\.json$/, ".meta.json");
  try {
    const raw = await readFile(join(BENCHMARK_RUNS_DIR, metaFile), "utf-8");
    const parsed = safeParse(raw);
    if (parsed && typeof parsed === "object" && "benchmarkId" in parsed) {
      return parsed as DecisionBenchmarkFileSummary;
    }
  } catch {
    // fallback below
  }

  try {
    const raw = await readFile(join(BENCHMARK_RUNS_DIR, file), "utf-8");
    const data = safeParse(raw) as {
      benchmark?: { id?: string; title?: string };
      evaluation?: { score?: number; verdict?: DecisionBenchmarkFileSummary["verdict"] };
      run?: { runId?: string };
    } | null;
    if (!data) return null;
    return {
      id: data.run?.runId ?? file.replace(".json", ""),
      timestamp: "",
      benchmarkId: data.benchmark?.id ?? "unknown",
      benchmarkTitle: data.benchmark?.title ?? file,
      score: data.evaluation?.score ?? 0,
      verdict: data.evaluation?.verdict ?? "iterate",
      filename: file,
    };
  } catch {
    return null;
  }
}

export async function listDecisionBenchmarkRunSummaries(): Promise<DecisionBenchmarkFileSummary[]> {
  try {
    const files = await readdir(BENCHMARK_RUNS_DIR);
    const jsonFiles = files.filter((file) => file.endsWith(".json") && !file.endsWith(".meta.json"));
    const results = await Promise.all(jsonFiles.map(readBenchmarkRunSummary));
    return results
      .filter((item): item is DecisionBenchmarkFileSummary => item !== null)
      .sort((a, b) => b.filename.localeCompare(a.filename));
  } catch {
    return [];
  }
}

async function readDecisionRunSummary(file: string): Promise<DecisionRunFileSummary | null> {
  const metaFile = file.replace(/\.json$/, ".meta.json");
  try {
    const raw = await readFile(join(DECISION_RUNS_DIR, metaFile), "utf-8");
    const parsed = safeParse(raw);
    if (parsed && typeof parsed === "object" && "runId" in parsed) {
      return parsed as DecisionRunFileSummary;
    }
  } catch {
    // fallback below
  }

  try {
    const raw = await readFile(join(DECISION_RUNS_DIR, file), "utf-8");
    const data = safeParse(raw) as {
      savedAt?: string;
      input?: { task?: string };
      run?: { runId?: string; finalOutput?: { recommendedQuestion?: string } };
    } | null;
    if (!data) return null;
    return {
      id: data.run?.runId ?? file.replace(".json", ""),
      timestamp: data.savedAt ?? "",
      runId: data.run?.runId ?? file.replace(".json", ""),
      taskPreview: data.input?.task?.slice(0, 120) ?? file,
      recommendedQuestion: data.run?.finalOutput?.recommendedQuestion ?? "",
      filename: file,
    };
  } catch {
    return null;
  }
}

export async function listDecisionRunSummaries(): Promise<DecisionRunFileSummary[]> {
  try {
    const files = await readdir(DECISION_RUNS_DIR);
    const jsonFiles = files.filter((file) => file.endsWith(".json") && !file.endsWith(".meta.json"));
    const results = await Promise.all(jsonFiles.map(readDecisionRunSummary));
    return results
      .filter((item): item is DecisionRunFileSummary => item !== null)
      .sort((a, b) => b.filename.localeCompare(a.filename));
  } catch {
    return [];
  }
}

export async function loadDecisionWorkspaceBootstrap() {
  const [storedBenchmarks, benchmarkRuns, decisionRuns] = await Promise.all([
    listStoredBenchmarks(),
    listDecisionBenchmarkRunSummaries(),
    listDecisionRunSummaries(),
  ]);

  return {
    benchmarks: [...DEFAULT_DECISION_BENCHMARKS, ...storedBenchmarks],
    benchmarkRuns,
    decisionRuns,
  };
}
