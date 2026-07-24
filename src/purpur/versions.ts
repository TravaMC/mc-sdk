import { fetchText } from "../cache.js";
import { javadocBaseUrlFor } from "../platform.js";
import {
  defaultMinJava,
  normalizeGameVersion,
  pluginApiVersion,
  purpurApiDependencyNotation,
} from "../versioning.js";

export interface PurpurVersionInfo {
  version: string;
  hasJavadoc: boolean;
  minJava?: number;
  apiVersion?: string;
  dependencyExample?: string;
  channelHint?: string;
}

interface PurpurVersionsResponse {
  versions: string[];
}

/** Purpur hosts a single JD tree (not /javadoc/{version}/). */
export async function purpurHasJavadoc(): Promise<boolean> {
  const url = `${javadocBaseUrlFor("purpur", "")}type-search-index.js`;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "mc-sdk/3.0" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listPurpurVersionsFromApi(): Promise<string[]> {
  const text = await fetchText("https://api.purpurmc.org/v2/purpur", {
    cacheKey: "purpur:api:versions",
    ttlMs: 6 * 60 * 60 * 1000,
  });
  const data = JSON.parse(text) as PurpurVersionsResponse;
  const versions = [...(data.versions ?? [])];
  versions.sort((a, b) => compareLoose(b, a));
  return versions;
}

function compareLoose(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return a.localeCompare(b);
}

export async function resolvePurpurJavadocVersion(requested: string): Promise<{
  version: string;
  available: boolean;
  suggestion?: string;
  javadocRoot: string;
  warning?: string;
  input?: string;
}> {
  const norm = normalizeGameVersion(requested.trim() || "latest");
  const trimmed = norm.version || "latest";
  const jdOk = await purpurHasJavadoc();
  const root = javadocBaseUrlFor("purpur", "");
  if (!jdOk) {
    return {
      version: trimmed,
      available: false,
      suggestion: "1.21.1",
      javadocRoot: root,
      warning: norm.warning,
      input: norm.input,
    };
  }
  // JD is unversioned; version pin is for Maven/Minecraft alignment
  if (trimmed === "latest" || trimmed === "root") {
    const all = await listPurpurVersionsFromApi().catch(() => [] as string[]);
    return {
      version: all[0] ?? "latest",
      available: true,
      javadocRoot: root,
      warning: norm.warning,
      input: norm.input,
    };
  }
  return {
    version: trimmed,
    available: true,
    javadocRoot: root,
    warning: norm.warning,
    input: norm.input,
  };
}

export async function listPurpurVersionsWithJavadoc(
  limit = 30
): Promise<PurpurVersionInfo[]> {
  const jdOk = await purpurHasJavadoc();
  const versions = (await listPurpurVersionsFromApi()).slice(0, limit);
  return versions.map((version) => ({
    version,
    hasJavadoc: jdOk,
    minJava: defaultMinJava(version),
    apiVersion: pluginApiVersion(version),
    dependencyExample: purpurApiDependencyNotation(version),
    channelHint: /^\d{2}\./.test(version) ? "modern" : "classic",
  }));
}
