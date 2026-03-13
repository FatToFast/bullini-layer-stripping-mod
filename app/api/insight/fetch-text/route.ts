import { HttpError, isHttpUrl, fetchArticleHtml, stripHtmlToText } from "@/lib/insight/html-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_LENGTH = 12_000;
const MIN_TEXT_LENGTH = 100;

type FetchTextBody = {
  url?: string;
};

export async function POST(request: Request) {
  let body: FetchTextBody;

  try {
    body = (await request.json()) as FetchTextBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }
  if (!isHttpUrl(url)) {
    return Response.json({ error: "url must start with http:// or https://" }, { status: 400 });
  }

  try {
    const html = await fetchArticleHtml(url);
    const fullText = stripHtmlToText(html);

    if (fullText.length < MIN_TEXT_LENGTH) {
      return Response.json(
        { error: "Extracted article text is too short; could not parse meaningful content" },
        { status: 400 }
      );
    }

    const text = fullText.slice(0, MAX_TEXT_LENGTH);

    return Response.json({
      text,
      charCount: text.length,
      truncated: fullText.length > MAX_TEXT_LENGTH,
      originalCharCount: fullText.length,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch URL" },
      { status: 500 }
    );
  }
}
