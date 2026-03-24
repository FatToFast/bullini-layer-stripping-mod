import { NextResponse } from "next/server";
import { listDecisionBenchmarkRunSummaries } from "@/lib/decision/bootstrap";

export async function GET() {
  try {
    const summaries = await listDecisionBenchmarkRunSummaries();
    return NextResponse.json({ runs: summaries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list decision benchmark runs" },
      { status: 500 },
    );
  }
}
