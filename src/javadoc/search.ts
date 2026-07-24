import { fetchText } from "../cache.js";
import { javadocBaseUrlFor, type Platform } from "../platform.js";

export interface TypeHit {
  package?: string;
  name: string;
  kind?: string;
  url: string;
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
  }
): Promise<{ types: TypeHit[]; members: MemberHit[]; packages: string[] }> {
  const limit = options?.limit ?? 25;
  const scope = options?.scope ?? "all";
  const platform = options?.platform ?? "paper";
  const indexes = await loadSearchIndexes(version, platform);
  const q = query.trim();
  if (!q) return { types: [], members: [], packages: [] };

  const types: Array<TypeHit & { score: number }> = [];
  const members: Array<MemberHit & { score: number }> = [];
  const packages: Array<{ name: string; score: number }> = [];

  if (scope === "all" || scope === "types") {
    for (const t of indexes.types) {
      const score = Math.max(scoreMatch(q, t.l), scoreMatch(q, `${t.p ?? ""}.${t.l}`));
      if (score > 0) {
        types.push({
          package: t.p,
          name: t.l,
          kind: t.k,
          url: typeUrl(version, t, platform),
          score,
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

  types.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  members.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  packages.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return {
    types: types.slice(0, limit).map(({ score: _s, ...rest }) => rest),
    members: members.slice(0, limit).map(({ score: _s, ...rest }) => rest),
    packages: packages.slice(0, limit).map((p) => p.name),
  };
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
