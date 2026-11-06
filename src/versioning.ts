import type { Platform } from "./platform.js";

export interface NormalizedVersion {
  /** Canonical id for JD / Fill / pins (e.g. 26.2, 1.21.1) */
  version: string;
  /** What the user typed */
  input: string;
  /** True when we rewrote e.g. 1.26.2 → 26.2 */
  aliased: boolean;
  warning?: string;
}

/**
 * Fix common mistake: Minecraft-style `1.26.2` when Paper means calendar `26.2`.
 * Also strips -R0.1-SNAPSHOT / .build.+ noise for pin/JD lookups.
 */
export function normalizeGameVersion(raw: string): NormalizedVersion {
  const input = raw.trim();
  let v = input
    .replace(/-R0\.1-SNAPSHOT$/i, "")
    .replace(/\.build\.\+.*$/i, "")
    .replace(/\.build\.\d+.*$/i, "")
    .replace(/-SNAPSHOT$/i, "")
    .trim();

  // 1.26.x / 1.27.x … → 26.x / 27.x (Paper calendar line)
  const mistaken = /^1\.(\d{2})(?:\.(.+))?$/.exec(v);
  if (mistaken) {
    const major = Number.parseInt(mistaken[1], 10);
    if (major >= 26) {
      const rest = mistaken[2] ? `.${mistaken[2]}` : "";
      const version = `${major}${rest}`;
      return {
        input,
        version,
        aliased: true,
        warning: `Interpreted "${input}" as Paper/Purpur calendar version "${version}" (not Minecraft 1.${major}). Use ${version} in pins, JD URLs, and Maven coords.`,
      };
    }
  }

  return { input, version: v, aliased: false };
}

/** Whether this is Paper's modern calendar scheme (26.x+), not 1.21.x. */
export function isModernPaperLine(version: string): boolean {
  const core = normalizeGameVersion(version).version;
  return /^\d{2}(\.|$)/.test(core);
}

/**
 * plugin.yml api-version.
 * Classic: 1.21.4 → 1.21
 * Modern calendar line: 26.3 → 26.3, 26.1.2 → 26.1 (docs.papermc.io: valid range 1.13 – 26.x;
 * a server older than api-version refuses to load the plugin, so major.minor is the safe value).
 */
export function pluginApiVersion(version: string): string {
  const v = normalizeGameVersion(version).version;
  const parts = v.split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return v;
}

/**
 * Min Java for velocity-api (fallback when Fill is unreachable).
 * velocity-api 4.x Gradle metadata: org.gradle.jvm.version 25; 3.5.x → 21; 3.3/3.4 → 17.
 */
export function velocityMinJava(version: string): number {
  const v = version.trim();
  if (!v || v === "latest" || v === "root") return 25;
  const [maj, min] = v.split(".").map((p) => Number.parseInt(p, 10) || 0);
  if (maj >= 4) return 25;
  if (maj === 3 && min >= 5) return 21;
  if (maj === 3 && min >= 3) return 17;
  return 11;
}

/** Offline fallbacks — live values come from src/toolchain.ts (plugin portal / services.gradle.org). */
export const FALLBACK_USERDEV_VERSION = "2.0.0-beta.24";
/** paperweight-userdev 2.0.0-beta.24 declares org.gradle.plugin.api-version 9.7.1. */
export const FALLBACK_USERDEV_MIN_GRADLE = "9.7.1";
export const FALLBACK_GRADLE_VERSION = "9.9.0";
export const FOOJAY_RESOLVER_VERSION = "1.0.0";

/**
 * Minimum language level for compiling against that server line.
 * Prefer Fill when available; these are fallbacks.
 */
export function defaultMinJava(version: string): number {
  const v = normalizeGameVersion(version).version;
  if (isModernPaperLine(v)) {
    const major = Number.parseInt(v.split(".")[0], 10);
    if (major >= 26) return 25;
    return 21;
  }
  // 1.20.5+ / 1.21.x
  if (v.startsWith("1.20.5") || v.startsWith("1.20.6") || v.startsWith("1.21")) {
    return 21;
  }
  if (v.startsWith("1.18") || v.startsWith("1.19") || v.startsWith("1.20")) return 17;
  return 21;
}

