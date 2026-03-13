import {
  STAGE_EVALUATE_SYSTEM_PROMPT,
  buildStageEvaluateUserMessage,
} from "@/lib/insight/evaluate-stage-prompt";
import { callLLM } from "@/lib/providers/llm";
import type { StageEvaluationResult } from "@/lib/insight/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvaluateStageRequestBody = {
  stagePrompt: string;
  stageOutput: string;
  modelSettings?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
};

export async function POST(request: Request) {
  let body: EvaluateStageRequestBody;

  try {
    body = (await request.json()) as EvaluateStageRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stagePrompt = body.stagePrompt?.trim();
  const stageOutput = body.stageOutput?.trim();

  if (!stagePrompt) {
    return Response.json({ error: "stagePrompt is required" }, { status: 400 });
  }
  if (!stageOutput) {
    return Response.json({ error: "stageOutput is required" }, { status: 400 });
  }

  try {
    const userMessage = buildStageEvaluateUserMessage(stagePrompt, stageOutput);

    const llmOutput = await callLLM(STAGE_EVALUATE_SYSTEM_PROMPT, userMessage, {
      model: body.modelSettings?.model,
      temperature: body.modelSettings?.temperature ?? 0.1,
      maxTokens: body.modelSettings?.maxTokens ?? 3000,
    });

    const result = llmOutput as StageEvaluationResult;

    if (
      typeof result.overall_score !== "number" ||
      typeof result.summary !== "string" ||
      !Array.isArray(result.checklist)
    ) {
      return Response.json(
        { error: "LLM returned invalid stage evaluation format" },
        { status: 502 },
      );
    }

    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Stage evaluation failed" },
      { status: 500 },
    );
  }
}
