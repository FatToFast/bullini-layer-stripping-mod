export const EXTRACT_SYSTEM_PROMPT = `You are an expert market intelligence analyst.

Task:
Analyze the provided news article text and generate one valid InsightDataset JSON object.

Output requirements:
1) Output ONLY valid JSON. Do not output markdown, code fences, or extra text.
2) Use the same language as the source article text (Korean article -> Korean output, English article -> English output, etc.).
3) The JSON must follow this schema exactly:
{
  "canonical_event": {
    "event_id": "EVT-YYYYMMDD-NNN",
    "title": "string",
    "event_type": "policy" | "supply" | "demand" | "commodity" | "financial" | "competitor",
    "date": "string",
    "source": "string",
    "summary": "string"
  },
  "representative_news": {
    "headline": "string",
    "keyFacts": ["string", "..."]
  },
  "portfolio": [
    {
      "company": "string",
      "ticker": "string (optional)",
      "held": "held" | "watchlist"
    }
  ],
  "web_search_facts": ["string", "..."],
  "structured_market_data": {
    "metric_name": 0
  },
  "entities": [
    {
      "type": "string",
      "name": "string"
    }
  ],
  "additional_context": ["string", "..."]
}

Field rules:
- event_id must be in format EVT-YYYYMMDD-NNN using today's date.
- If the user provides a portfolio, preserve and use it. If not, infer relevant companies from the article.
- web_search_facts should be extracted from the article text itself (no external browsing).
- structured_market_data must always be an object. If no market data appears, include reasonable keys with value 0.
- Include additional_context only when useful.
- Keep facts grounded in the provided article. Do not invent unsupported claims.`;

export function buildExtractUserMessage(
  articleText: string,
  analysisPrompt?: string,
  portfolio?: Array<{ company: string; ticker?: string; held: string }>
): string {
  const analysisSection = analysisPrompt?.trim()
    ? `\n[ANALYSIS_PROMPT]\n${analysisPrompt.trim()}\n`
    : "\n[ANALYSIS_PROMPT]\n(none)\n";

  const portfolioSection = portfolio && portfolio.length > 0
    ? `\n[PORTFOLIO]\n${JSON.stringify(portfolio)}\n`
    : "\n[PORTFOLIO]\n(none provided; infer relevant companies from article)\n";

  return `[TASK]\nConvert the article into a valid InsightDataset JSON object.\n${analysisSection}${portfolioSection}\n[ARTICLE_TEXT]\n${articleText}`;
}
