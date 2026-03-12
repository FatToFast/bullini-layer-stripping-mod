import OpenAI from "openai";

type LlmOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

function getClient() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (openRouterApiKey) {
    return new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterApiKey,
      defaultHeaders: {
        "HTTP-Referer": "http://127.0.0.1:3000",
        "X-Title": "Bullini Layer Stripping",
      },
    });
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("Set OPENROUTER_API_KEY or OPENAI_API_KEY before running the app");
  }

  return new OpenAI({ apiKey: openAiApiKey });
}

function getDefaultModel() {
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_MODEL || "x-ai/grok-4.1-fast";
  }
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function extractJson(content: string) {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("Model response did not contain JSON");
}

export async function callLLM(systemPrompt: string, userContent: string, options?: LlmOptions) {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: options?.model || getDefaultModel(),
    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    max_tokens: options?.maxTokens ?? 1800,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const payload = completion.choices[0]?.message?.content?.trim();
  if (!payload) {
    throw new Error("Model returned an empty response");
  }

  try {
    return JSON.parse(extractJson(payload));
  } catch (error) {
    throw new Error(
      `Failed to parse model JSON output: ${error instanceof Error ? error.message : "Unknown parsing error"}`
    );
  }
}
