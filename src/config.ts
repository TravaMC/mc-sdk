import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  javadocBaseUrlFor,
  platformLabel,
  type Platform,
} from "./platform.js";
import { normalizeGameVersion } from "./versioning.js";

export const CONFIG_FILENAME = ".mc-sdk.json";
export const CURSOR_RULE_PATH = path.join(".cursor", "rules", "mc-sdk.mdc");

export interface ProjectConfig {
  /** Target platform (default paper) */
  platform?: Platform;
  /** Pinned game/proxy version for the platform */
  paperVersion: string;
  /** Set when platform=velocity (mirrors paperVersion) */
  velocityVersion?: string;
  /** Minecraft version for NMS/mappings when it differs */
  minecraftVersion?: string;
  javadocBaseUrl: string;
  folia?: boolean;
  /** Prefer paperweight NMS toolchain in this project */
  nms?: boolean;
  notes?: string;
  updatedAt: string;
}

export function adventureJavadocBaseUrl(): string {
  return "https://jd.papermc.io/adventure/";
}

export function configPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_FILENAME);
}

export async function loadProjectConfig(
  projectRoot: string
): Promise<ProjectConfig | null> {
  try {
    const raw = await readFile(configPath(projectRoot), "utf8");
    const cfg = JSON.parse(raw) as ProjectConfig;
    if (!cfg.platform) cfg.platform = "paper";
    return cfg;
  } catch {
    return null;
  }
}

export async function saveProjectConfig(
  projectRoot: string,
  version: string,
  options?: {
    notes?: string;
    folia?: boolean;
    minecraftVersion?: string;
    platform?: Platform;
    nms?: boolean;
  }
): Promise<ProjectConfig> {
  const platform = options?.platform ?? "paper";
  const usesMinecraft =
    platform === "paper" || platform === "folia" || platform === "purpur";
  const config: ProjectConfig = {
    platform,
    paperVersion: version,
    velocityVersion: platform === "velocity" ? version : undefined,
    minecraftVersion: usesMinecraft
      ? options?.minecraftVersion ?? guessMinecraftVersion(version)
      : undefined,
    javadocBaseUrl: javadocBaseUrlFor(platform, version),
    folia:
      platform === "folia"
        ? true
        : platform === "paper"
          ? options?.folia
          : undefined,
    nms: usesMinecraft ? options?.nms : undefined,
    notes: options?.notes,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    configPath(projectRoot),
    JSON.stringify(config, null, 2) + "\n",
    "utf8"
  );
  await writeCursorRule(projectRoot, config);
  return config;
}

export function guessMinecraftVersion(paperVersion: string): string {
  return paperVersion.split("-")[0];
}

/** The pinned version for the config's platform (Velocity pins mirror it in velocityVersion). */
export function pinnedVersion(config: ProjectConfig): string {
  const platform = config.platform ?? "paper";
  return platform === "velocity"
    ? config.velocityVersion ?? config.paperVersion
    : config.paperVersion;
}

