import { TtlCache } from "@/lib/cache";
import { CACHE_HTML_TTL_MS, CACHE_HTML_MAX_ENTRIES } from "@/lib/config";

export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const htmlCache = new TtlCache<string>(CACHE_HTML_TTL_MS, CACHE_HTML_MAX_ENTRIES);

export function isHttpUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function stripHtmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchArticleHtml(url: string) {
  return htmlCache.getOrSet(url, async () => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: abortController.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; InsightExtractor/1.0)",
        },
      });

      if (!response.ok) {
        throw new HttpError(`Failed to fetch URL: ${response.status}`, 400);
      }

      return await response.text();
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new HttpError("Fetching URL timed out after 15 seconds", 400);
      }
      throw new HttpError(
        `Failed to fetch URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        400
      );
    } finally {
      clearTimeout(timeoutId);
    }
  });
}
