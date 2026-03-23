import { evaluateDecisionOutput } from "@/lib/decision/benchmark-runner";
import type { ModelConfigOverride } from "@/lib/decision/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  actualOutput?: unknown;
  expectedCriteria?: string[];
  modelSettings?: Omit<ModelConfigOverride, "prompt">;
};

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.actualOutput === undefined) {
    return Response.json({ error: "actualOutput is required" }, { status: 400 });
  }
  if (!Array.isArray(body.expectedCriteria) || body.expectedCriteria.length === 0) {
    return Response.json({ error: "expectedCriteria must be a non-empty string array" }, { status: 400 });
  }

  try {
    const result = await evaluateDecisionOutput(body.actualOutput, body.expectedCriteria, body.modelSettings);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Decision evaluation failed" },
      { status: 500 },
    );
  }
}
