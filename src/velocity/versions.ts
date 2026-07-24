import { fetchText } from "../cache.js";
import { javadocBaseUrlFor } from "../platform.js";

export interface VelocityVersionInfo {
  version: string;
  hasJavadoc: boolean;
}

interface FillProjectResponse {
  project: { id: string; name: string };
  versions: Record<string, string[]>;
}

/** Known JD roots that often exist even if Fill naming differs. */
const KNOWN_JD = ["4.1.0", "4.0.0", "3.4.0", "3.3.0"];

export async function listVelocityVersionsFromFill(): Promise<string[]> {
  const text = await fetchText("https://fill.papermc.io/v3/projects/velocity", {
    cacheKey: "fill:velocity:versions",
    ttlMs: 6 * 60 * 60 * 1000,
  });
  const data = JSON.parse(text) as FillProjectResponse;
  const out: string[] = [];
  for (const group of Object.keys(data.versions)) {
    for (const v of data.versions[group]) {
      if (!/-SNAPSHOT$/i.test(v) || !data.versions[group].some((x) => !/-/.test(x))) {
        if (!/-SNAPSHOT$/i.test(v)) out.push(v);
      }
    }
  }
  // Prefer newer first
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

export async function velocityHasJavadoc(version: string): Promise<boolean> {
  const url = `${javadocBaseUrlFor("velocity", version)}type-search-index.js`;
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

export async function resolveVelocityJavadocVersion(requested: string): Promise<{
  version: string;
  available: boolean;
  suggestion?: string;
}> {
  const trimmed = requested.trim();
  if (
    trimmed === "latest" ||
    trimmed === "root" ||
    trimmed === ""
  ) {
    // Root /velocity/ always hosts current snapshot docs
    if (await velocityHasJavadoc("")) {
      return { version: "latest", available: true };
    }
  }
  if (await velocityHasJavadoc(trimmed)) {
    return { version: trimmed, available: true };
  }
  for (const c of KNOWN_JD) {
    if (await velocityHasJavadoc(c)) {
      return { version: trimmed, available: false, suggestion: c };
    }
  }
  return { version: trimmed, available: false, suggestion: "3.4.0" };
}

export async function listVelocityVersionsWithJavadoc(
  limit = 20
): Promise<VelocityVersionInfo[]> {
  const fromFill = await listVelocityVersionsFromFill();
  const candidates = [...new Set([...KNOWN_JD, ...fromFill, "latest"])].slice(
    0,
    limit
  );
  const results: VelocityVersionInfo[] = [];
  const batch = 6;
  for (let i = 0; i < candidates.length; i += batch) {
    const slice = candidates.slice(i, i + batch);
    const flags = await Promise.all(
      slice.map((v) => velocityHasJavadoc(v === "latest" ? "" : v))
    );
    for (let j = 0; j < slice.length; j++) {
      results.push({ version: slice[j], hasJavadoc: flags[j] });
    }
  }
  return results;
}
