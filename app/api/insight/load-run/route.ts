import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { TtlCache } from "@/lib/cache";
import { CACHE_RUN_TTL_MS, CACHE_RUN_MAX_ENTRIES } from "@/lib/config";

const RUNS_DIR = join(process.cwd(), "runs");
const runCache = new TtlCache<string>(CACHE_RUN_TTL_MS, CACHE_RUN_MAX_ENTRIES);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filename = url.searchParams.get("filename");
  if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  if (safe !== filename) return NextResponse.json({ error: "Invalid filename" }, { status: 400 });

  try {
    const raw = await runCache.getOrSet(safe, () =>
      readFile(join(RUNS_DIR, safe), "utf-8"),
    );
    return new Response(raw, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
}