/** Gradle daemon JVM tip when compile toolchain > what Gradle itself likes. */
export function gradleJvmAdvice(minJava: number): string {
  if (minJava >= 25) {
    return [
      "Compile with JavaLanguageVersion.of(25) via toolchain (foojay resolver).",
      "Gradle 9.1.0+ officially runs on JDK 25, so the daemon may use JDK 21 or 25.",
      "Gradle 8.x cannot run on JDK 25 — upgrade the wrapper (paperweight-userdev 2.0.0-beta.24 needs Gradle 9.7.1+).",
    ].join(" ");
  }
  if (minJava >= 21) {
    return "Use JDK 21+ for both Gradle and the Java toolchain (or toolchain-only 21).";
  }
  return "Match the server's documented minimum JDK.";
}

export function mavenCoordScheme(version: string): "build_plus" | "r0_snapshot" {
  return isModernPaperLine(version) ? "build_plus" : "r0_snapshot";
}

export function paperApiDependencyNotation(
  version: string,
  exactBuild?: string
): string {
  const v = normalizeGameVersion(version).version;
  if (exactBuild) return `io.papermc.paper:paper-api:${exactBuild}`;
  if (mavenCoordScheme(v) === "build_plus") {
    return `io.papermc.paper:paper-api:${v}.build.+`;
  }
  return `io.papermc.paper:paper-api:${v}-R0.1-SNAPSHOT`;
}

export function purpurApiDependencyNotation(
  version: string,
  exactBuild?: string
): string {
  const v = normalizeGameVersion(version).version;
  if (exactBuild) return `org.purpurmc.purpur:purpur-api:${exactBuild}`;
  if (mavenCoordScheme(v) === "build_plus") {
    return `org.purpurmc.purpur:purpur-api:${v}.build.+`;
  }
  return `org.purpurmc.purpur:purpur-api:${v}-R0.1-SNAPSHOT`;
}

export function paperDevBundleNotation(
  version: string,
  exactBuild?: string
): string {
  const v = normalizeGameVersion(version).version;
  if (exactBuild) return exactBuild;
  if (mavenCoordScheme(v) === "build_plus") {
    return `${v}.build.+`;
  }
  return `${v}-R0.1-SNAPSHOT`;
}

/** Paper 26.1+ ships Mojang-mapped / unobfuscated — no reobfJar. */
export function requiresMojangProduction(version: string): boolean {
  const v = normalizeGameVersion(version).version;
  if (!isModernPaperLine(v)) return false;
  const major = Number.parseInt(v.split(".")[0], 10);
  const minor = Number.parseInt(v.split(".")[1] ?? "0", 10);
  if (major > 26) return true;
  if (major === 26 && minor >= 1) return true;
  return false;
}

/**
 * Offline default userdev for a server line. Live latest: toolchain.latestUserdev().
 * 2.0.0-beta.1…23 declare Gradle plugin-api 9.0.0; beta.24 declares 9.7.1.
 */
export function defaultUserdevPluginVersion(version: string): string {
  const v = normalizeGameVersion(version).version;
  if (isModernPaperLine(v) || requiresMojangProduction(v)) {
    return FALLBACK_USERDEV_VERSION;
  }
  return "1.7.7";
}

/** Minimum Gradle for a given paperweight-userdev plugin version. */
export function minGradleForUserdevPlugin(plugin: string): string {
  if (!plugin.startsWith("2.")) return "8.8";
  const beta = /^2\.0\.0-beta\.(\d+)$/.exec(plugin);
  if (beta && Number.parseInt(beta[1], 10) < 24) return "9.0";
  return FALLBACK_USERDEV_MIN_GRADLE;
}

export function minGradleForUserdev(version: string): string {
  return minGradleForUserdevPlugin(defaultUserdevPluginVersion(version));
}

/** Compare dotted Gradle versions (9.7.1 vs 9.10). */
export function compareGradleVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function repoUrlFor(platform: Platform): string {
  if (platform === "purpur") return "https://repo.purpurmc.org/snapshots";
  return "https://repo.papermc.io/repository/maven-public/";
}

