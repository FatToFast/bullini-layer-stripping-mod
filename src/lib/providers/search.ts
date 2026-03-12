export type SearchFact = {
  query: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
};

type SearchProviderKind = "noop" | "duckduckgo";

export type SearchProvider = {
  kind: SearchProviderKind;
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

function flattenTopics(topics: DuckDuckGoTopic[]): DuckDuckGoTopic[] {
  return topics.flatMap((topic) => {
    if (Array.isArray(topic.Topics)) {
      return flattenTopics(topic.Topics);
    }
    return [topic];
  });
}

export function getSearchProvider(): SearchProvider {
  const provider = (process.env.SEARCH_PROVIDER || "noop").toLowerCase();
  if (provider === "duckduckgo") {
    return { kind: "duckduckgo" };
  }
  return { kind: "noop" };
}

async function searchDuckDuckGo(query: string): Promise<SearchFact[]> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");
  url.searchParams.set("no_redirect", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
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

export async function searchWithRetry(provider: SearchProvider, query: string, retries = 1): Promise<SearchFact[]> {
  if (provider.kind === "noop") {
    return [];
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await searchDuckDuckGo(query);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Search failed");
}
