import { fetchText, getCachedText, setCachedText } from "../cache.js";
import { guessMinecraftVersion } from "../config.js";
import { isModernPaperLine, normalizeGameVersion } from "../versioning.js";
import * as cheerio from "cheerio";
import { buildIndexFromServerJar, sha1 } from "./serverJar.js";
import { FALLBACK_USERDEV_MIN_GRADLE, FALLBACK_USERDEV_VERSION } from "../versioning.js";

export interface MappingClass {
  mojangName: string;
  obfuscated: string;
  /** "extends X implements Y" (server-jar index only) */
  hierarchy?: string;
  members: Array<{
    kind: "field" | "method";
    mojang: string;
    obfuscated: string;
    /** Full declaration, e.g. "public void tick()" (types from the jar / mapping file) */
    signature?: string;
  }>;
}

export interface MappingHit {
  mojangName: string;
  obfuscated: string;
  score: number;
  /** mappings.dev page (only exists for obfuscated <=1.21.11 versions) */
  mappingsDevUrl?: string;
}

export interface MappingsResolve {
  /** Version string passed in (normalized Paper/MC id) */
  requested: string;
  /** Mojang version id used to download mappings */
  mcVersion: string;
  /** True when we could not use requested and fell back */
  fallback: boolean;
  warning?: string;
  /** Mojang calendar line has no obfuscation / no server_mappings */
  unobfuscatedRuntime?: boolean;
  /** Where names come from: Mojang mapping file, the unobfuscated server.jar, or a fallback mapping file */
  source: "mojang-mappings" | "server-jar" | "fallback-mappings";
}

interface VersionManifest {
  versions: Array<{ id: string; url: string }>;
}

interface VersionJson {
  downloads: {
    server?: { url: string; sha1?: string; size?: number };
    server_mappings?: { url: string };
    client_mappings?: { url: string };
  };
}

const MAPPINGS_FALLBACK_CHAIN = [
  "1.21.11",
  "1.21.10",
  "1.21.8",
  "1.21.4",
  "1.21.1",
  "1.20.4",
];

/** Resolve Minecraft version id for Mojang version_manifest (Paper pin may match). */
export async function resolveMinecraftId(paperOrMc: string): Promise<string> {
  const guess = guessMinecraftVersion(normalizeGameVersion(paperOrMc).version);
  const manifest = JSON.parse(
    await fetchText("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", {
      cacheKey: "mojang:version_manifest",
      ttlMs: 6 * 60 * 60 * 1000,
    })
  ) as VersionManifest;

  if (manifest.versions.some((v) => v.id === guess)) return guess;

  const parts = guess.split(".");
  if (parts.length >= 2) {
    const family = `${parts[0]}.${parts[1]}`;
    const candidates = manifest.versions
      .filter((v) => v.id === family || v.id.startsWith(family + "."))
      .map((v) => v.id);
    if (candidates.includes(guess)) return guess;
    // Prefer exact release over snapshots/pre (e.g. 26.2 over 26.2-pre-1)
    const release = candidates.find((id) => !/[-]/.test(id));
    if (release) return release;
    if (candidates.length) return candidates[0];
  }

  for (const id of [guess, ...MAPPINGS_FALLBACK_CHAIN, "26.1"]) {
    if (manifest.versions.some((v) => v.id === id)) return id;
  }
  throw new Error(`No Mojang version match for "${paperOrMc}"`);
}

async function loadVersionJson(
  mcVersion: string,
  manifest: VersionManifest
): Promise<VersionJson | null> {
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) return null;
  try {
    return JSON.parse(
      await fetchText(entry.url, {
        cacheKey: `mojang:version_json:${mcVersion}`,
        ttlMs: 7 * 24 * 60 * 60 * 1000,
      })
    ) as VersionJson;
  } catch {
    return null;
  }
}

async function versionHasServerMappings(
  mcVersion: string,
  manifest: VersionManifest
): Promise<boolean> {
  const json = await loadVersionJson(mcVersion, manifest);
  return Boolean(json?.downloads.server_mappings?.url);
}

/**
 * Pick Mojang version whose server_mappings exist.
 * Calendar 26.1+ has no server_mappings (unobfuscated server) — fall back to 1.21.11 with a loud warning.
 */
