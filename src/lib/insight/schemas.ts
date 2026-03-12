import { z } from "zod";
import type { InsightDataset } from "./types";

export const canonicalEventSchema = z.object({
  event_id: z.string(),
  title: z.string(),
  event_type: z.enum(["policy", "supply", "demand", "commodity", "financial", "competitor"]),
  date: z.string(),
  source: z.string(),
  summary: z.string(),
});

export const representativeNewsSchema = z.object({
  headline: z.string(),
  keyFacts: z.array(z.string()),
});

export const portfolioItemSchema = z.object({
  company: z.string(),
  ticker: z.string().optional(),
  held: z.enum(["held", "watchlist"]),
});

export const entityItemSchema = z.object({
  type: z.string(),
  name: z.string(),
});

export const structuredMarketDataSchema = z.record(z.string(), z.number());

export const insightDatasetSchema = z.object({
  canonical_event: canonicalEventSchema,
  representative_news: representativeNewsSchema,
  portfolio: z.array(portfolioItemSchema),
  web_search_facts: z.array(z.string()),
  structured_market_data: structuredMarketDataSchema,
  entities: z.array(entityItemSchema),
  additional_context: z.array(z.string()).optional(),
});

export function parseInsightDataset(input: unknown): InsightDataset {
  const result = insightDatasetSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `[${issue.path.join(".")}] ${issue.message}`)
      .join("; ");
    throw new Error(`InsightDataset validation failed: ${issues}`);
  }
  return result.data;
}
