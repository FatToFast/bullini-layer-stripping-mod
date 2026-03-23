import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type { DecisionRunFileSummary } from "@/lib/decision/types";

const RUNS_DIR = join(process.cwd(), "decision-execution-runs");

function safeParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readSummary(file: string): Promise<DecisionRunFileSummary | null> {
  const metaFile = file.replace(/\.json$/, ".meta.json");
  try {
    const raw = await readFile(join(RUNS_DIR, metaFile), "utf-8");
    const parsed = safeParse(raw);
    if (parsed && typeof parsed === "object" && "runId" in parsed) {
      return parsed as DecisionRunFileSummary;
    }
  } catch {
    // fallback below
  }

  try {
    const raw = await readFile(join(RUNS_DIR, file), "utf-8");
    const data = safeParse(raw) as { savedAt?: string; input?: { task?: string }; run?: { runId?: string; finalOutput?: { recommendedQuestion?: string } } } | null;
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
    const summaries = results.filter((item): item is DecisionRunFileSummary => item !== null);
    summaries.sort((a, b) => b.filename.localeCompare(a.filename));
    return NextResponse.json({ runs: summaries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list decision runs" },
      { status: 500 },
    );
  }
}
