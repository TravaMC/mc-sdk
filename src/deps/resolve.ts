import { fetchText } from "../cache.js";
import type { Platform } from "../platform.js";
import {
  defaultMinJava,
  gradleJvmAdvice,
  normalizeGameVersion,
  paperApiDependencyNotation,
  paperDevBundleNotation,
  pluginApiVersion,
  purpurApiDependencyNotation,
  defaultUserdevPluginVersion,
  minGradleForUserdev,
  requiresMojangProduction,
  repoUrlFor,
} from "../versioning.js";

export interface ResolvedNmsToolchain {
  userdevPlugin: string;
  paperDevBundle: string;
  exactDevBundle?: string;
  channel?: string;
  minGradle: string;
  minJava: number;
  reobfMode: "MOJANG_PRODUCTION" | "reobfJar";
  gradleKotlin: string;
  settingsGradleKotlin: string;
}

export interface ResolvedDependency {
  platform: Platform;
  inputVersion: string;
  version: string;
  versionWarning?: string;
  groupId: string;
  artifactId: string;
  /** Dynamic range preferred in build scripts */
  versionNotation: string;
  /** Latest concrete version from maven-metadata when found */
  exactVersion?: string;
  channel?: string;
  repository: string;
  minJava: number;
  apiVersion: string;
  gradleKotlin: string;
  notes: string[];
  fallbackFrom?: Platform;
  nms?: ResolvedNmsToolchain;
}

interface MavenMetadata {
  versions: string[];
  latest?: string;
  release?: string;
}

async function fetchMavenMetadata(url: string, cacheKey: string): Promise<MavenMetadata> {
  const xml = await fetchText(url, {
    cacheKey,
    ttlMs: 60 * 60 * 1000,
    maxStaleMs: 24 * 60 * 60 * 1000,
  });
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  const latest = xml.match(/<latest>([^<]+)<\/latest>/)?.[1];
  const release = xml.match(/<release>([^<]+)<\/release>/)?.[1];
  return { versions, latest, release };
}

function pickBestArtifactVersion(
  versions: string[],
  gameVersion: string,
  preferStable: boolean
): { exact?: string; channel?: string } {
  const prefix = `${gameVersion}.build.`;
  const matching = versions.filter((v) => v.startsWith(prefix) || v.startsWith(`${gameVersion}-`));
  if (!matching.length) {
    // legacy 1.21.1-R0.1-SNAPSHOT
    const legacy = versions.filter((v) => v.startsWith(`${gameVersion}-`));
    return { exact: legacy.at(-1), channel: legacy.at(-1)?.includes("SNAPSHOT") ? "snapshot" : undefined };
  }

  const stable = matching.filter((v) => /-stable$/i.test(v));
  const beta = matching.filter((v) => /-beta$/i.test(v));
  const experimental = matching.filter((v) => /-experimental$/i.test(v));
  const alpha = matching.filter((v) => /-alpha$/i.test(v));

  const rank = (v: string) => {
    const n = Number.parseInt(v.replace(/^.*build\./, "").replace(/-.*$/, ""), 10);
    return Number.isFinite(n) ? n : 0;
  };
  const best = (arr: string[]) => [...arr].sort((a, b) => rank(a) - rank(b)).at(-1);

  if (preferStable && stable.length) {
    return { exact: best(stable), channel: "stable" };
  }
  if (stable.length) return { exact: best(stable), channel: "stable" };
  if (beta.length) return { exact: best(beta), channel: "beta" };
  if (experimental.length) return { exact: best(experimental), channel: "experimental" };
  if (alpha.length) return { exact: best(alpha), channel: "alpha" };
  return { exact: best(matching), channel: "unknown" };
}

async function fillMinJava(version: string): Promise<number | null> {
  try {
    const text = await fetchText(
      `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}`,
      { cacheKey: `fill:paper:version:${version}`, ttlMs: 6 * 60 * 60 * 1000 }
    );
    const data = JSON.parse(text) as {
      version?: { java?: { version?: { minimum?: number } } };
    };
    const m = data.version?.java?.version?.minimum;
    return typeof m === "number" ? m : null;
  } catch {
    return null;
  }
}

function gradleSnippet(opts: {
  platform: Platform;
  repository: string;
  dependency: string;
  minJava: number;
  apiVersion: string;
  pluginName?: string;
}): string {
  const extraRepo =
    opts.platform === "purpur"
      ? `    maven("https://repo.purpurmc.org/snapshots")\n`
      : "";
  return `// settings.gradle.kts must include:
// plugins { id("org.gradle.toolchains.foojay-resolver-convention") version "0.9.0" }

plugins {
    java
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(${opts.minJava}))
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
${extraRepo}}

dependencies {
    compileOnly("${opts.dependency}")
}

tasks.processResources {
    val props = mapOf("version" to version)
    inputs.properties(props)
    filteringCharset = "UTF-8"
    filesMatching("plugin.yml") {
        expand(props)
    }
}

// plugin.yml: api-version: '${opts.apiVersion}'
// ${gradleJvmAdvice(opts.minJava)}
`;
}

