import { fetchText } from "../cache.js";
import { adventureJavadocBaseUrl } from "../config.js";

interface TypeIndexEntry {
  p?: string;
  l: string;
  u?: string;
}

function parseJsIndexArray<T>(source: string, varName: string): T[] {
  const marker = `${varName} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${varName}`);
  let i = start + marker.length;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] !== "[") throw new Error(`Expected array for ${varName}`);
  let depth = 0;
  let inString = false;
  let escape = false;
  const begin = i;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return JSON.parse(source.slice(begin, i + 1)) as T[];
    }
  }
  throw new Error(`Unterminated ${varName}`);
}

export async function searchAdventure(query: string, limit = 20) {
  const base = adventureJavadocBaseUrl();
  // Adventure JD may redirect to a versioned path — try common roots
  const candidates = [
    `${base}type-search-index.js`,
    `${base}latest/type-search-index.js`,
    `https://jd.papermc.io/adventure/4.25.0/type-search-index.js`,
  ];

  let types: TypeIndexEntry[] | null = null;
  let usedBase = base;
  for (const url of candidates) {
    try {
      const raw = await fetchText(url, {
        cacheKey: `adventure:type-index:${url}`,
        ttlMs: 24 * 60 * 60 * 1000,
      });
      types = parseJsIndexArray<TypeIndexEntry>(raw, "typeSearchIndex");
      usedBase = url.replace(/type-search-index\.js$/, "");
      break;
    } catch {
      /* try next */
    }
  }
  if (!types) {
    throw new Error("Could not load Adventure type-search-index from jd.papermc.io/adventure");
  }

  const q = query.toLowerCase();
  const hits = types
    .map((t) => {
      const name = t.l.toLowerCase();
      const full = `${t.p ?? ""}.${t.l}`.toLowerCase();
      let score = 0;
      if (name === q || full.endsWith("." + q)) score = 1000;
      else if (name.startsWith(q)) score = 800;
      else if (name.includes(q) || full.includes(q)) score = 400;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ t }) => ({
      package: t.p,
      name: t.l,
      url: t.u
        ? new URL(t.u, usedBase).toString()
        : `${usedBase}${t.p ? t.p.replaceAll(".", "/") + "/" : ""}${t.l}.html`,
    }));

  return { base: usedBase, hits };
}
