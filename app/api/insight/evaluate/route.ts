import {
  EVALUATE_SYSTEM_PROMPT,
  buildEvaluateUserMessage,
} from "@/lib/insight/evaluate-prompt";
import { callLLM } from "@/lib/providers/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvaluateRequestBody = {
  actualOutput: string;
  expectedCriteria: string;
  modelSettings?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
};

type BreakdownItem = {
  criterion: string;
  score: number;
  comment: string;
};

type EvaluationResponse = {
  score: number;
  reasoning: string;
  breakdown: BreakdownItem[];
};

export async function POST(request: Request) {
  let body: EvaluateRequestBody;

  try {
    body = (await request.json()) as EvaluateRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const actualOutput = body.actualOutput?.trim();
  const expectedCriteria = body.expectedCriteria?.trim();

  if (!actualOutput) {
    return Response.json({ error: "actualOutput is required" }, { status: 400 });
  }
  if (!expectedCriteria) {
    return Response.json({ error: "expectedCriteria is required" }, { status: 400 });
  }

  try {
    const userMessage = buildEvaluateUserMessage(actualOutput, expectedCriteria);

    const llmOutput = await callLLM(EVALUATE_SYSTEM_PROMPT, userMessage, {
      model: body.modelSettings?.model,
      temperature: body.modelSettings?.temperature ?? 0.1,
      maxTokens: body.modelSettings?.maxTokens ?? 2000,
    });

    const result = llmOutput as EvaluationResponse;

    if (
      typeof result.score !== "number" ||
      typeof result.reasoning !== "string" ||
      !Array.isArray(result.breakdown)
    ) {
      return Response.json(
        { error: "LLM returned invalid evaluation format" },
        { status: 502 }
      );
    }

    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