/**
 * Resolve a ready-to-paste Gradle dependency block for Paper / Purpur / Folia.
 * Purpur timeouts fall back to paper-api with an explicit note.
 */
export async function resolveDependency(options: {
  platform?: Platform;
  version: string;
  preferStable?: boolean;
  allowPaperFallback?: boolean;
  /** Resolve paperweight-userdev + paperDevBundle instead of / in addition to paper-api */
  nms?: boolean;
}): Promise<ResolvedDependency> {
  const platform = options.platform ?? "paper";
  const preferStable = options.preferStable !== false;
  const allowPaperFallback = options.allowPaperFallback !== false;
  const wantNms = options.nms === true;
  const norm = normalizeGameVersion(options.version);
  const version = norm.version;
  const notes: string[] = [];
  if (norm.warning) notes.push(norm.warning);

  const minJavaFill = platform === "velocity" ? null : await fillMinJava(version);
  const minJava = minJavaFill ?? defaultMinJava(version);
  const apiVersion = pluginApiVersion(version);
  notes.push(gradleJvmAdvice(minJava));

  if (wantNms && platform !== "velocity") {
    const nms = await resolveNmsToolchain(version, preferStable, minJava);
    notes.push(...nms.notes);
    return {
      platform: platform === "folia" || platform === "purpur" ? platform : "paper",
      inputVersion: options.version,
      version,
      versionWarning: norm.warning,
      groupId: "io.papermc.paper",
      artifactId: "dev-bundle",
      versionNotation: `paperweight.paperDevBundle("${nms.toolchain.paperDevBundle}")`,
      exactVersion: nms.toolchain.exactDevBundle,
      channel: nms.toolchain.channel,
      repository: repoUrlFor("paper"),
      minJava: nms.toolchain.minJava,
      apiVersion,
      gradleKotlin: nms.toolchain.gradleKotlin,
      notes,
      nms: nms.toolchain,
    };
  }

  if (platform === "velocity") {
    const dep = `com.velocitypowered:velocity-api:${version}`;
    return {
      platform,
      inputVersion: options.version,
      version,
      versionWarning: norm.warning,
      groupId: "com.velocitypowered",
      artifactId: "velocity-api",
      versionNotation: dep,
      exactVersion: version,
      repository: "https://repo.papermc.io/repository/maven-public/",
      minJava: 21,
      apiVersion: "n/a",
      gradleKotlin: `repositories {\n    mavenCentral()\n    maven("https://repo.papermc.io/repository/maven-public/")\n}\ndependencies {\n    compileOnly("${dep}")\n    annotationProcessor("${dep}")\n}\n`,
      notes,
    };
  }

  const tryPurpur = async (): Promise<ResolvedDependency | null> => {
    try {
      const meta = await fetchMavenMetadata(
        "https://repo.purpurmc.org/snapshots/org/purpurmc/purpur/purpur-api/maven-metadata.xml",
        "maven:purpur-api:metadata"
      );
      const pick = pickBestArtifactVersion(meta.versions, version, preferStable);
      const exact = pick.exact;
      const dependency = exact
        ? `org.purpurmc.purpur:purpur-api:${exact}`
        : purpurApiDependencyNotation(version);
      return {
        platform: "purpur",
        inputVersion: options.version,
        version,
        versionWarning: norm.warning,
        groupId: "org.purpurmc.purpur",
        artifactId: "purpur-api",
        versionNotation: purpurApiDependencyNotation(version),
        exactVersion: exact,
        channel: pick.channel,
        repository: repoUrlFor("purpur"),
        minJava,
        apiVersion,
        gradleKotlin: gradleSnippet({
          platform: "purpur",
          repository: repoUrlFor("purpur"),
          dependency,
          minJava,
          apiVersion,
        }),
        notes: [
          ...notes,
          exact
            ? `Pinned exact Maven version ${exact} (${pick.channel ?? "unknown"}). Dynamic alternative: ${purpurApiDependencyNotation(version)}`
            : `Using dynamic notation ${purpurApiDependencyNotation(version)}`,
          "Purpur-api includes Paper API. Prefer paper-api if you must stay Paper-portable.",
        ],
      };
    } catch (e) {
      notes.push(
        `Purpur Maven metadata failed: ${e instanceof Error ? e.message : String(e)}`
      );
      return null;
    }
  };

  const tryPaper = async (fallbackFrom?: Platform): Promise<ResolvedDependency> => {
    const meta = await fetchMavenMetadata(
      "https://repo.papermc.io/repository/maven-public/io/papermc/paper/paper-api/maven-metadata.xml",
      "maven:paper-api:metadata"
    );
    const pick = pickBestArtifactVersion(meta.versions, version, preferStable);
    const exact = pick.exact;
    const dependency = exact
      ? `io.papermc.paper:paper-api:${exact}`
      : paperApiDependencyNotation(version);
    const result: ResolvedDependency = {
      platform: "paper",
      inputVersion: options.version,
      version,
      versionWarning: norm.warning,
      groupId: "io.papermc.paper",
      artifactId: "paper-api",
      versionNotation: paperApiDependencyNotation(version),
      exactVersion: exact,
      channel: pick.channel,
      repository: repoUrlFor("paper"),
      minJava,
      apiVersion,
      gradleKotlin: gradleSnippet({
        platform: "paper",
        repository: repoUrlFor("paper"),
        dependency,
        minJava,
        apiVersion,
      }),
      notes: [
        ...notes,
        exact
          ? `Exact Maven version ${exact} (${pick.channel ?? "unknown"}). Dynamic: ${paperApiDependencyNotation(version)}`
          : `Using dynamic notation ${paperApiDependencyNotation(version)}`,
      ],
      fallbackFrom,
    };
    if (fallbackFrom === "purpur") {
      result.notes.push(
        "Fell back to paper-api because Purpur repo was unavailable. paper-api plugins still run on Purpur; Purpur-only APIs (AFK/ridables/…) need purpur-api when the repo is reachable."
      );
    }
    return result;
  };

  if (platform === "purpur") {
    const purpur = await tryPurpur();
    if (purpur) return purpur;
    if (allowPaperFallback) return tryPaper("purpur");
    throw new Error(
      "Could not resolve purpur-api (repo timeout/error). Retry later or call with allowPaperFallback=true."
    );
  }

  // paper + folia (API coords are paper-api / folia-api — use paper-api for compile for now)
  if (platform === "folia") {
    notes.push(
      "Folia plugins usually compile against paper-api or folia-api; using paper-api coordinates. Mark folia-supported in plugin.yml and follow mc_folia_guide."
    );
  }
  return tryPaper();
}

