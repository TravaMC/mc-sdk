import { USER_AGENT } from "../meta.js";
import { listFoliaVersionsFromFill, foliaHasJavadoc } from "../folia/versions.js";
import { listPurpurVersionsFromApi } from "../purpur/versions.js";
import { listVelocityVersionsFromFill, velocityHasJavadoc } from "../velocity/versions.js";
import { compareVersions, listPaperVersionsFromFill, versionHasJavadoc } from "../versions.js";
import { platformLabel, type Platform } from "../platform.js";
import { normalizeGameVersion } from "../versioning.js";

/**
 * Javadoc publication lags releases (e.g. Velocity 4.3.x and Folia 26.3 shipped before
 * jd.papermc.io had them). This module maps a pinned version to the Javadoc path that
 * actually exists, with an explicit warning instead of a 404 or a refused pin.
 */

type JdProject = "paper" | "folia" | "velocity" | "adventure";

/** Offline fallbacks, newest first. The live root redirect is tried before these. */
const KNOWN_JD: Record<Exclude<JdProject, "adventure">, string[]> = {
  paper: ["26.3", "26.2", "26.1.2", "1.21.11", "1.21.8", "1.21.4", "1.20.4"],
  folia: ["26.2", "26.1.2", "1.21.11", "1.21.8", "1.21.4", "1.20.6"],
  velocity: ["4.2.1", "4.2.0", "4.1.0", "4.0.0", "3.4.0", "3.3.0"],
};

const MEMO_TTL_MS = 6 * 60 * 60 * 1000;
const latestMemo = new Map<JdProject, { at: number; value: string | null }>();
const pathMemo = new Map<string, { at: number; value: JdPathResolution }>();

/**
 * jd.papermc.io/{project}/ redirects to the newest published Javadoc (e.g. /velocity/ → /velocity/4.2.1/).
 * Returns that version id, or null when offline / no redirect.
 */
export async function latestPublishedJavadoc(project: JdProject): Promise<string | null> {
  const memo = latestMemo.get(project);
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.value;
  let value: string | null = null;
  try {
    const res = await fetch(`https://jd.papermc.io/${project}/`, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    const loc = res.headers.get("location") ?? "";
    const m = new RegExp(`/${project}/([^/]+)/?`).exec(loc);
    value = m ? decodeURIComponent(m[1]) : null;
  } catch {
    value = null;
  }
  latestMemo.set(project, { at: Date.now(), value });
  return value;
}

async function hasJavadoc(platform: Platform, version: string): Promise<boolean> {
  if (platform === "velocity") return velocityHasJavadoc(version);
  if (platform === "folia") return foliaHasJavadoc(version);
  return versionHasJavadoc(version);
}

export interface JdPathResolution {
  /** Version segment to use in jd.papermc.io URLs ("" = platform root / Purpur single tree) */
  jdVersion: string;
  /** True when the pinned version has no Javadoc and a nearby one is used instead */
  fallback: boolean;
  warning?: string;
}

/**
 * Pick the Javadoc path for a pinned version. Exact when published; otherwise the newest
 * published Javadoc that is not newer than the pin (or the newest overall).
 */
export async function resolveJavadocPath(
  platform: Platform,
  version: string
): Promise<JdPathResolution> {
  const v = normalizeGameVersion(version).version;
  if (platform === "purpur") return { jdVersion: "", fallback: false };
  if (!v || v === "latest" || v === "root") return { jdVersion: "", fallback: false };

  const key = `${platform}:${v}`;
  const memo = pathMemo.get(key);
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.value;

  let result: JdPathResolution;
  if (await hasJavadoc(platform, v)) {
    result = { jdVersion: v, fallback: false };
  } else {
    const project = platform as Exclude<JdProject, "adventure">;
    const latest = await latestPublishedJavadoc(project);
    const candidates = [...new Set([...(latest ? [latest] : []), ...KNOWN_JD[project]])].sort(
      (a, b) => compareVersions(b, a)
    );
    const notNewer = candidates.filter((c) => compareVersions(c, v) <= 0);
    let picked: string | undefined;
    for (const c of [...notNewer, ...candidates]) {
      if (await hasJavadoc(platform, c)) {
        picked = c;
        break;
      }
    }
    result = picked
      ? {
          jdVersion: picked,
          fallback: true,
          warning: `${platformLabel(platform)} ${v} Javadoc is not published on jd.papermc.io yet — searching ${picked} (closest available). Members added in ${v} may be missing: confirm by compiling against the ${v} API.`,
        }
      : {
          jdVersion: v,
          fallback: true,
          warning: `No ${platformLabel(platform)} Javadoc reachable for ${v} (offline or not published).`,
        };
  }
  pathMemo.set(key, { at: Date.now(), value: result });
  return result;
}

/** True when the platform's release API lists this exact version (released, even if JD lags). */
export async function isKnownRelease(platform: Platform, version: string): Promise<boolean> {
  const v = normalizeGameVersion(version).version;
  if (!v) return false;
  try {
    if (platform === "velocity") return (await listVelocityVersionsFromFill()).includes(v);
    if (platform === "folia") return (await listFoliaVersionsFromFill()).includes(v);
    if (platform === "purpur") return (await listPurpurVersionsFromApi()).includes(v);
    return (await listPaperVersionsFromFill()).includes(v);
  } catch {
    return false;
  }
}

/** Test hook */
export function clearJavadocPathMemo(): void {
  latestMemo.clear();
  pathMemo.clear();
}
