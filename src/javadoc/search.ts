import { fetchText } from "../cache.js";
import { javadocBaseUrlFor, type Platform } from "../platform.js";
import {
  annotationWarnings,
  curatedAnnotation,
  mergeAnnotations,
  parseDeprecationMeta,
  type TypeAnnotation,
} from "./deprecation.js";

export interface TypeHit {
  package?: string;
  name: string;
  kind?: string;
  url: string;
  deprecated?: boolean;
  experimental?: boolean;
  forRemoval?: boolean;
  since?: string;
  prefer?: string;
  replacement?: string;
  usageNote?: string;
  warning?: string;
}

export interface MemberHit {
  package?: string;
  className?: string;
  name: string;
  urlPath?: string;
  url: string;
}

export interface SearchIndexes {
  types: TypeIndexEntry[];
  members: MemberIndexEntry[];
  packages: PackageIndexEntry[];
}

interface TypeIndexEntry {
  p?: string;
  l: string;
  k?: string;
  u?: string;
}

interface MemberIndexEntry {
  p?: string;
  c?: string;
  l: string;
  u?: string;
}

interface PackageIndexEntry {
  l: string;
}

function parseJsIndexArray<T>(source: string, varName: string): T[] {
  const marker = `${varName} = `;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find ${varName} in search index`);
  }
  let i = start + marker.length;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] !== "[") {
    throw new Error(`Expected array for ${varName}`);
  }

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
      if (depth === 0) {
        return JSON.parse(source.slice(begin, i + 1)) as T[];
      }
    }
  }
  throw new Error(`Unterminated array for ${varName}`);
}

export async function loadSearchIndexes(
  version: string,
  platform: Platform = "paper"
): Promise<SearchIndexes> {
  const base = javadocBaseUrlFor(platform, version);
  const cachePrefix = `jd:${platform}:${version || "root"}`;
  const [typesRaw, membersRaw, packagesRaw] = await Promise.all([
    fetchText(`${base}type-search-index.js`, {
      cacheKey: `${cachePrefix}:type-search-index`,
    }),
    fetchText(`${base}member-search-index.js`, {
      cacheKey: `${cachePrefix}:member-search-index`,
    }).catch(() => "memberSearchIndex = [];updateSearchResults();"),
    fetchText(`${base}package-search-index.js`, {
      cacheKey: `${cachePrefix}:package-search-index`,
    }).catch(() => "packageSearchIndex = [];updateSearchResults();"),
  ]);

  return {
    types: parseJsIndexArray<TypeIndexEntry>(typesRaw, "typeSearchIndex"),
    members: parseJsIndexArray<MemberIndexEntry>(membersRaw, "memberSearchIndex"),
    packages: parseJsIndexArray<PackageIndexEntry>(packagesRaw, "packageSearchIndex"),
  };
}

function typeUrl(
  version: string,
  entry: TypeIndexEntry,
  platform: Platform
): string {
  const base = javadocBaseUrlFor(platform, version);
  if (entry.u) return new URL(entry.u, base).toString();
  const pkg = entry.p ?? "";
  const pkgPath = pkg ? pkg.replaceAll(".", "/") + "/" : "";
  return `${base}${pkgPath}${entry.l}.html`;
}

function memberUrl(
  version: string,
  entry: MemberIndexEntry,
  platform: Platform
): string {
  const base = javadocBaseUrlFor(platform, version);
  const pkg = entry.p ?? "";
  const cls = entry.c ?? "";
  const pkgPath = pkg ? pkg.replaceAll(".", "/") + "/" : "";
  const anchor = entry.u ?? entry.l;
  return `${base}${pkgPath}${cls}.html#${anchor}`;
}

function scoreMatch(query: string, candidate: string): number {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c === q) return 1000;
  if (c.startsWith(q)) return 800 - Math.min(c.length, 200);
  if (c.includes(q)) return 500 - Math.min(c.indexOf(q), 100);
  const parts = q.split(/[\s._-]+/).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => c.includes(p))) return 300;
  return 0;
}

