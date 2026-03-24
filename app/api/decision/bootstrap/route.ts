import { NextResponse } from "next/server";

import { loadDecisionWorkspaceBootstrap } from "@/lib/decision/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await loadDecisionWorkspaceBootstrap();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load decision workspace bootstrap" },
      { status: 500 },
    );
  }
}
