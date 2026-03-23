import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { decodeFilename, isValidFilename } from "@/lib/decision/filename-utils";

const RUNS_DIR = join(process.cwd(), "decision-runs");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const encodedFilename = url.searchParams.get("filename");
  if (!encodedFilename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const filename = decodeFilename(encodedFilename);
  if (!isValidFilename(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const raw = await readFile(join(RUNS_DIR, filename), "utf-8");
    return new Response(raw, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Decision benchmark run not found" }, { status: 404 });
  }
}
