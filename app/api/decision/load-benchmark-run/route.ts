import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const RUNS_DIR = join(process.cwd(), "decision-runs");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filename = url.searchParams.get("filename");
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  if (safe !== filename) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const raw = await readFile(join(RUNS_DIR, safe), "utf-8");
    return new Response(raw, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Decision benchmark run not found" }, { status: 404 });
  }
}
