import type { InsightDataset, SearchRoundConfig } from "./types";
import { callLLM } from "@/lib/providers/llm";
import {
  SEARCH_R1_SYSTEM,
  SEARCH_R1_DEFAULT_PROMPT,
  SEARCH_R2_SYSTEM,
  SEARCH_R2_DEFAULT_PROMPT,
} from "./search-query-prompts";

function templateStep1Queries(dataset: InsightDataset): string[] {
  const queries: string[] = [];
  queries.push(`${dataset.canonical_event.title} official statement`);
  queries.push(`${dataset.representative_news.headline} Reuters Bloomberg`);
  if (dataset.portfolio.length > 0) {
    const topCompanies = dataset.portfolio.slice(0, 3).map(p => p.company).join(" ");
    queries.push(`${topCompanies} ${dataset.canonical_event.event_type} impact`);
  }
  return queries.slice(0, 3);
}

function templateStep8Queries(dataset: InsightDataset): string[] {
  const queries: string[] = [];
  queries.push(`${dataset.canonical_event.title} latest update verification`);
  if (dataset.canonical_event.event_type === "policy" || dataset.canonical_event.event_type === "supply") {
    queries.push(`${dataset.canonical_event.title} historical precedent similar case`);
  }
  return queries.slice(0, 2);
}

function parseQueryArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string").slice(0, 5);
  }
  return [];
}

export async function generateStep1Queries(
  dataset: InsightDataset,
  config?: SearchRoundConfig,
): Promise<string[]> {
  if (!config?.prompt && !config?.model) {
    return templateStep1Queries(dataset);
  }

  const userPrompt = config.prompt || SEARCH_R1_DEFAULT_PROMPT;
  const context = JSON.stringify({
    canonical_event: dataset.canonical_event,
    representative_news: dataset.representative_news,
    portfolio: dataset.portfolio.slice(0, 5),
    entities: dataset.entities?.slice(0, 10),
  });

  try {
    const result = await callLLM(
      SEARCH_R1_SYSTEM + "\n\n" + userPrompt,
      context,
      {
        model: config.model,
        temperature: config.temperature ?? 0.3,
        maxTokens: config.maxTokens ?? 400,
      },
    );
    const queries = parseQueryArray(result);
    return queries.length > 0 ? queries : templateStep1Queries(dataset);
  } catch {
    return templateStep1Queries(dataset);
  }
}

export async function generateStep8Queries(
  dataset: InsightDataset,
  analysisContext?: Record<string, unknown>,
  config?: SearchRoundConfig,
): Promise<string[]> {
  if (!config?.prompt && !config?.model) {
    return templateStep8Queries(dataset);
  }

  const userPrompt = config.prompt || SEARCH_R2_DEFAULT_PROMPT;
  const context = JSON.stringify({
    canonical_event: dataset.canonical_event,
    ...(analysisContext ?? {}),
  });

  try {
    const result = await callLLM(
      SEARCH_R2_SYSTEM + "\n\n" + userPrompt,
      context,
      {
        model: config.model,
        temperature: config.temperature ?? 0.3,
        maxTokens: config.maxTokens ?? 400,
      },
    );
    const queries = parseQueryArray(result);
    return queries.length > 0 ? queries : templateStep8Queries(dataset);
  } catch {
    return templateStep8Queries(dataset);
  }
}
