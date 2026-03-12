import type { InsightDataset } from "./types";

// Round 1: Pre-analysis search (before Layer 0+1)
export function generateStep1Queries(dataset: InsightDataset): string[] {
  const queries: string[] = [];

  // Query 1: Event title + official source
  queries.push(`${dataset.canonical_event.title} official statement`);

  // Query 2: Headline + major news
  queries.push(`${dataset.representative_news.headline} Reuters Bloomberg`);

  // Query 3: Entity-based (portfolio companies + event)
  if (dataset.portfolio.length > 0) {
    const topCompanies = dataset.portfolio.slice(0, 3).map(p => p.company).join(" ");
    queries.push(`${topCompanies} ${dataset.canonical_event.event_type} impact`);
  }

  return queries.slice(0, 3);
}

// Round 2: Verification search (before Evidence Consolidation)
export function generateStep8Queries(dataset: InsightDataset): string[] {
  const queries: string[] = [];

  queries.push(`${dataset.canonical_event.title} latest update verification`);

  // Search for historical analog if policy/supply event
  if (dataset.canonical_event.event_type === "policy" || dataset.canonical_event.event_type === "supply") {
    queries.push(`${dataset.canonical_event.title} historical precedent similar case`);
  }

  return queries.slice(0, 2);
}
