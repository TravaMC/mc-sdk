import { fetchText } from "../cache.js";
import { adventureJavadocBaseUrl } from "../config.js";
import type { Platform } from "../platform.js";
import { latestPublishedJavadoc } from "./available.js";

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

/** Last Adventure 4.x release; its Javadoc lives on jd.advntr.dev (jd.papermc.io only hosts 5.x). */
export const ADVENTURE_4_JD = "https://jd.advntr.dev/api/4.26.1/";
/** Offline fallback for the 5.x line (jd.papermc.io/adventure/ redirects to the newest). */
export const ADVENTURE_5_FALLBACK_JD = "https://jd.papermc.io/adventure/5.2.0/";

/**
 * Which Adventure major a pinned server line ships with.
 * Paper/Folia/Purpur 26.2+ and Velocity 4.x → Adventure 5; 26.1.x, 1.21.x and Velocity 3.x → 4.
 */
export function adventureMajorFor(platform: Platform | undefined, version: string | undefined): 4 | 5 {
  const v = (version ?? "").trim();
  if (!v || v === "latest" || v === "root") return 5;
  const [maj, min] = v.split(".").map((p) => Number.parseInt(p, 10) || 0);
  if (platform === "velocity") return maj >= 4 ? 5 : 4;
  if (maj >= 27) return 5;
  if (maj === 26) return min >= 2 ? 5 : 4;
  return 4;
}

export async function searchAdventure(
  query: string,
  limit = 20,
  options?: { major?: 4 | 5 }
) {
  const major = options?.major ?? 5;
  const base = adventureJavadocBaseUrl();
  const candidates: string[] = [];
  if (major === 4) {
    candidates.push(`${ADVENTURE_4_JD}type-search-index.js`);
  } else {
    const latest = await latestPublishedJavadoc("adventure");
    if (latest) candidates.push(`${base}${latest}/type-search-index.js`);
    candidates.push(`${ADVENTURE_5_FALLBACK_JD}type-search-index.js`);
  }

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
    throw new Error(
      `Could not load Adventure ${major}.x type-search-index (${candidates.join(", ")})`
    );
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

  const adventureVersion = /\/(\d+\.\d+\.\d+)\/$/.exec(usedBase)?.[1];
  return {
    base: usedBase,
    adventureMajor: major,
    adventureVersion,
    ...(major === 5
      ? {
          note: "Adventure 5 (Paper/Purpur/Folia 26.2+, Velocity 4.x): Component/ClickEvent changes — see mc_adventure_guide 'Adventure 5' section.",
        }
      : {}),
    hits,
  };
}
