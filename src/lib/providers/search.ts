export type SearchFact = {
  query: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
};

export type SearchProviderKind = "noop" | "duckduckgo" | "tavily" | "naver";

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
  if (resolved === "tavily" || resolved === "duckduckgo" || resolved === "naver") {
    return { kind: resolved };
  }
  return { kind: "noop" };
}

export function getAvailableProviders(): AvailableSearchProvider[] {
  return [
    { kind: "noop", label: "None (no search)", configured: true },
    { kind: "tavily", label: "Tavily", configured: !!process.env.TAVILY_API_KEY },
    { kind: "naver", label: "Naver News", configured: !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) },
    { kind: "duckduckgo", label: "DuckDuckGo", configured: true },
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

export async function searchWithRetry(provider: SearchProvider, query: string, retries = 1): Promise<SearchFact[]> {
  if (provider.kind === "noop") {
    return [];
  }

  const searchFn = provider.kind === "tavily"
    ? searchTavily
    : provider.kind === "naver"
      ? searchNaverNews
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
