import { runDecisionPipeline } from "@/lib/decision/pipeline";
import { parseDecisionInput } from "@/lib/decision/schemas";
import type { DecisionInput, DecisionModelSettings, DecisionPipelineOptions } from "@/lib/decision/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  input?: DecisionInput;
  modelSettings?: DecisionModelSettings;
  systemPrompt?: string;
  stagePolicies?: DecisionPipelineOptions["stagePolicies"];
};

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.input) {
    return Response.json({ error: "input is required" }, { status: 400 });
  }

  try {
    const input = parseDecisionInput(body.input);
    const result = await runDecisionPipeline(input, {
      modelSettings: body.modelSettings,
      systemPrompt: body.systemPrompt,
      stagePolicies: body.stagePolicies,
    });
    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Decision pipeline failed" },
      { status: 500 },
    );
  }
}
