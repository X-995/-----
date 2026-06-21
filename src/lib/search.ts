import { fetch } from "@tauri-apps/plugin-http";
import { SearchSettings } from "../types";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class SearchError extends Error {}

/**
 * Web search across multiple BYOK providers. Returns a normalized result list.
 */
export async function webSearch(
  settings: SearchSettings,
  query: string
): Promise<SearchResult[]> {
  if (!settings.apiKey) throw new SearchError("未配置搜索 API Key，请前往设置页填写。");
  switch (settings.provider) {
    case "tavily":
      return tavily(settings.apiKey, query);
    case "bing":
      return bing(settings.apiKey, query);
    case "serpapi":
      return serpapi(settings.apiKey, query);
    default:
      throw new SearchError("未知的搜索服务商。");
  }
}

async function tavily(apiKey: string, query: string): Promise<SearchResult[]> {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 8,
      search_depth: "basic",
    }),
  });
  if (!resp.ok) throw new SearchError(`Tavily 请求失败 (${resp.status})`);
  const json: any = await resp.json();
  return (json.results || []).map((r: any) => ({
    title: r.title || r.url,
    url: r.url,
    snippet: r.content || "",
  }));
}

async function bing(apiKey: string, query: string): Promise<SearchResult[]> {
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=8`;
  const resp = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  });
  if (!resp.ok) throw new SearchError(`Bing 请求失败 (${resp.status})`);
  const json: any = await resp.json();
  return (json.webPages?.value || []).map((r: any) => ({
    title: r.name,
    url: r.url,
    snippet: r.snippet || "",
  }));
}

async function serpapi(apiKey: string, query: string): Promise<SearchResult[]> {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(
    query
  )}&api_key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new SearchError(`SerpAPI 请求失败 (${resp.status})`);
  const json: any = await resp.json();
  return (json.organic_results || []).map((r: any) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || "",
  }));
}
