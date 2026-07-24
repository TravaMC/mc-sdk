import { fetchText } from "./cache.js";
import { javadocBaseUrlFor } from "./platform.js";
import {
  defaultMinJava,
  normalizeGameVersion,
  paperApiDependencyNotation,
  pluginApiVersion,
} from "./versioning.js";

export interface PaperVersionInfo {
  version: string;
  hasJavadoc: boolean;
  minJava?: number;
  apiVersion?: string;
  dependencyExample?: string;
  channelHint?: string;
}

interface FillProjectResponse {
  project: { id: string; name: string };
  versions: Record<string, string[]>;
}

export async function listPaperVersionsFromFill(): Promise<string[]> {
  const text = await fetchText("https://fill.papermc.io/v3/projects/paper", {
    cacheKey: "fill:paper:versions",
    ttlMs: 6 * 60 * 60 * 1000,
  });
  const data = JSON.parse(text) as FillProjectResponse;
  const groups = Object.keys(data.versions).sort((a, b) => compareVersions(b, a));
  const out: string[] = [];
  for (const group of groups) {
    const versions = [...data.versions[group]].sort((a, b) => compareVersions(b, a));
    for (const v of versions) {
      if (/-/.test(v) && !versions.some((x) => !/-/.test(x))) out.push(v);
      else if (!/-/.test(v)) out.push(v);
    }
  }
  return out;
}

export async function getPaperBuilds(version: string): Promise<unknown> {
  const text = await fetchText(
    `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}`,
    { cacheKey: `fill:paper:version:${version}`, ttlMs: 60 * 60 * 1000 }
  );
  return JSON.parse(text);
}

export async function versionHasJavadoc(version: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${javadocBaseUrlFor("paper", version)}type-search-index.js`,
      {
        method: "HEAD",
        headers: { "User-Agent": "mc-sdk/3.0" },
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function resolveJavadocVersion(requested: string): Promise<{
  version: string;
  available: boolean;
  suggestion?: string;
  warning?: string;
  input?: string;
}> {
  const norm = normalizeGameVersion(requested);
  const trimmed = norm.version;
  if (await versionHasJavadoc(trimmed)) {
    return {
      version: trimmed,
      available: true,
      warning: norm.warning,
      input: norm.input,
    };
  }

  const all = await listPaperVersionsFromFill();
  const candidates = all.filter((v) => sharesFamily(trimmed, v));
  for (const c of candidates) {
    if (await versionHasJavadoc(c)) {
      return {
        version: c,
        available: true,
        suggestion: c,
        warning: norm.warning,
        input: norm.input,
      };
    }
  }

  for (const c of ["26.2", "26.1", "1.21.11", "1.21.8", "1.21.4", "1.20.4"]) {
    if (await versionHasJavadoc(c)) {
      return {
        version: trimmed,
        available: false,
        suggestion: c,
        warning: norm.warning,
        input: norm.input,
      };
    }
  }
  return {
    version: trimmed,
    available: false,
    warning: norm.warning,
    input: norm.input,
  };
}

function sharesFamily(a: string, b: string): boolean {
  const pa = a.split(".");
  const pb = b.split(".");
  if (pa[0] !== pb[0]) return false;
  if (/^\d{2,}$/.test(pa[0])) return true;
  return pa[1] === pb[1];
}

export function compareVersions(a: string, b: string): number {
  const na = normalizeParts(a);
  const nb = normalizeParts(b);
  const len = Math.max(na.length, nb.length);
  for (let i = 0; i < len; i++) {
    const da = na[i] ?? 0;
    const db = nb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return a.localeCompare(b);
}

function normalizeParts(v: string): number[] {
  const core = v.split("-")[0];
  return core.split(".").map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export async function listVersionsWithJavadocStatus(
  limit = 40
): Promise<PaperVersionInfo[]> {
  const versions = (await listPaperVersionsFromFill()).slice(0, limit);
  const results: PaperVersionInfo[] = [];
  const batchSize = 6;
  for (let i = 0; i < versions.length; i += batchSize) {
    const batch = versions.slice(i, i + batchSize);
    const flags = await Promise.all(batch.map((v) => versionHasJavadoc(v)));
    for (let j = 0; j < batch.length; j++) {
      const version = batch[j];
      results.push({
        version,
        hasJavadoc: flags[j],
        minJava: defaultMinJava(version),
        apiVersion: pluginApiVersion(version),
        dependencyExample: paperApiDependencyNotation(version),
        channelHint: /^\d{2}\./.test(version) ? "modern" : "classic",
      });
    }
  }
  return results;
}
