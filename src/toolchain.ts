import { fetchText } from "./cache.js";
import {
  FALLBACK_GRADLE_VERSION,
  FALLBACK_USERDEV_MIN_GRADLE,
  FALLBACK_USERDEV_VERSION,
  minGradleForUserdevPlugin,
} from "./versioning.js";

const DAY = 24 * 60 * 60 * 1000;

export interface UserdevInfo {
  version: string;
  /** Gradle plugin-api version declared by the plugin (= minimum Gradle) */
  minGradle: string;
  source: "plugin-portal" | "fallback";
}

/**
 * Latest paperweight-userdev from the Gradle plugin portal and the Gradle API it declares.
 * Falls back to constants when offline.
 */
export async function latestUserdev(): Promise<UserdevInfo> {
  try {
    const meta = await fetchText(
      "https://plugins.gradle.org/m2/io/papermc/paperweight/userdev/io.papermc.paperweight.userdev.gradle.plugin/maven-metadata.xml",
      { cacheKey: "portal:userdev:metadata", ttlMs: DAY, timeoutMs: 8_000, retries: 1 }
    );
    const version =
      meta.match(/<release>([^<]+)<\/release>/)?.[1] ??
      meta.match(/<latest>([^<]+)<\/latest>/)?.[1];
    if (!version) throw new Error("no release in userdev metadata");
    let minGradle = minGradleForUserdevPlugin(version);
    try {
      const module = await fetchText(
        `https://plugins.gradle.org/m2/io/papermc/paperweight/paperweight-userdev/${version}/paperweight-userdev-${version}.module`,
        { cacheKey: `portal:userdev:module:${version}`, ttlMs: 30 * DAY, timeoutMs: 8_000, retries: 1 }
      );
      const api = module.match(/"org\.gradle\.plugin\.api-version"\s*:\s*"([^"]+)"/)?.[1];
      if (api) minGradle = api;
    } catch {
      /* keep heuristic */
    }
    return { version, minGradle, source: "plugin-portal" };
  } catch {
    return {
      version: FALLBACK_USERDEV_VERSION,
      minGradle: FALLBACK_USERDEV_MIN_GRADLE,
      source: "fallback",
    };
  }
}

/** Current Gradle release from services.gradle.org (fallback constant offline). */
export async function latestGradleVersion(): Promise<string> {
  try {
    const raw = await fetchText("https://services.gradle.org/versions/current", {
      cacheKey: "gradle:current",
      ttlMs: DAY,
      timeoutMs: 8_000,
      retries: 1,
    });
    const v = (JSON.parse(raw) as { version?: string }).version;
    if (v && /^\d+\.\d+/.test(v)) return v;
  } catch {
    /* offline */
  }
  return FALLBACK_GRADLE_VERSION;
}

interface FillVersionResponse {
  version?: { java?: { version?: { minimum?: number } } };
}

/** Minimum Java from Fill for any PaperMC project (paper, folia, velocity). */
export async function fillMinJava(
  project: "paper" | "folia" | "velocity",
  version: string
): Promise<number | null> {
  if (!version || version === "latest") return null;
  try {
    const raw = await fetchText(
      `https://fill.papermc.io/v3/projects/${project}/versions/${encodeURIComponent(version)}`,
      {
        cacheKey: `fill:${project}:version:${version}`,
        ttlMs: 6 * 60 * 60 * 1000,
        timeoutMs: 8_000,
        retries: 1,
      }
    );
    const m = (JSON.parse(raw) as FillVersionResponse).version?.java?.version?.minimum;
    return typeof m === "number" ? m : null;
  } catch {
    return null;
  }
}