export async function searchApi(
  version: string,
  query: string,
  options?: {
    limit?: number;
    scope?: "all" | "types" | "members" | "packages";
    platform?: Platform;
    /** include = keep all (default); exclude = drop deprecated types; only = deprecated only */
    deprecated?: "include" | "exclude" | "only";
    /** Fetch JD deprecation blocks for top Event hits (cached). Default true when query looks event-like. */
    enrichAnnotations?: boolean;
  }
): Promise<{
  types: TypeHit[];
  members: MemberHit[];
  packages: string[];
  warnings: string[];
}> {
  const limit = options?.limit ?? 25;
  const scope = options?.scope ?? "all";
  const platform = options?.platform ?? "paper";
  const deprecatedMode = options?.deprecated ?? "include";
  const indexes = await loadSearchIndexes(version, platform);
  const q = query.trim();
  if (!q) return { types: [], members: [], packages: [], warnings: [] };

  const types: Array<TypeHit & { score: number }> = [];
  const members: Array<MemberHit & { score: number }> = [];
  const packages: Array<{ name: string; score: number }> = [];

  if (scope === "all" || scope === "types") {
    for (const t of indexes.types) {
      const score = Math.max(scoreMatch(q, t.l), scoreMatch(q, `${t.p ?? ""}.${t.l}`));
      if (score > 0) {
        const curated = curatedAnnotation(t.l, t.p);
        types.push({
          package: t.p,
          name: t.l,
          kind: t.k,
          url: typeUrl(version, t, platform),
          score: score + annotationScoreBoost(curated, t.p),
          ...flattenAnnotation(curated),
        });
      }
    }
  }

  if (scope === "all" || scope === "members") {
    for (const m of indexes.members) {
      const label = `${m.c ?? ""}.${m.l}`;
      const score = Math.max(scoreMatch(q, m.l), scoreMatch(q, label));
      if (score > 0) {
        members.push({
          package: m.p,
          className: m.c,
          name: m.l,
          urlPath: m.u,
          url: memberUrl(version, m, platform),
          score,
        });
      }
    }
  }

  if (scope === "all" || scope === "packages") {
    for (const p of indexes.packages) {
      const score = scoreMatch(q, p.l);
      if (score > 0) packages.push({ name: p.l, score });
    }
  }

  types.sort(
    (a, b) =>
      Number(Boolean(a.deprecated)) - Number(Boolean(b.deprecated)) ||
      b.score - a.score ||
      a.name.localeCompare(b.name)
  );
  members.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  packages.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  let typed = types.slice(0, Math.max(limit * 2, limit));

  const shouldEnrich =
    options?.enrichAnnotations ??
    (/\bevent\b/i.test(q) ||
      /SpawnLocation|PlayerJoin|AsyncPlayer/i.test(q) ||
      typed.some((t) => t.name.endsWith("Event")));

  if (shouldEnrich && (scope === "all" || scope === "types")) {
    // Cap + parallel: sequential hung fetches used to freeze the whole MCP for minutes.
    typed = await enrichTypeAnnotations(version, platform, typed.slice(0, 6));
    typed.sort(
      (a, b) =>
        Number(Boolean(a.deprecated)) - Number(Boolean(b.deprecated)) ||
        b.score - a.score ||
        a.name.localeCompare(b.name)
    );
  }

  if (deprecatedMode === "exclude") {
    typed = typed.filter((t) => !t.deprecated);
  } else if (deprecatedMode === "only") {
    typed = typed.filter((t) => t.deprecated);
  }

  const finalTypes = typed.slice(0, limit).map(({ score: _s, ...rest }) => rest);
  const warnings = finalTypes.flatMap((t) =>
    annotationWarnings(
      {
        deprecated: t.deprecated,
        experimental: t.experimental,
        forRemoval: t.forRemoval,
        since: t.since,
        prefer: t.prefer,
        replacement: t.replacement,
        warning: t.warning,
        usageNote: t.usageNote,
      },
      t.name
    )
  );

  return {
    types: finalTypes,
    members: members.slice(0, limit).map(({ score: _s, ...rest }) => rest),
    packages: packages.slice(0, limit).map((p) => p.name),
    warnings: [...new Set(warnings)],
  };
}

function flattenAnnotation(ann?: TypeAnnotation): Partial<TypeHit> {
  if (!ann || !Object.keys(ann).length) return {};
  return {
    deprecated: ann.deprecated,
    experimental: ann.experimental,
    forRemoval: ann.forRemoval,
    since: ann.since,
    prefer: ann.prefer,
    replacement: ann.replacement,
    usageNote: ann.usageNote,
    warning: ann.warning,
  };
}

