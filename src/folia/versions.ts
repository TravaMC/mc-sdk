import { fetchText } from "../cache.js";
import { javadocBaseUrlFor } from "../platform.js";
import {
  defaultMinJava,
  normalizeGameVersion,
  paperApiDependencyNotation,
  pluginApiVersion,
} from "../versioning.js";

export interface FoliaVersionInfo {
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

const KNOWN_JD = ["26.1.2", "26.1", "1.21.8", "1.21.4", "1.20.6"];

export async function listFoliaVersionsFromFill(): Promise<string[]> {
  const text = await fetchText("https://fill.papermc.io/v3/projects/folia", {
    cacheKey: "fill:folia:versions",
    ttlMs: 6 * 60 * 60 * 1000,
  });
  const data = JSON.parse(text) as FillProjectResponse;
  const out: string[] = [];
  for (const group of Object.keys(data.versions)) {
    for (const v of data.versions[group]) {
      if (!/-SNAPSHOT$/i.test(v)) out.push(v);
    }
  }
  out.sort((a, b) => compareLoose(b, a));
  return [...new Set(out)];
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

export async function foliaHasJavadoc(version: string): Promise<boolean> {
  const url = `${javadocBaseUrlFor("folia", version)}type-search-index.js`;
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

export async function resolveFoliaJavadocVersion(requested: string): Promise<{
  version: string;
  available: boolean;
  suggestion?: string;
  warning?: string;
  input?: string;
}> {
  const norm = normalizeGameVersion(requested);
  const trimmed = norm.version;
  if (trimmed === "latest" || trimmed === "root" || trimmed === "") {
    if (await foliaHasJavadoc("")) {
      return {
        version: "latest",
        available: true,
        warning: norm.warning,
        input: norm.input,
      };
    }
  }
  if (await foliaHasJavadoc(trimmed)) {
    return {
      version: trimmed,
      available: true,
      warning: norm.warning,
      input: norm.input,
    };
  }
  for (const c of KNOWN_JD) {
    if (await foliaHasJavadoc(c)) {
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
    suggestion: "26.1.2",
    warning: norm.warning,
    input: norm.input,
  };
}

export async function listFoliaVersionsWithJavadoc(
  limit = 20
): Promise<FoliaVersionInfo[]> {
  const fromFill = await listFoliaVersionsFromFill();
  const candidates = [...new Set([...KNOWN_JD, ...fromFill, "latest"])].slice(
    0,
    limit
  );
  const results: FoliaVersionInfo[] = [];
  const batch = 6;
  for (let i = 0; i < candidates.length; i += batch) {
    const slice = candidates.slice(i, i + batch);
    const flags = await Promise.all(
      slice.map((v) => foliaHasJavadoc(v === "latest" ? "" : v))
    );
    for (let j = 0; j < slice.length; j++) {
      const version = slice[j];
      results.push({
        version,
        hasJavadoc: flags[j],
        minJava: version === "latest" ? undefined : defaultMinJava(version),
        apiVersion: version === "latest" ? undefined : pluginApiVersion(version),
        dependencyExample:
          version === "latest" ? undefined : paperApiDependencyNotation(version),
        channelHint:
          version === "latest"
            ? undefined
            : /^\d{2}\./.test(version)
              ? "modern"
              : "classic",
      });
    }
  }
  return results;
}
