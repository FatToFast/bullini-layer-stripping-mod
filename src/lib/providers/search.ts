export type SearchFact = {
  query: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
};

export type SearchProviderKind = "noop" | "duckduckgo" | "tavily" | "naver" | "perplexity" | "haystack";

export type SearchProvider = {
  kind: SearchProviderKind;
};

export type AvailableSearchProvider = {
  kind: SearchProviderKind;
  label: string;
  configured: boolean;
};

type DuckDuckGoTopic = {
  Text?: string;
  FirstURL?: string;
  Topics?: DuckDuckGoTopic[];
};

type DuckDuckGoResponse = {
  Abstract?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: DuckDuckGoTopic[];
};

type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

type TavilyResponse = {
  results: TavilyResult[];
};

type NaverNewsItem = {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
};

type NaverNewsResponse = {
  items: NaverNewsItem[];
  total: number;
};

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&[a-zA-Z]+;/g, " ").trim();
}

function flattenTopics(topics: DuckDuckGoTopic[]): DuckDuckGoTopic[] {
  return topics.flatMap((topic) => {
    if (Array.isArray(topic.Topics)) {
      return flattenTopics(topic.Topics);
    }
    return [topic];
  });
}

export function getSearchProvider(kind?: SearchProviderKind): SearchProvider {
  const resolved = kind ?? (process.env.SEARCH_PROVIDER || "noop").toLowerCase();
  if (resolved === "tavily" || resolved === "duckduckgo" || resolved === "naver" || resolved === "perplexity" || resolved === "haystack") {
    return { kind: resolved as SearchProviderKind };
  }
  return { kind: "noop" };
}

export function getAvailableProviders(): AvailableSearchProvider[] {
  return [
    { kind: "noop", label: "None (no search)", configured: true },
    { kind: "tavily", label: "Tavily", configured: !!process.env.TAVILY_API_KEY },
    { kind: "naver", label: "Naver News", configured: !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) },
    { kind: "duckduckgo", label: "DuckDuckGo", configured: true },
    { kind: "perplexity", label: "Perplexity Sonar", configured: !!(process.env.PERPLEXITY_API_KEY || process.env.OPENROUTER_API_KEY) },
    { kind: "haystack", label: "Haystack (Web+RAG)", configured: !!process.env.HAYSTACK_URL },
  ];
}

async function searchDuckDuckGo(query: string): Promise<SearchFact[]> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");
  url.searchParams.set("no_redirect", "1");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with status ${response.status}`);
  }

  const data = (await response.json()) as DuckDuckGoResponse;
  const results: SearchFact[] = [];

  if (data.Abstract && data.AbstractURL) {
    results.push({
      query,
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.Abstract,
      source: data.AbstractSource || "DuckDuckGo",
    });
  }

  const related = flattenTopics(data.RelatedTopics ?? [])
    .filter((topic) => topic.Text && topic.FirstURL)
    .slice(0, 4);

  for (const item of related) {
    results.push({
      query,
      title: item.Text?.split(" - ")[0] || query,
      url: item.FirstURL || "",
      snippet: item.Text || "",
      source: "DuckDuckGo",
    });
  }

  return results;
}

async function searchTavily(query: string): Promise<SearchFact[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set");

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      topic: "finance",
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
      time_range: "week",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Tavily search failed (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as TavilyResponse;

  return (data.results ?? []).map((item) => ({
    query,
    title: item.title,
    url: item.url,
    snippet: item.content,
    source: "Tavily",
  }));
}

async function searchNaverNews(query: string): Promise<SearchFact[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");

  const params = new URLSearchParams({
    query,
    display: "10",
    sort: "date",
  });

  const response = await fetch(`https://openapi.naver.com/v1/search/news.json?${params.toString()}`, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`Naver News search failed with status ${response.status}`);
  }

  const data = (await response.json()) as NaverNewsResponse;

  return (data.items ?? []).map((item) => ({
    query,
    title: stripHtmlTags(item.title),
    url: item.originallink || item.link,
    snippet: stripHtmlTags(item.description),
    source: "Naver News",
    publishedAt: item.pubDate,
  }));
}

type PerplexitySearchResult = {
  title: string;
  url: string;
  snippet: string;
  date?: string;
};

type PerplexityRawResponse = {
  search_results?: PerplexitySearchResult[];
  citations?: string[];
  choices?: Array<{ message?: { content?: string } }>;
};

async function searchPerplexity(query: string): Promise<SearchFact[]> {
  const directKey = process.env.PERPLEXITY_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (!directKey && !openRouterKey) {
    throw new Error("PERPLEXITY_API_KEY or OPENROUTER_API_KEY is required for Perplexity search");
  }

  const baseURL = directKey ? "https://api.perplexity.ai" : "https://openrouter.ai/api/v1";
  const apiKey = directKey ?? openRouterKey!;
  const model = directKey ? "sonar" : "perplexity/sonar";

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(directKey ? {} : {
        "HTTP-Referer": "http://127.0.0.1:3000",
        "X-Title": "Bullini Layer Stripping",
      }),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: query }],
      ...(directKey ? {
        web_search_options: { search_context_size: "low" },
        search_recency_filter: "month",
      } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Perplexity search failed (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const raw = (await response.json()) as PerplexityRawResponse;

  if (raw.search_results && raw.search_results.length > 0) {
    return raw.search_results.map((r) => ({
      query,
      title: r.title,
      url: r.url,
      snippet: r.snippet || "",
      source: "Perplexity",
      publishedAt: r.date,
    }));
  }

  if (raw.citations && raw.citations.length > 0) {
    return raw.citations.map((url, idx) => ({
      query,
      title: `Citation ${idx + 1}`,
      url,
      snippet: raw.choices?.[0]?.message?.content?.slice(0, 200) ?? "",
      source: "Perplexity",
    }));
  }

  return [];
}

type HaystackSearchResult = {
  query: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
};

type HaystackSearchResponse = {
  results: HaystackSearchResult[];
};

async function searchHaystack(query: string): Promise<SearchFact[]> {
  const baseURL = process.env.HAYSTACK_URL;
  if (!baseURL) throw new Error("HAYSTACK_URL is not set");

  const mode = process.env.HAYSTACK_MODE || "hybrid";

  const response = await fetch(`${baseURL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, mode, top_k: 8 }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Haystack search failed (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as HaystackSearchResponse;

  return (data.results ?? []).map((item) => ({
    query,
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    source: item.source || "Haystack",
    publishedAt: item.publishedAt,
  }));
}

export async function searchWithRetry(provider: SearchProvider, query: string, retries = 1): Promise<SearchFact[]> {
  if (provider.kind === "noop") {
    return [];
  }

  const searchFn = provider.kind === "tavily"
    ? searchTavily
    : provider.kind === "naver"
      ? searchNaverNews
      : provider.kind === "perplexity"
        ? searchPerplexity
        : provider.kind === "haystack"
          ? searchHaystack
          : searchDuckDuckGo;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await searchFn(query);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Search failed");
}