async function resolveNmsToolchain(
  version: string,
  preferStable: boolean,
  minJava: number
): Promise<{ toolchain: ResolvedNmsToolchain; notes: string[] }> {
  const notes: string[] = [];
  const userdevPlugin = defaultUserdevPluginVersion(version);
  const minGradle = minGradleForUserdev(version);
  const mojangProd = requiresMojangProduction(version);
  const dynamic = paperDevBundleNotation(version);

  let exact: string | undefined;
  let channel: string | undefined;
  try {
    const meta = await fetchMavenMetadata(
      "https://repo.papermc.io/repository/maven-public/io/papermc/paper/dev-bundle/maven-metadata.xml",
      "maven:paper-dev-bundle:metadata"
    );
    const pick = pickBestArtifactVersion(meta.versions, version, preferStable);
    exact = pick.exact;
    channel = pick.channel;
  } catch (e) {
    notes.push(
      `dev-bundle maven-metadata failed: ${e instanceof Error ? e.message : String(e)} — using dynamic ${dynamic}`
    );
  }

  const bundle = exact ?? dynamic;
  notes.push(
    `paperweight-userdev ${userdevPlugin} requires Gradle ${minGradle}+ (8.14 + userdev 2.x → plugin-api variant mismatch).`
  );
  if (mojangProd) {
    notes.push(
      "26.1+: set MOJANG_PRODUCTION; do NOT dependsOn(reobfJar) — reobf is unsupported."
    );
  } else {
    notes.push("Pre-26.1: optional assemble.dependsOn(reobfJar) for Spigot-mapped output.");
  }
  notes.push("Remove compileOnly paper-api when using paperDevBundle (bundle includes API).");
  notes.push("Official: https://docs.papermc.io/paper/dev/userdev/");

  const settingsGradleKotlin = `pluginManagement {
    repositories {
        gradlePluginPortal()
        maven("https://repo.papermc.io/repository/maven-public/")
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.9.0"
}
`;

  const reobfBlock = mojangProd
    ? `paperweight.reobfArtifactConfiguration = io.papermc.paperweight.userdev.ReobfArtifactConfiguration.MOJANG_PRODUCTION
// Do NOT dependsOn(reobfJar) on 26.1+
`
    : `tasks.assemble {
    dependsOn(tasks.reobfJar)
}
`;

  const gradleKotlin = `// Requires Gradle ${minGradle}+ (wrapper recommended)
plugins {
    java
    id("io.papermc.paperweight.userdev") version "${userdevPlugin}"
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(${minJava}))
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    // Exact pin example: paperweight.paperDevBundle("${exact ?? bundle}")
    paperweight.paperDevBundle("${bundle}")
}

${reobfBlock}
tasks.processResources {
    val props = mapOf("version" to version)
    inputs.properties(props)
    filteringCharset = "UTF-8"
    filesMatching("plugin.yml") {
        expand(props)
    }
}
`;

  return {
    notes,
    toolchain: {
      userdevPlugin,
      paperDevBundle: dynamic,
      exactDevBundle: exact,
      channel,
      minGradle,
      minJava,
      reobfMode: mojangProd ? "MOJANG_PRODUCTION" : "reobfJar",
      gradleKotlin,
      settingsGradleKotlin,
    },
  };
}