export async function resolveMappingsTarget(
  paperOrMc: string
): Promise<MappingsResolve> {
  const requested = await resolveMinecraftId(paperOrMc);
  const manifest = JSON.parse(
    await fetchText("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", {
      cacheKey: "mojang:version_manifest",
      ttlMs: 6 * 60 * 60 * 1000,
    })
  ) as VersionManifest;

  if (await versionHasServerMappings(requested, manifest)) {
    return {
      requested,
      mcVersion: requested,
      fallback: false,
      unobfuscatedRuntime: isModernPaperLine(requested) && requiresUnobfuscated(requested),
      source: "mojang-mappings",
    };
  }

  // 26.1+: no mapping file because the server jar already carries real names — index the jar.
  if (requiresUnobfuscated(requested)) {
    const json = await loadVersionJson(requested, manifest);
    if (json?.downloads.server?.url) {
      return {
        requested,
        mcVersion: requested,
        fallback: false,
        unobfuscatedRuntime: true,
        source: "server-jar",
      };
    }
  }

  return mappingsFallbackTarget(requested, manifest);
}

async function mappingsFallbackTarget(
  requested: string,
  manifest: VersionManifest,
  reason?: string
): Promise<MappingsResolve> {
  for (const id of MAPPINGS_FALLBACK_CHAIN) {
    if (!(await versionHasServerMappings(id, manifest))) continue;
    const unobfuscated = requiresUnobfuscated(requested) || isModernPaperLine(requested);
    return {
      requested,
      mcVersion: id,
      fallback: true,
      unobfuscatedRuntime: unobfuscated,
      source: "fallback-mappings",
      warning: unobfuscated
        ? `${reason ? reason + " " : ""}Could not index the ${requested} server.jar, so names below come from ${id} mappings — HINTS ONLY. Open the class from paperDevBundle in the IDE (Go to Declaration) or compileJava; do not trust these members blindly.`
        : `No server_mappings for ${requested}; using ${id} as nearest mapping file (hints only). Verify against paperDevBundle.`,
    };
  }

  throw new Error(
    `No server_mappings for ${requested} and no fallback mapping file found (tried ${MAPPINGS_FALLBACK_CHAIN.join(", ")})`
  );
}

function requiresUnobfuscated(version: string): boolean {
  const v = normalizeGameVersion(version).version;
  if (!/^\d{2}/.test(v) && !v.startsWith("26")) return false;
  const major = Number.parseInt(v.split(".")[0], 10);
  const minor = Number.parseInt(v.split(".")[1] ?? "0", 10);
  if (Number.isNaN(major)) return false;
  if (major > 26) return true;
  if (major === 26 && minor >= 1) return true;
  return false;
}

export async function loadServerMappings(mcVersion: string): Promise<string> {
  const cacheKey = `mojang:server_mappings:${mcVersion}`;
  const cached = await getCachedText(cacheKey);
  if (cached) return cached;

  const manifest = JSON.parse(
    await fetchText("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", {
      cacheKey: "mojang:version_manifest",
      ttlMs: 6 * 60 * 60 * 1000,
    })
  ) as VersionManifest;

  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new Error(`Unknown Minecraft version ${mcVersion}`);

  const versionJson = JSON.parse(
    await fetchText(entry.url, {
      cacheKey: `mojang:version_json:${mcVersion}`,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    })
  ) as VersionJson;

  const mapUrl = versionJson.downloads.server_mappings?.url;
  if (!mapUrl) throw new Error(`No server_mappings for ${mcVersion}`);

  const text = await fetch(mapUrl, {
    headers: { "User-Agent": "mc-sdk/3.2" },
    signal: AbortSignal.timeout(60_000),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} downloading mappings`);
    return r.text();
  });

  await setCachedText(cacheKey, text);
  return text;
}

const SERVER_INDEX_TTL_MS = 365 * 24 * 60 * 60 * 1000;

async function loadManifest(): Promise<VersionManifest> {
  return JSON.parse(
    await fetchText("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", {
      cacheKey: "mojang:version_manifest",
      ttlMs: 6 * 60 * 60 * 1000,
    })
  ) as VersionManifest;
}

/**
 * Index of an unobfuscated (26.1+) server: downloads Mojang's server.jar once (~60 MB),
 * verifies sha1, reads class/field/method names, caches the text under ~/.cache/mc-sdk.
 */
export async function loadServerJarIndex(mcVersion: string): Promise<string> {
  const cacheKey = `mojang:server_jar_index:v1:${mcVersion}`;
  const cached = await getCachedText(cacheKey, SERVER_INDEX_TTL_MS);
  if (cached) return cached;

  const json = await loadVersionJson(mcVersion, await loadManifest());
  const server = json?.downloads.server;
  if (!server?.url) throw new Error(`No server.jar download for ${mcVersion}`);

  const jar = await fetch(server.url, {
    headers: { "User-Agent": "mc-sdk/3.2" },
    signal: AbortSignal.timeout(180_000),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} downloading server.jar`);
    return Buffer.from(await r.arrayBuffer());
  });
  if (server.sha1 && sha1(jar) !== server.sha1) {
    throw new Error(`server.jar sha1 mismatch for ${mcVersion}`);
  }
  const text = buildIndexFromServerJar(jar, mcVersion);
  await setCachedText(cacheKey, text);
  return text;
}

