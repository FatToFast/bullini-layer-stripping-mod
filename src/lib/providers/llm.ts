import OpenAI from "openai";
import { LLM_TIMEOUT_MS, LLM_MAX_RETRIES, LLM_DEFAULT_MAX_TOKENS } from "@/lib/config";

type LlmOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
};

export type LlmResult = {
  content: unknown;
  usage: LlmUsage | null;
  model: string;
};

let cachedClient: OpenAI | null = null;
let cachedClientKey: string | null = null;

function buildClient(): OpenAI {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (openRouterApiKey) {
    return new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterApiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: LLM_MAX_RETRIES,
      defaultHeaders: {
        "HTTP-Referer": "http://127.0.0.1:3000",
        "X-Title": "Bullini Layer Stripping",
      },
    });
  }

  if (!openAiApiKey) {
    throw new Error("Set OPENROUTER_API_KEY or OPENAI_API_KEY before running the app");
  }

  return new OpenAI({ apiKey: openAiApiKey, timeout: LLM_TIMEOUT_MS, maxRetries: LLM_MAX_RETRIES });
}

function getClient(): OpenAI {
  const activeKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? null;
  if (cachedClient && cachedClientKey === activeKey) return cachedClient;

  const client = buildClient();
  cachedClient = client;
  cachedClientKey = activeKey;
  return client;
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

export async function callLLM(
  systemPrompt: string,
  userContent: string,
  options?: LlmOptions
): Promise<LlmResult> {
  const client = getClient();
  const model = options?.model || getDefaultModel();
  const completion = await client.chat.completions.create({
    model,
    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    max_tokens: options?.maxTokens ?? LLM_DEFAULT_MAX_TOKENS,
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

  const usage: LlmUsage | null = completion.usage
    ? {
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        totalTokens: completion.usage.total_tokens ?? 0,
        cost: (completion.usage as { cost?: number }).cost,
      }
    : null;

  try {
    return {
      content: JSON.parse(extractJson(payload)),
      usage,
      model,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse model JSON output: ${error instanceof Error ? error.message : "Unknown parsing error"}`
    );
  }
}
