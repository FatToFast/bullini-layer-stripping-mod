import { buildExtractUserMessage, EXTRACT_SYSTEM_PROMPT } from "@/lib/insight/extract-prompt";
import { HttpError, isHttpUrl, fetchArticleHtml, stripHtmlToText } from "@/lib/insight/html-utils";
import { parseInsightDataset } from "@/lib/insight/schemas";
import { callLLM } from "@/lib/providers/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_LENGTH = 12_000;
const MIN_TEXT_LENGTH = 100;

type PortfolioItem = {
  company: string;
  ticker?: string;
  held: "held" | "watchlist";
};

type ExtractModelSettings = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

type ExtractRequestBody = {
  url?: string;
  text?: string;
  analysisPrompt?: string;
  portfolio?: PortfolioItem[];
  modelSettings?: ExtractModelSettings;
};

export async function POST(request: Request) {
  let body: ExtractRequestBody;

  try {
    body = (await request.json()) as ExtractRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    let articleText: string;

    if (body.text?.trim()) {
      articleText = body.text.trim().slice(0, MAX_TEXT_LENGTH);
    } else {
      const url = body.url?.trim();
      if (!url) {
        return Response.json({ error: "url or text is required" }, { status: 400 });
      }
      if (!isHttpUrl(url)) {
        return Response.json({ error: "url must start with http:// or https://" }, { status: 400 });
      }
      const html = await fetchArticleHtml(url);
      articleText = stripHtmlToText(html).slice(0, MAX_TEXT_LENGTH);
    }

    if (articleText.length < MIN_TEXT_LENGTH) {
      return Response.json(
        { error: "Article text is too short; could not parse meaningful content" },
        { status: 400 }
      );
    }

    const userContent = buildExtractUserMessage(
      articleText,
      body.analysisPrompt,
      body.portfolio
    );

    const { content } = await callLLM(EXTRACT_SYSTEM_PROMPT, userContent, {
      model: body.modelSettings?.model,
      temperature: body.modelSettings?.temperature ?? 0.15,
      maxTokens: body.modelSettings?.maxTokens ?? 3000,
    });

    const dataset = parseInsightDataset(content);
    return Response.json({ dataset }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
