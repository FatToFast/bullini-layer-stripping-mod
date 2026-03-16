import { NextResponse } from "next/server";
import { writeFile, rename, mkdir } from "fs/promises";
import { join } from "path";
import type { RunSnapshot } from "@/lib/insight/types";

const RUNS_DIR = join(process.cwd(), "runs");

function buildMeta(snapshot: RunSnapshot, filename: string) {
  return {
    id: snapshot.id,
    timestamp: snapshot.timestamp,
    newsUrl: snapshot.input?.newsUrl ?? "",
    searchProvider: snapshot.input?.searchProvider ?? "",
    defaultModel: snapshot.input?.modelSettings?.defaults?.model ?? "",
    stageCount: Array.isArray(snapshot.stages) ? snapshot.stages.length : 0,
    hasEvaluations: snapshot.evaluations ? Object.keys(snapshot.evaluations).length > 0 : false,
    filename,
  };
}

async function writeAtomic(filepath: string, data: string): Promise<void> {
  const tmp = `${filepath}.${Date.now()}.tmp`;
  await writeFile(tmp, data, "utf-8");
  await rename(tmp, filepath);
}

export async function POST(request: Request) {
  try {
    const snapshot = (await request.json()) as RunSnapshot;

    if (!snapshot.id || !snapshot.timestamp) {
      return NextResponse.json(
        { error: "Missing required fields: id, timestamp" },
        { status: 400 }
      );
    }

    await mkdir(RUNS_DIR, { recursive: true });

    const filename = `${snapshot.id}.json`;
    const filepath = join(RUNS_DIR, filename);
    const metaPath = join(RUNS_DIR, `${snapshot.id}.meta.json`);

    const meta = buildMeta(snapshot, filename);

    await Promise.all([
      writeAtomic(filepath, JSON.stringify(snapshot)),
      writeAtomic(metaPath, JSON.stringify(meta)),
    ]);

    return NextResponse.json({ saved: true, filename, path: filepath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
