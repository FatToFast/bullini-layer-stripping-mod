import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type { DecisionBenchmarkFileSummary } from "@/lib/decision/types";

const RUNS_DIR = join(process.cwd(), "decision-runs");

function safeParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readSummary(file: string): Promise<DecisionBenchmarkFileSummary | null> {
  const metaFile = file.replace(/\.json$/, ".meta.json");
  try {
    const raw = await readFile(join(RUNS_DIR, metaFile), "utf-8");
    const parsed = safeParse(raw);
    if (parsed && typeof parsed === "object" && "benchmarkId" in parsed) {
      return parsed as DecisionBenchmarkFileSummary;
    }
  } catch {
    // fallback below
  }

  try {
    const raw = await readFile(join(RUNS_DIR, file), "utf-8");
    const data = safeParse(raw) as { benchmark?: { id?: string; title?: string }; evaluation?: { score?: number; verdict?: DecisionBenchmarkFileSummary["verdict"] }; run?: { runId?: string } } | null;
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

export async function GET() {
  try {
    let files: string[];
    try {
      files = await readdir(RUNS_DIR);
    } catch {
      return NextResponse.json({ runs: [] });
    }

    const jsonFiles = files.filter((file) => file.endsWith(".json") && !file.endsWith(".meta.json"));
    const results = await Promise.all(jsonFiles.map(readSummary));
    const summaries = results.filter((item): item is DecisionBenchmarkFileSummary => item !== null);
    summaries.sort((a, b) => b.filename.localeCompare(a.filename));
    return NextResponse.json({ runs: summaries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list decision benchmark runs" },
      { status: 500 },
    );
  }
}
