import { fetchText } from "../cache.js";
import { javadocTreeExists } from "../javadoc/indexParse.js";
import { javadocBaseUrlFor } from "../platform.js";
import { compareVersions as compareLoose } from "../util/versionCompare.js";
import { velocityMinJava } from "../versioning.js";

export interface VelocityVersionInfo {
  version: string;
  hasJavadoc: boolean;
  /** Listed as a release on Fill (JD may still lag) */
  released?: boolean;
  /** velocity-api bytecode level (4.x → 25) */
  minJava?: number;
}

interface FillProjectResponse {
  project: { id: string; name: string };
  versions: Record<string, string[]>;
}

/**
 * Known JD roots, newest first. JD publication lags releases: Velocity 4.3.x is released
 * (Fill) but jd.papermc.io/velocity/ still redirects to 4.2.1 — see javadoc/available.ts.
 */
const KNOWN_JD = ["4.2.1", "4.2.0", "4.1.0", "4.0.0", "3.4.0", "3.3.0"];

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

export async function velocityHasJavadoc(version: string): Promise<boolean> {
  return javadocTreeExists(javadocBaseUrlFor("velocity", version));
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
  return { version: trimmed, available: false, suggestion: KNOWN_JD[0] };
}

export async function listVelocityVersionsWithJavadoc(
  limit = 20
): Promise<VelocityVersionInfo[]> {
  const fromFill = await listVelocityVersionsFromFill().catch(() => [] as string[]);
  const candidates = [
    "latest",
    ...[...new Set([...fromFill, ...KNOWN_JD])].sort((a, b) => compareLoose(b, a)),
  ].slice(0, limit);
  const results: VelocityVersionInfo[] = [];
  const batch = 6;
  for (let i = 0; i < candidates.length; i += batch) {
    const slice = candidates.slice(i, i + batch);
    const flags = await Promise.all(
      slice.map((v) => velocityHasJavadoc(v === "latest" ? "" : v))
    );
    for (let j = 0; j < slice.length; j++) {
      const version = slice[j];
      results.push({
        version,
        hasJavadoc: flags[j],
        released: version === "latest" ? undefined : fromFill.includes(version),
        minJava: version === "latest" ? undefined : velocityMinJava(version),
      });
    }
  }
  return results;
}
