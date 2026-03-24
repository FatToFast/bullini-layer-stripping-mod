import { NextResponse } from "next/server";
import { listDecisionRunSummaries } from "@/lib/decision/bootstrap";

export async function GET() {
  try {
    const summaries = await listDecisionRunSummaries();
    return NextResponse.json({ runs: summaries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list decision runs" },
      { status: 500 },
    );
  }
}