/** Load names for a resolved target; if the server.jar index fails, fall back to the mapping chain. */
async function loadTargetText(
  target: MappingsResolve
): Promise<{ text: string; target: MappingsResolve }> {
  if (target.source !== "server-jar") {
    return { text: await loadServerMappings(target.mcVersion), target };
  }
  try {
    return { text: await loadServerJarIndex(target.mcVersion), target };
  } catch (e) {
    const fb = await mappingsFallbackTarget(
      target.requested,
      await loadManifest(),
      `(${e instanceof Error ? e.message : String(e)})`
    );
    return { text: await loadServerMappings(fb.mcVersion), target: fb };
  }
}

function parseClassBlocks(mappings: string): Map<string, MappingClass> {
  const map = new Map<string, MappingClass>();
  const lines = mappings.split(/\r?\n/);
  let current: MappingClass | null = null;

  for (const line of lines) {
    if (current && (line.startsWith("# extends ") || line.startsWith("# implements "))) {
      current.hierarchy = line.slice(2).trim();
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    if (!line.startsWith("    ") && line.includes(" -> ")) {
      const [left, right] = line.split(" -> ");
      const mojangName = left.trim();
      const obfuscated = right.trim().replace(/:$/, "");
      current = { mojangName, obfuscated, members: [] };
      map.set(mojangName, current);
      const simple = mojangName.split(".").pop()!;
      if (!map.has(simple)) map.set(simple, current);
      continue;
    }
    if (current && line.startsWith("    ") && line.includes(" -> ")) {
      const trimmed = line.trim();
      const [left, right] = trimmed.split(" -> ");
      const obfuscated = right.trim();
      const isMethod = left.includes("(") || /^\d+:\d+:/.test(left);
      let mojang = left.replace(/^\d+:\d+:/, "").trim();
      if (isMethod) {
        const name = mojang.includes(" ")
          ? mojang.slice(mojang.lastIndexOf(" ") + 1)
          : mojang;
        current.members.push({ kind: "method", mojang: name, obfuscated, signature: mojang });
      } else {
        const name = mojang.includes(" ")
          ? mojang.slice(mojang.lastIndexOf(" ") + 1)
          : mojang;
        current.members.push({ kind: "field", mojang: name, obfuscated, signature: mojang });
      }
    }
  }
  return map;
}

export async function searchNms(
  paperOrMcVersion: string,
  query: string,
  limit = 25
): Promise<{
  requestedVersion: string;
  mcVersion: string;
  hits: MappingHit[];
  mappingsFallback?: boolean;
  warning?: string;
  unobfuscatedRuntime?: boolean;
  source: MappingsResolve["source"];
  nextSteps: string[];
}> {
  const { text, target } = await loadTargetText(await resolveMappingsTarget(paperOrMcVersion));
  const q = query.trim().toLowerCase();
  const hits: MappingHit[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || line.startsWith(" ") || line.startsWith("\t")) {
      continue;
    }
    if (!line.includes(" -> ")) continue;
    const mojangName = line.split(" -> ")[0].trim();
    const obfuscated = line.split(" -> ")[1].trim().replace(/:$/, "");
    const simple = mojangName.split(".").pop()!.toLowerCase();
    const full = mojangName.toLowerCase();
    let score = 0;
    if (full === q || simple === q) score = 1000;
    else if (simple.startsWith(q) || full.endsWith("." + q)) score = 800;
    else if (simple.includes(q) || full.includes(q)) score = 400;
    if (score <= 0) continue;
    if (seen.has(mojangName)) continue;
    seen.add(mojangName);
    hits.push({
      mojangName,
      obfuscated,
      score,
      mappingsDevUrl:
        target.source === "server-jar" ? undefined : mappingsDevClassUrl(target.mcVersion, mojangName),
    });
  }

  hits.sort((a, b) => b.score - a.score || a.mojangName.localeCompare(b.mojangName));
  return {
    requestedVersion: target.requested,
    mcVersion: target.mcVersion,
    hits: hits.slice(0, limit),
    mappingsFallback: target.fallback || undefined,
    warning: target.warning,
    unobfuscatedRuntime: target.unobfuscatedRuntime,
    source: target.source,
    nextSteps: target.fallback
      ? [
          "Treat hits as class-name hints only",
          "mc_resolve_dependency nms=true → Gradle sync",
          "Open the type from paperDevBundle in the IDE (Go to Declaration) and copy real members",
          "Confirm with compileJava before shipping",
        ]
      : target.source === "server-jar"
        ? [
            "Names come from the official unobfuscated server.jar for this exact version (vanilla classes)",
            "Paper patches/CraftBukkit add members not listed here — paperDevBundle in the IDE is the full picture",
            "Prefer Paper API first (mc_api_vs_nms); confirm with compileJava",
          ]
        : [
            "Prefer Paper API first (mc_api_vs_nms)",
            "Still verify critical members against paperDevBundle for your pin",
          ],
  };
}

