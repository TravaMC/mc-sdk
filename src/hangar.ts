import { fetchText } from "./cache.js";

export interface HangarProjectHit {
  name: string;
  owner: string;
  slug: string;
  description: string;
  url: string;
  downloads: number;
  stars: number;
  category?: string;
}

interface HangarSearchResponse {
  pagination: { count: number; limit: number; offset: number };
  result: Array<{
    name: string;
    namespace: { owner: string; slug: string };
    description: string;
    stats: { downloads: number; stars: number };
    category?: string;
  }>;
}

export async function searchHangar(
  query: string,
  limit = 10
): Promise<{ total: number; projects: HangarProjectHit[] }> {
  const url = `https://hangar.papermc.io/api/v1/projects?q=${encodeURIComponent(query)}&limit=${limit}&offset=0`;
  const text = await fetchText(url, {
    cacheKey: `hangar:search:${query}:${limit}`,
    ttlMs: 30 * 60 * 1000,
  });
  const data = JSON.parse(text) as HangarSearchResponse;
  return {
    total: data.pagination.count,
    projects: data.result.map((p) => ({
      name: p.name,
      owner: p.namespace.owner,
      slug: p.namespace.slug,
      description: p.description,
      url: `https://hangar.papermc.io/${p.namespace.owner}/${p.namespace.slug}`,
      downloads: p.stats.downloads,
      stars: p.stats.stars,
      category: p.category,
    })),
  };
}
