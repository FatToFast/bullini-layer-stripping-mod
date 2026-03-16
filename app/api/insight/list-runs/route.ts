import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const RUNS_DIR = join(process.cwd(), "runs");

export type RunSummary = {
  id: string;
  timestamp: string;
  newsUrl: string;
  searchProvider: string;
  defaultModel: string;
  stageCount: number;
  hasEvaluations: boolean;
  filename: string;
};

function safeParse(raw: string): unknown | null {
  try { return JSON.parse(raw); } catch { return null; }
}

async function readSummary(file: string): Promise<RunSummary | null> {
  const metaFile = file.replace(/\.json$/, ".meta.json");
  try {
    const raw = await readFile(join(RUNS_DIR, metaFile), "utf-8");
    const parsed = safeParse(raw);
    if (parsed && typeof parsed === "object" && "id" in parsed) return parsed as RunSummary;
  } catch {
  }
  try {
    const raw = await readFile(join(RUNS_DIR, file), "utf-8");
    const data = safeParse(raw);
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    return {
      id: (d.id as string) ?? file.replace(".json", ""),
      timestamp: (d.timestamp as string) ?? "",
      newsUrl: ((d.input as Record<string, unknown>)?.newsUrl as string) ?? "",
      searchProvider: ((d.input as Record<string, unknown>)?.searchProvider as string) ?? "",
      defaultModel: (((d.input as Record<string, unknown>)?.modelSettings as Record<string, unknown>)?.defaults as Record<string, unknown>)?.model as string ?? "",
      stageCount: Array.isArray(d.stages) ? d.stages.length : 0,
      hasEvaluations: d.evaluations ? Object.keys(d.evaluations as object).length > 0 : false,
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

    const jsonFiles = files.filter((f) => f.endsWith(".json") && !f.endsWith(".meta.json"));

    const results = await Promise.all(jsonFiles.map(readSummary));
    const summaries = results.filter((s): s is RunSummary => s !== null);

    summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return NextResponse.json({ runs: summaries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list runs" },
      { status: 500 }
    );
  }
}