export async function getNmsClass(
  paperOrMcVersion: string,
  className: string
): Promise<{
  requestedVersion: string;
  mcVersion: string;
  cls: MappingClass;
  mappingsDevUrl?: string;
  mappingsDevExcerpt?: string;
  mappingsFallback?: boolean;
  warning?: string;
  unobfuscatedRuntime?: boolean;
  source: MappingsResolve["source"];
  nextSteps: string[];
}> {
  const { text, target } = await loadTargetText(await resolveMappingsTarget(paperOrMcVersion));
  const blocks = parseClassBlocks(text);

  const cls =
    blocks.get(className) ||
    [...blocks.values()].find(
      (c) =>
        c.mojangName === className ||
        c.mojangName.endsWith("." + className) ||
        c.mojangName.split(".").pop() === className
    );

  if (!cls) {
    throw new Error(
      `NMS class "${className}" not found in Mojang server mappings for ${target.mcVersion}` +
        (target.fallback ? ` (fallback from ${target.requested})` : "")
    );
  }

  const url =
    target.source === "server-jar" ? undefined : mappingsDevClassUrl(target.mcVersion, cls.mojangName);
  let mappingsDevExcerpt: string | undefined;
  if (url) try {
    const html = await fetchText(url, {
      cacheKey: `mappings.dev:${target.mcVersion}:${cls.mojangName}`,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    });
    const $ = cheerio.load(html);
    $("script, style, nav").remove();
    mappingsDevExcerpt = $("main").text().replace(/\s+/g, " ").trim().slice(0, 8000);
  } catch {
    /* optional */
  }

  return {
    requestedVersion: target.requested,
    mcVersion: target.mcVersion,
    cls,
    mappingsDevUrl: url,
    mappingsDevExcerpt,
    mappingsFallback: target.fallback || undefined,
    warning: target.warning,
    unobfuscatedRuntime: target.unobfuscatedRuntime,
    source: target.source,
    nextSteps: target.fallback
      ? [
          "Members below may be from a fallback mapping file — not your 26.x bundle",
          "Open this class from paperDevBundle in the IDE and verify each field/method you use",
          "compileJava is the authority",
        ]
      : target.source === "server-jar"
        ? [
            "Members are read from the official unobfuscated server.jar (vanilla) for this exact version",
            "Paper-added members are not listed — check paperDevBundle in the IDE if something is missing",
            "Prefer Paper API when possible (mc_api_vs_nms); compileJava is the authority",
          ]
        : ["Prefer Paper API when possible (mc_api_vs_nms)"],
  };
}

export function mappingsDevClassUrl(mcVersion: string, mojangName: string): string {
  return `https://mappings.dev/${mcVersion}/${mojangName.replaceAll(".", "/")}.html`;
}