function annotationScoreBoost(ann: TypeAnnotation | undefined, pkg?: string): number {
  let boost = 0;
  if (ann?.deprecated) boost -= 120;
  if (ann?.prefer) boost -= 20;
  if (pkg?.startsWith("io.papermc")) boost += 15;
  if (pkg?.startsWith("org.spigotmc")) boost -= 10;
  return boost;
}

async function enrichTypeAnnotations(
  version: string,
  platform: Platform,
  hits: Array<TypeHit & { score: number }>
): Promise<Array<TypeHit & { score: number }>> {
  return Promise.all(
    hits.map(async (hit) => {
      if (hit.deprecated || hit.prefer || !hit.name.endsWith("Event")) {
        return hit;
      }
      try {
        const html = await fetchText(hit.url, {
          cacheKey: `jd:${platform}:${version || "root"}:page:${hit.package ?? ""}:${hit.name}`,
          ttlMs: 24 * 60 * 60 * 1000,
          timeoutMs: 8_000,
          retries: 1,
        });
        const sig =
          html.match(/class="type-signature"[^>]*>([\s\S]*?)<\/div>/i)?.[1]?.replace(
            /<[^>]+>/g,
            " "
          ) ||
          html.match(/@Deprecated[\s\S]{0,180}?class\s+\w+/)?.[0] ||
          "";
        const block =
          html.match(
            /class="deprecation-block"[^>]*>([\s\S]*?)<\/div>\s*<div class="description"/i
          )?.[1]?.replace(/<[^>]+>/g, " ") ||
          html.match(
            /class="deprecation-comment"[^>]*>([\s\S]*?)<\/div>/i
          )?.[1]?.replace(/<[^>]+>/g, " ") ||
          "";
        const parsed = parseDeprecationMeta(
          sig.replace(/\s+/g, " ").trim(),
          block.replace(/\s+/g, " ").trim()
        );
        const merged = mergeAnnotations(
          curatedAnnotation(hit.name, hit.package),
          parsed,
          {
            deprecated: hit.deprecated,
            experimental: hit.experimental,
            forRemoval: hit.forRemoval,
            since: hit.since,
            prefer: hit.prefer,
            replacement: hit.replacement,
            warning: hit.warning,
            usageNote: hit.usageNote,
          }
        );
        return {
          ...hit,
          ...flattenAnnotation(merged),
          score: hit.score + annotationScoreBoost(merged, hit.package),
        };
      } catch {
        return hit;
      }
    })
  );
}

export async function findType(
  version: string,
  className: string,
  packageHint?: string,
  platform: Platform = "paper"
): Promise<TypeHit | null> {
  const indexes = await loadSearchIndexes(version, platform);
  const exact = indexes.types.filter((t) => {
    if (t.l !== className && !t.l.endsWith(`.${className}`)) return false;
    if (packageHint && t.p !== packageHint) return false;
    return true;
  });
  if (exact.length === 0) {
    const fuzzy = await searchApi(version, className, {
      limit: 5,
      scope: "types",
      platform,
    });
    return fuzzy.types[0] ?? null;
  }
  exact.sort((a, b) => preference(a.p, platform) - preference(b.p, platform));
  const best = exact[0];
  return {
    package: best.p,
    name: best.l,
    kind: best.k,
    url: typeUrl(version, best, platform),
  };
}

function preference(pkg: string | undefined, platform: Platform): number {
  if (!pkg) return 50;
  if (platform === "velocity") {
    if (pkg.startsWith("com.velocitypowered")) return 0;
    if (pkg.startsWith("net.kyori")) return 1;
    return 10;
  }
  if (platform === "purpur") {
    if (pkg.startsWith("org.purpurmc")) return 0;
    if (pkg.startsWith("org.bukkit")) return 1;
    if (pkg.startsWith("io.papermc")) return 2;
    if (pkg.startsWith("com.destroystokyo")) return 3;
    return 10;
  }
  if (pkg.startsWith("org.bukkit")) return 0;
  if (pkg.startsWith("io.papermc")) return 1;
  if (pkg.startsWith("com.destroystokyo")) return 2;
  return 10;
}
