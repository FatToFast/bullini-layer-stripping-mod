import { NextResponse } from "next/server";
import { mkdir, rename, writeFile } from "fs/promises";
import { join } from "path";
import type { DecisionExecutionRun, DecisionRunFileSummary } from "@/lib/decision/types";

const RUNS_DIR = join(process.cwd(), "decision-execution-runs");

function buildMeta(record: DecisionExecutionRun, filename: string): DecisionRunFileSummary {
  return {
    id: `${record.run.runId}-${record.savedAt}`,
    timestamp: record.savedAt,
    runId: record.run.runId,
    taskPreview: record.input.task.slice(0, 120),
    recommendedQuestion: record.run.finalOutput?.recommendedQuestion ?? "",
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
    const record = (await request.json()) as DecisionExecutionRun;
    if (!record?.input?.task || !record?.run?.runId || !record?.savedAt) {
      return NextResponse.json({ error: "Missing required decision run fields" }, { status: 400 });
    }

    await mkdir(RUNS_DIR, { recursive: true });
    const id = `${record.run.runId}-${Date.now()}`;
    const filename = `${id}.json`;
    const filepath = join(RUNS_DIR, filename);
    const metaPath = join(RUNS_DIR, `${id}.meta.json`);
    const meta = buildMeta(record, filename);

    await Promise.all([
      writeAtomic(filepath, JSON.stringify(record)),
      writeAtomic(metaPath, JSON.stringify(meta)),
    ]);

    return NextResponse.json({ saved: true, filename, path: filepath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save decision run" },
      { status: 500 },
    );
  }
}