export function nmsGuidanceMarkdown(mcVersion?: string): string {
  const pin = mcVersion ?? "26.3";
  const modern = isModernPaperLine(pin);
  return `# NMS / paperweight guidance

Paper plugins should **prefer the Paper API**. Use NMS only when the API cannot do what you need.
Read the full decision guide via \`mc_api_vs_nms\` (docs/api-vs-nms.md).

## How Paper expects NMS

1. Use **paperweight-userdev** (Gradle) — code is written against **Mojang mappings** (readable names like \`ServerPlayer\`).
2. At runtime Paper remaps to the server as required (pre-26.1). From **26.1+** the server JAR is unobfuscated — use \`MOJANG_PRODUCTION\`, **no** \`reobfJar\`.
3. Do **not** copy Spigot \`net.minecraft.server.v1_XX_RX\` package names into new projects.
4. Access CraftBukkit bridges carefully (\`CraftPlayer\`, etc.) — they are not public API; isolate them.

## Typical Gradle snippet (${pin})

Prefer \`mc_resolve_dependency\` with \`nms: true\`. Official userdev: https://docs.papermc.io/paper/dev/userdev/

\`\`\`kotlin
plugins {
  id("io.papermc.paperweight.userdev") version "${FALLBACK_USERDEV_VERSION}" // needs Gradle ${FALLBACK_USERDEV_MIN_GRADLE}+
}
dependencies {
  paperweight.paperDevBundle("${modern ? pin + ".build.+" : pin + "-R0.1-SNAPSHOT"}")
}
${
  modern
    ? `paperweight.reobfArtifactConfiguration = io.papermc.paperweight.userdev.ReobfArtifactConfiguration.MOJANG_PRODUCTION
// Do NOT dependsOn(reobfJar) on 26.1+
`
    : `tasks.assemble { dependsOn(reobfJar) }
`
}
\`\`\`

## Mappings lookup caveat (26.x)

Mojang no longer publishes \`server_mappings\` for calendar 26.1+ — the server jar already carries real names. \`mc_nms_search\` / \`mc_nms_class\` therefore **index the official server.jar for your exact version** (\`source: "server-jar"\`, downloaded once, ~60 MB, cached). Only if that fails do they fall back to **1.21.11** mappings with \`mappingsFallback: true\`.

The server.jar index is **vanilla**: Paper patches and CraftBukkit add members it does not list. For those, open \`net.minecraft.*\` from the **paperDevBundle** in the IDE (Go to Declaration). No public NMS Javadoc exists. \`compileJava\` confirms.

## Tools in this SDK

- \`mc_api_vs_nms\` — when API vs NMS (start here)
- \`mc_nms_search\` / \`mc_nms_class\` — Mojang-named lookups (26.1+: indexed from the official server.jar)
- \`mc_resolve_dependency\` \`nms: true\` — userdev + paperDevBundle + min Gradle
- \`mc_build_guidance\` — builds, artifacts, Windows non-ASCII paths
- \`mc_remapper_guidance\` — remapping / multi-version notes

## Isolation

Keep \`net.minecraft\` imports out of general listeners/commands. Put NMS behind a small interface implemented per supported game version.

## Legal note

Mojang mappings are fetched for local development use (cached under \`~/.cache/mc-sdk\`). Do not redistribute mapping files.

## Build tip (Windows)

If paperweight fails with \`GradleWorkerMain\` / worker exit 1 and your path has non-ASCII characters, see \`mc_build_guidance\` (build via an ASCII path such as \`C:\\\\tmp\\\\...\`).
`;
}

export function remapperGuidanceMarkdown(): string {
  return `# Paper remapper / userdev

- **Compile classpath**: Mojang-mapped Paper server (via paperweight \`paperDevBundle\`).
- **26.1+**: no Spigot reobfuscation — set \`MOJANG_PRODUCTION\`, ship the Mojang-mapped jar; \`reobfJar\` will not work.
- **Pre-26.1**: optional \`reobfJar\` for Spigot-mapped output; Paper prefers Mojang-mapped plugins.
- Prefer abstraction + Paper API, or NMS adapters per version — not one giant reflective soup.
- Official docs: https://docs.papermc.io/paper/dev/userdev/
- paperweight-userdev **2.x** needs **Gradle 9+**; **2.0.0-beta.24** declares plugin-api **9.7.1** → use Gradle 9.7.1+ (older wrapper → variant mismatch).
`;
}
