import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { parseDecisionBenchmarkCase } from "@/lib/decision/schemas";

const CASES_DIR = join(process.cwd(), "decision-benchmarks");

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function POST(request: Request) {
  try {
    const parsed = parseDecisionBenchmarkCase(await request.json());
    await mkdir(CASES_DIR, { recursive: true });
    const filename = `${sanitizeFilename(parsed.id)}.json`;
    const filepath = join(CASES_DIR, filename);
    await writeFile(filepath, JSON.stringify(parsed, null, 2), "utf-8");
    return NextResponse.json({ saved: true, filename, path: filepath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save benchmark case" },
      { status: 500 },
    );
  }
}
