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
 * Modern Paper 26.x still targets Bukkit API line 1.21 for now.
 */
export function pluginApiVersion(version: string): string {
  const v = normalizeGameVersion(version).version;
  if (isModernPaperLine(v)) return "1.21";
  const parts = v.split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return v;
}

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
      "Run Gradle itself on JDK 21 if Gradle 8.14+ misbehaves on JDK 25 — toolchain still downloads 25 for compilation.",
      "Do not set JAVA_HOME to 25 for the Gradle daemon unless your Gradle version officially supports it.",
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

/** paperweight-userdev 2.x declares Gradle plugin-api 9.0.0 — needs Gradle 9+. */
export function defaultUserdevPluginVersion(version: string): string {
  const v = normalizeGameVersion(version).version;
  if (isModernPaperLine(v) || requiresMojangProduction(v)) {
    return "2.0.0-beta.21";
  }
  return "1.7.7";
}

export function minGradleForUserdev(version: string): string {
  const plugin = defaultUserdevPluginVersion(version);
  if (plugin.startsWith("2.")) return "9.0";
  return "8.8";
}

export function repoUrlFor(platform: Platform): string {
  if (platform === "purpur") return "https://repo.purpurmc.org/snapshots";
  return "https://repo.papermc.io/repository/maven-public/";
}

