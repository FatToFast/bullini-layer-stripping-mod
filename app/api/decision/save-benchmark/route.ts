import { NextResponse } from "next/server";
import { mkdir, rename, writeFile } from "fs/promises";
import { join } from "path";
import type { DecisionBenchmarkFileSummary, DecisionBenchmarkRun } from "@/lib/decision/types";
import { slugifyFilename } from "@/lib/decision/filename-utils";

const RUNS_DIR = join(process.cwd(), "decision-runs");

function buildMeta(run: DecisionBenchmarkRun, filename: string): DecisionBenchmarkFileSummary {
  return {
    id: run.run.runId,
    timestamp: new Date().toISOString(),
    benchmarkId: run.benchmark.id,
    benchmarkTitle: run.benchmark.title,
    score: run.evaluation.score,
    verdict: run.evaluation.verdict,
    filename,
  };
}

async function writeAtomic(filepath: string, data: string) {
  const tmp = `${filepath}.${Date.now()}.tmp`;
  await writeFile(tmp, data, "utf-8");
  await rename(tmp, filepath);
}

export async function POST(request: Request) {
  try {
    const run = (await request.json()) as DecisionBenchmarkRun;
    if (!run?.benchmark?.id || !run?.run?.runId) {
      return NextResponse.json({ error: "Missing required benchmark run fields" }, { status: 400 });
    }

    await mkdir(RUNS_DIR, { recursive: true });
    const safeId = slugifyFilename(run.benchmark.id);
    const id = `${safeId}-${Date.now()}`;
    const filename = `${id}.json`;
    const filepath = join(RUNS_DIR, filename);
    const metaPath = join(RUNS_DIR, `${id}.meta.json`);
    const meta = buildMeta(run, filename);

    await Promise.all([
      writeAtomic(filepath, JSON.stringify(run)),
      writeAtomic(metaPath, JSON.stringify(meta)),
    ]);

    return NextResponse.json({ saved: true, filename, path: filepath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save decision benchmark run" },
      { status: 500 },
    );
  }
}