function cursorRuleContent(config: ProjectConfig): string {
  const platform = config.platform ?? "paper";
  const version = pinnedVersion(config);
  const footer = `Javadocs: ${config.javadocBaseUrl}
Config: \`${CONFIG_FILENAME}\`
`;
  const versionLock = `
## Version lock (do not bypass)

- Pinned target: **${platformLabel(platform)} ${version}**.
- Do **not** change platform/version, invent another (1.21.x / 26.x / latest), or re-pin unless the user explicitly asks.
- If the user never stated a version in chat and this pin looks wrong: stop and ask them.
`;

  if (platform === "velocity") {
    return `---
description: Velocity proxy plugin — use mc-sdk MCP for versioned Velocity Javadocs
globs: "**/*.{java,kt,yml,yaml,json,kts,gradle}"
alwaysApply: true
---

# Velocity plugin project

Targets **Velocity ${version}**.
${versionLock}
## Required workflow

1. Use MCP **mc-sdk** (\`mc_velocity_*\` / \`mc_search_api\` with platform=velocity).
2. Confirm with \`mc_get_config\`.
3. **Text/UI:** Adventure only — \`mc_adventure_guide\` / \`mc_adventure_search\`. Never Bungee \`TextComponent\` / \`ChatColor\` / \`§\` (LimboAPI included).
4. API: \`mc_velocity_search_api\`, \`mc_velocity_get_class\`.
5. Docs: \`mc_docs_search\` (velocity tags) / \`mc_docs_get\` / \`mc_velocity_guide\`.
6. Do not invent ProxyServer / event API from memory — look up **${version}**.

${footer}`;
  }

  if (platform === "folia") {
    return `---
description: Folia plugin — use mc-sdk MCP for versioned Folia Javadocs
globs: "**/*.{java,kt,yml,yaml,kts,gradle}"
alwaysApply: true
---

# Folia plugin project

Targets **Folia ${version}** (Minecraft **${config.minecraftVersion ?? version}**).
${versionLock}
## Required workflow

1. Use MCP **mc-sdk** (\`mc_search_api\` / \`mc_get_class\` with platform=folia).
2. Confirm with \`mc_get_config\` / \`mc_detect_version\`.
3. Follow \`mc_folia_guide\` — regionized scheduling; avoid global BukkitScheduler assumptions.
4. Off-tick I/O: \`mc_async_guide\` + Folia \`AsyncScheduler\` — never touch live world state off-region.
5. Docs: \`mc_docs_search\` (folia tags) / \`mc_docs_get\`.
6. Do not invent Folia/region APIs from memory — look up **${version}**.

${footer}`;
  }

  if (platform === "purpur") {
    return `---
description: Purpur plugin — use mc-sdk MCP for Purpur Javadocs (includes Paper + Purpur-only APIs)
globs: "**/*.{java,kt,yml,yaml,kts,gradle}"
alwaysApply: true
---

# Purpur plugin project

Targets **Purpur ${version}** (Minecraft **${config.minecraftVersion ?? version}**).
${versionLock}
## Required workflow

1. Use MCP **mc-sdk** with \`platform=purpur\` (\`mc_search_api\` / \`mc_get_class\`).
2. Read \`mc_purpur_guide\` — Purpur-only events and Bukkit extensions (\`isAfk\`, ridables, …) are **not** on Paper JD.
3. Gradle: \`mc_resolve_dependency\` (Purpur Maven timeout → paper-api fallback is OK for portable plugins).
4. Prefer \`compileOnly purpur-api\` when calling Purpur-specific APIs; \`paper-api\` is OK for Paper-compatible plugins.
5. Threading: \`mc_async_guide\` (same main-thread rules as Paper).
6. Do not invent Purpur APIs from memory — look up at ${config.javadocBaseUrl}

${footer}`;
  }

  return `---
description: Minecraft Paper/Folia plugin — use mc-sdk MCP for versioned docs and NMS
globs: "**/*.{java,kt,yml,yaml,kts,gradle}"
alwaysApply: true
---

# Minecraft plugin project (Paper${config.folia ? " + Folia" : ""}${config.nms ? " + NMS/paperweight" : ""})

Targets **Paper ${config.paperVersion}** (Minecraft **${config.minecraftVersion ?? config.paperVersion}**).
${versionLock}
## Required workflow

1. Use MCP **mc-sdk** before inventing API/NMS members.
2. Confirm version with \`mc_get_config\` / \`mc_detect_version\` (alias \`1.26.x\` → \`26.x\`).
3. Gradle coords: \`mc_resolve_dependency\` — do not invent \`-R0.1-SNAPSHOT\` for 26.x.
4. API-only path: \`mc_search_api\`, \`mc_get_class\` (\`memberQuery\` for large types like World), \`mc_lookup_*\` + \`compileOnly paper-api\`.
5. **Text/UI:** Adventure \`Component\` / MiniMessage — \`mc_adventure_guide\`. No Bungee \`TextComponent\` / \`ChatColor\`.
6. **26.x time:** \`mc_paper26_guide\` / \`mc_explain_error\` before \`World.setTime\` — check \`isFixedTime\` / world clock.
7. **Threading:** never block the main/region thread with HTTP/DB/disk/heavy math — read \`mc_async_guide\` / \`docs/async.md\`. Snapshot → async → batched apply.
8. **Commands:** \`mc_commands_guide\` before inventing executors/Brigadier.
9. NMS path (last resort): \`mc_api_vs_nms\` → \`mc_resolve_dependency\` \`nms: true\` → optional \`mc_nms_*\` (26.1+: names come from the official server.jar, \`source: server-jar\`; if \`mappingsFallback\` is set, **verify members in paperDevBundle / IDE**) → \`compileJava\`.
10. On Windows with non-ASCII user paths, build via \`build.ps1\` / ASCII temp dir (\`mc_build_guidance\`) — do this early.
11. Folia: if enabled, follow \`mc_folia_guide\` (region/entity/async schedulers).
${
  config.nms
    ? `
## NMS project rules (pinned nms: true)

- No public Javadoc for \`net.minecraft.*\`. Truth = **paperDevBundle** sources after Gradle sync.
- \`mc_nms_search\` / \`mc_nms_class\` on 26.1+ read the official server.jar for the pinned version (vanilla names). Paper-added members are not in it; \`mappingsFallback: true\` means hints only. Compile is the authority.
- Use \`MOJANG_PRODUCTION\`; never \`reobfJar\` on 26.1+.
`
    : ""
}
${footer}`;
}

async function writeCursorRule(
  projectRoot: string,
  config: ProjectConfig
): Promise<void> {
  const rulePath = path.join(projectRoot, CURSOR_RULE_PATH);
  await mkdir(path.dirname(rulePath), { recursive: true });
  await writeFile(rulePath, cursorRuleContent(config), "utf8");
}

export async function resolveVersion(
  projectRoot: string | undefined,
  versionOverride?: string,
  platform?: Platform
): Promise<{
  version: string;
  platform: Platform;
  source: "argument" | "project" | "missing";
  config?: ProjectConfig;
  warning?: string;
}> {
  if (versionOverride?.trim()) {
    const norm = normalizeGameVersion(versionOverride);
    return {
      version: norm.version,
      platform: platform ?? "paper",
      source: "argument",
      ...(norm.warning ? { warning: norm.warning } : {}),
    };
  }
  if (projectRoot) {
    const config = await loadProjectConfig(projectRoot);
    if (config) {
      const p = platform ?? config.platform ?? "paper";
      const version = pinnedVersion({ ...config, platform: p });
      if (version) {
        return { version, platform: p, source: "project", config };
      }
    }
  }
  return { version: "", platform: platform ?? "paper", source: "missing" };
}

export { platformLabel };
export type { Platform };
