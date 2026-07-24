import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  loadProjectConfig,
  resolveVersion,
  saveProjectConfig,
  CONFIG_FILENAME,
  type Platform,
} from "./config.js";
import { detectVersionFromProject, pickBestDetection } from "./detect.js";
import { diffApiVersions } from "./diff.js";
import { fetchDocsPage, searchDocsCatalog, DOCS_CATALOG, DOCS_CATALOG_EXTERNAL } from "./docs/papermc.js";
import { findEventsByScenario } from "./events.js";
import {
  apiVsNmsMarkdown,
  asyncGuidanceMarkdown,
  buildGuidanceMarkdown,
  commandsGuidanceMarkdown,
  foliaGuidanceMarkdown,
  nmsDocMarkdown,
  purpurGuidanceMarkdown,
  velocityGuidanceMarkdown,
} from "./guidance.js";
import {
  listFoliaVersionsWithJavadoc,
  resolveFoliaJavadocVersion,
} from "./folia/versions.js";
import {
  listPurpurVersionsWithJavadoc,
  resolvePurpurJavadocVersion,
} from "./purpur/versions.js";
import { searchHangar } from "./hangar.js";
import { javadocSearchVersion } from "./platform.js";
import {
  clearCache,
  getCacheStats,
  pruneCache,
} from "./cache.js";
import {
  describeBuiltinEnums,
  listEnumConstants,
  resolveEnumTarget,
  searchEnumConstants,
  type BuiltinEnumKind,
} from "./javadoc/enums.js";
import { searchAdventure } from "./javadoc/adventure.js";
import { formatClassDoc, fetchClassDoc } from "./javadoc/parse.js";
import { searchApi } from "./javadoc/search.js";
import {
  getNmsClass,
  remapperGuidanceMarkdown,
  searchNms,
} from "./nms/mappings.js";
import {
  pluginYmlSchemaHelp,
  validatePluginYml,
} from "./schemas/pluginYml.js";
import { renderTemplate, type TemplateKind } from "./templates.js";
import {
  getPaperBuilds,
  listVersionsWithJavadocStatus,
  resolveJavadocVersion,
} from "./versions.js";
import {
  listVelocityVersionsWithJavadoc,
  resolveVelocityJavadocVersion,
} from "./velocity/versions.js";
import { resolveDependency } from "./deps/resolve.js";
import { scaffoldProject } from "./scaffold.js";
import { validateBuildGradle } from "./validateBuild.js";
import { normalizeGameVersion } from "./versioning.js";

function text(data: unknown) {
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text: body }] };
}

function errorText(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

async function requireVersion(
  projectRoot: string | undefined,
  version?: string,
  platform?: Platform
) {
  const resolved = await resolveVersion(projectRoot, version, platform);
  if (resolved.source === "missing" || !resolved.version) {
    return errorText(
      "Version not set. Call mc_set_version (platform paper|velocity|folia|purpur) or mc_detect_version, or pass version explicitly."
    );
  }
  return {
    version: resolved.version,
    platform: resolved.platform,
    config: resolved.config,
    warning: resolved.warning,
  };
}

const platformEnum = z.enum(["paper", "velocity", "folia", "purpur"]);

const PKG = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { name: string; version: string };

export function createServer(): McpServer {
  const server = new McpServer({
    name: PKG.name,
    version: PKG.version,
  });

  // —— Version / project memory ——
  server.tool(
    "mc_set_version",
    "Pin Paper, Folia, Purpur, or Velocity version for a project. Writes .mc-sdk.json and a Cursor rule.",
    {
      projectRoot: z.string().describe("Absolute path to plugin project root"),
      version: z
        .string()
        .describe(
          "Paper/Folia/Purpur calendar id (e.g. 26.2, 1.21.1). Alias: 1.26.2 → 26.2. Velocity: 3.4.0 / latest"
        ),
      platform: platformEnum
        .optional()
        .describe("Target platform (default paper)"),
      notes: z.string().optional(),
      folia: z
        .boolean()
        .optional()
        .describe("Paper only: mark Folia-targeted (prefer platform=folia for Folia JD)"),
      nms: z.boolean().optional().describe("Paper/Folia: expect paperweight/NMS"),
      minecraftVersion: z
        .string()
        .optional()
        .describe("Paper/Folia: override MC version for NMS mappings"),
      allowUnavailable: z.boolean().optional(),
    },
    async ({
      projectRoot,
      version,
      platform,
      notes,
      folia,
      nms,
      minecraftVersion,
      allowUnavailable,
    }) => {
      const plat: Platform = platform ?? "paper";
      if (plat === "velocity") {
        const resolved = await resolveVelocityJavadocVersion(version);
        if (!resolved.available && !allowUnavailable) {
          return errorText(
            `No Velocity Javadocs for ${version}.` +
              (resolved.suggestion
                ? ` Try ${resolved.suggestion} or allowUnavailable=true.`
                : "")
          );
        }
        const effective = resolved.available
          ? resolved.version === "latest"
            ? "latest"
            : resolved.version
          : version.trim();
        const config = await saveProjectConfig(projectRoot, effective, {
          notes,
          platform: "velocity",
        });
        return text({
          ok: true,
          message: `Pinned Velocity ${effective}`,
          config,
          configFile: CONFIG_FILENAME,
        });
      }

      if (plat === "folia") {
        const resolved = await resolveFoliaJavadocVersion(version);
        if (!resolved.available && !allowUnavailable) {
          return errorText(
            `No Folia Javadocs for ${resolved.version}.` +
              (resolved.suggestion
                ? ` Try ${resolved.suggestion} or allowUnavailable=true.`
                : "") +
              (resolved.warning ? ` (${resolved.warning})` : "")
          );
        }
        const effective = resolved.available
          ? resolved.version === "latest"
            ? "latest"
            : resolved.version
          : resolved.version;
        const config = await saveProjectConfig(projectRoot, effective, {
          notes,
          nms,
          minecraftVersion,
          platform: "folia",
        });
        return text({
          ok: true,
          message: `Pinned Folia ${effective}${nms ? " (NMS/paperweight)" : ""}`,
          config,
          configFile: CONFIG_FILENAME,
          javadocAvailable: resolved.available,
          versionWarning: resolved.warning,
          inputVersion: resolved.input ?? version,
        });
      }

      if (plat === "purpur") {
        const resolved = await resolvePurpurJavadocVersion(version);
        if (!resolved.available && !allowUnavailable) {
          return errorText(
            `No Purpur Javadocs at ${resolved.javadocRoot}.` +
              (resolved.suggestion
                ? ` Try version ${resolved.suggestion} or allowUnavailable=true.`
                : "") +
              (resolved.warning ? ` (${resolved.warning})` : "")
          );
        }
        const effective = resolved.version;
        const config = await saveProjectConfig(projectRoot, effective, {
          notes,
          nms,
          minecraftVersion,
          platform: "purpur",
        });
        return text({
          ok: true,
          message: `Pinned Purpur ${effective} (JD: ${resolved.javadocRoot})`,
          config,
          configFile: CONFIG_FILENAME,
          javadocAvailable: resolved.available,
          versionWarning: resolved.warning,
          inputVersion: resolved.input ?? version,
          note: "Purpur Javadocs are a single tree at purpurmc.org/javadoc — version pin aligns Maven/Minecraft.",
        });
      }

      const resolved = await resolveJavadocVersion(version);
      if (!resolved.available && !allowUnavailable) {
        return errorText(
          `No Javadocs at https://jd.papermc.io/paper/${resolved.version}/.` +
            (resolved.suggestion
              ? ` Try ${resolved.suggestion} or allowUnavailable=true.`
              : "") +
            (resolved.warning ? ` (${resolved.warning})` : "")
        );
      }
      const effective = resolved.available ? resolved.version : resolved.version;
      const config = await saveProjectConfig(projectRoot, effective, {
        notes,
        folia,
        nms,
        minecraftVersion,
        platform: "paper",
      });
      return text({
        ok: true,
        message: `Pinned Paper ${effective}${nms ? " (NMS/paperweight)" : ""}`,
        config,
        configFile: CONFIG_FILENAME,
        javadocAvailable: resolved.available,
        versionWarning: resolved.warning,
        inputVersion: resolved.input ?? version,
      });
    }
  );

  server.tool(
    "mc_get_config",
    "Read pinned project config (.mc-sdk.json).",
    { projectRoot: z.string() },
    async ({ projectRoot }) => {
      const config = await loadProjectConfig(projectRoot);
      if (!config) {
        return errorText(`No config in ${projectRoot}. Use mc_set_version or mc_detect_version.`);
      }
      return text(config);
    }
  );

  server.tool(
    "mc_detect_version",
    "Auto-detect Paper, Folia, Purpur, or Velocity version from Gradle/Maven/plugin.yml; optionally pin.",
    {
      projectRoot: z.string(),
      pin: z
        .boolean()
        .optional()
        .describe("If true, save the best match via mc_set_version"),
      folia: z
        .boolean()
        .optional()
        .describe("Force Folia flag when pinning a Paper hit"),
    },
    async ({ projectRoot, pin, folia }) => {
      const detected = await detectVersionFromProject(projectRoot);
      if (!detected.length) {
        return errorText(
          "No version found in build files. Pass version to mc_set_version manually."
        );
      }
      let pinned = null;
      if (pin) {
        const best = pickBestDetection(detected);
        if (!best?.version) {
          return text({
            detected,
            pinned: null,
            note: "Best hit has no version string; pin manually with mc_set_version.",
          });
        }
        if (best.platform === "velocity") {
          const resolved = await resolveVelocityJavadocVersion(best.version);
          const version = resolved.available
            ? resolved.version
            : resolved.suggestion ?? best.version;
          pinned = await saveProjectConfig(projectRoot, version, {
            platform: "velocity",
          });
        } else if (best.platform === "folia") {
          const resolved = await resolveFoliaJavadocVersion(best.version);
          const version = resolved.available
            ? resolved.version
            : resolved.suggestion ?? best.version;
          pinned = await saveProjectConfig(projectRoot, version, {
            platform: "folia",
            nms: best.nms,
          });
        } else if (best.platform === "purpur") {
          const resolved = await resolvePurpurJavadocVersion(best.version);
          pinned = await saveProjectConfig(projectRoot, resolved.version, {
            platform: "purpur",
            nms: best.nms,
          });
        } else {
          const useFolia = Boolean(folia || best.folia);
          if (useFolia) {
            const resolved = await resolveFoliaJavadocVersion(best.version);
            const version = resolved.available
              ? resolved.version
              : resolved.suggestion ?? best.version;
            pinned = await saveProjectConfig(projectRoot, version, {
              platform: "folia",
              nms: best.nms,
            });
          } else {
            const resolved = await resolveJavadocVersion(best.version);
            const version = resolved.available
              ? resolved.version
              : resolved.suggestion ?? best.version;
            pinned = await saveProjectConfig(projectRoot, version, {
              folia: false,
              nms: best.nms,
              platform: "paper",
            });
          }
        }
      }
      return text({ detected, pinned, best: pickBestDetection(detected) });
    }
  );

  server.tool(
    "mc_list_versions",
    "List Paper/Folia/Purpur versions with javadoc flag, min Java, api-version, and dependency example.",
    {
      limit: z.number().int().min(5).max(80).optional(),
      platform: z.enum(["paper", "folia", "purpur"]).optional(),
    },
    async ({ limit, platform }) => {
      if (platform === "folia") {
        const versions = await listFoliaVersionsWithJavadoc(limit ?? 30);
        return text({
          platform: "folia",
          versions,
          withJavadoc: versions.filter((v) => v.hasJavadoc).map((v) => v.version),
        });
      }
      if (platform === "purpur") {
        const versions = await listPurpurVersionsWithJavadoc(limit ?? 30);
        return text({
          platform: "purpur",
          versions,
          javadocRoot: "https://purpurmc.org/javadoc/",
          note: "Purpur JD is a single unversioned tree; versions come from api.purpurmc.org. Use mc_resolve_dependency for exact Maven coords.",
          withJavadoc: versions.filter((v) => v.hasJavadoc).map((v) => v.version),
        });
      }
      const versions = await listVersionsWithJavadocStatus(limit ?? 30);
      return text({
        platform: "paper",
        versions,
        withJavadoc: versions.filter((v) => v.hasJavadoc).map((v) => v.version),
        note: "Fields: version, hasJavadoc, minJava, apiVersion, dependencyExample, channelHint. Exact builds: mc_resolve_dependency.",
      });
    }
  );

  server.tool(
    "mc_paper_builds",
    "Get Fill API metadata and build numbers for a Paper version (normalizes 1.26.x → 26.x).",
    { version: z.string() },
    async ({ version }) => {
      try {
        const norm = normalizeGameVersion(version);
        const data = await getPaperBuilds(norm.version);
        return text({
          ...(typeof data === "object" && data ? data : { data }),
          resolvedVersion: norm.version,
          versionWarning: norm.warning,
        });
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // —— API javadoc ——
  server.tool(
    "mc_search_api",
    "Search Paper, Folia, Purpur, or Velocity Javadocs (types/members/packages).",
    {
      query: z.string(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      platform: platformEnum.optional(),
      scope: z.enum(["all", "types", "members", "packages"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ query, projectRoot, version, platform, scope, limit }) => {
      const v = await requireVersion(projectRoot, version, platform);
      if ("isError" in v) return v;
      const jdVer = javadocSearchVersion(v.platform, v.version);
      const results = await searchApi(jdVer, query, {
        scope,
        limit,
        platform: v.platform,
      });
      return text({
        platform: v.platform,
        version: v.version,
        javadocVersion: jdVer || "root",
        query,
        ...results,
      });
    }
  );

  server.tool(
    "mc_get_class",
    "Fetch API class/interface/enum summary from Paper, Folia, Purpur, or Velocity Javadocs.",
    {
      className: z.string(),
      packageName: z.string().optional(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      platform: platformEnum.optional(),
      includeAllEnumConstants: z.boolean().optional(),
      maxMethods: z.number().int().min(10).max(400).optional(),
    },
    async (args) => {
      const v = await requireVersion(args.projectRoot, args.version, args.platform);
      if ("isError" in v) return v;
      try {
        const doc = await fetchClassDoc(
          javadocSearchVersion(v.platform, v.version),
          args.className,
          args.packageName,
          v.platform
        );
        return text(
          formatClassDoc(doc, {
            includeEnumConstants: args.includeAllEnumConstants,
            maxMethods: args.maxMethods,
          })
        );
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_lookup_material",
    "Search Material constants (blocks/items) for the target Paper version.",
    {
      query: z.string().optional(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      listAll: z.boolean().optional(),
    },
    async ({ query, projectRoot, version, limit, listAll }) => {
      const v = await requireVersion(projectRoot, version);
      if ("isError" in v) return v;
      const target = resolveEnumTarget("material");
      if (listAll && !query) {
        const all = await listEnumConstants(v.version, target.package, target.className);
        return text({ version: v.version, type: "Material", count: all.length, values: all });
      }
      const hits = await searchEnumConstants(
        v.version,
        target.package,
        target.className,
        query ?? "",
        limit ?? 50
      );
      return text({
        version: v.version,
        type: "Material",
        values: hits.map((h) => h.name),
        urls: hits.slice(0, 15).map((h) => h.url),
      });
    }
  );

  server.tool(
    "mc_lookup_entity",
    "Search EntityType constants for the target Paper version.",
    {
      query: z.string().optional(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      listAll: z.boolean().optional(),
    },
    async ({ query, projectRoot, version, limit, listAll }) => {
      const v = await requireVersion(projectRoot, version);
      if ("isError" in v) return v;
      const target = resolveEnumTarget("entity");
      if (listAll && !query) {
        const all = await listEnumConstants(v.version, target.package, target.className);
        return text({ version: v.version, type: "EntityType", count: all.length, values: all });
      }
      const hits = await searchEnumConstants(
        v.version,
        target.package,
        target.className,
        query ?? "",
        limit ?? 50
      );
      return text({
        version: v.version,
        values: hits.map((h) => h.name),
        urls: hits.slice(0, 15).map((h) => h.url),
      });
    }
  );

  server.tool(
    "mc_lookup_enum",
    "Search enum/registry constants (Material, EntityType, Sound, Enchantment, ItemType, BlockType, …).",
    {
      kind: z.enum([
        "material",
        "entity",
        "enchantment",
        "potion",
        "sound",
        "particle",
        "game_event",
        "statistic",
        "item_type",
        "block_type",
        "custom",
      ]),
      query: z.string().optional(),
      packageName: z.string().optional(),
      className: z.string().optional(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      listAll: z.boolean().optional(),
    },
    async (args) => {
      const v = await requireVersion(args.projectRoot, args.version);
      if ("isError" in v) return v;
      try {
        const target = resolveEnumTarget(
          args.kind as BuiltinEnumKind,
          args.packageName,
          args.className
        );
        if (args.listAll && !args.query) {
          const all = await listEnumConstants(v.version, target.package, target.className);
          return text({
            version: v.version,
            type: `${target.package}.${target.className}`,
            count: all.length,
            values: all,
            builtins: describeBuiltinEnums(),
          });
        }
        const hits = await searchEnumConstants(
          v.version,
          target.package,
          target.className,
          args.query ?? "",
          args.limit ?? 50
        );
        return text({
          version: v.version,
          type: `${target.package}.${target.className}`,
          values: hits.map((h) => h.name),
        });
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_lookup_registry",
    "Modern registry API lookup — ItemType / BlockType (prefer over Material when available).",
    {
      kind: z.enum(["item_type", "block_type"]),
      query: z.string().optional(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      listAll: z.boolean().optional(),
    },
    async ({ kind, query, projectRoot, version, limit, listAll }) => {
      const v = await requireVersion(projectRoot, version);
      if ("isError" in v) return v;
      const target = resolveEnumTarget(kind);
      if (listAll && !query) {
        const all = await listEnumConstants(v.version, target.package, target.className);
        return text({
          version: v.version,
          type: `${target.package}.${target.className}`,
          count: all.length,
          values: all,
          note: "Prefer registry types over Material for new code when on modern Paper.",
        });
      }
      const hits = await searchEnumConstants(
        v.version,
        target.package,
        target.className,
        query ?? "",
        limit ?? 50
      );
      return text({
        version: v.version,
        type: `${target.package}.${target.className}`,
        values: hits.map((h) => h.name),
      });
    }
  );

  server.tool(
    "mc_find_event",
    "Find Bukkit/Paper event classes for a natural-language scenario (click block, death, chat, …).",
    {
      scenario: z.string(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      limit: z.number().int().min(1).max(40).optional(),
    },
    async ({ scenario, projectRoot, version, limit }) => {
      const v = await requireVersion(projectRoot, version);
      if ("isError" in v) return v;
      const found = await findEventsByScenario(v.version, scenario, limit ?? 15);
      return text({
        ...found,
        version: v.version,
        versionWarning: v.warning,
      });
    }
  );

  server.tool(
    "mc_diff_api",
    "Diff Paper API type indexes between two versions (added/removed types).",
    {
      fromVersion: z.string(),
      toVersion: z.string(),
      packagePrefix: z.string().optional().describe("e.g. org.bukkit.event"),
      limit: z.number().int().min(10).max(200).optional(),
    },
    async ({ fromVersion, toVersion, packagePrefix, limit }) => {
      try {
        return text(
          await diffApiVersions(fromVersion, toVersion, {
            packagePrefix,
            limit,
          })
        );
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // —— Docs / Adventure / Folia ——
  server.tool(
    "mc_docs_search",
    "Search curated PaperMC documentation pages (docs.papermc.io).",
    {
      query: z.string(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async ({ query, limit }) => text(searchDocsCatalog(query, limit ?? 10))
  );

  server.tool(
    "mc_docs_get",
    "Fetch a docs.papermc.io page by path or URL and return text content.",
    {
      pathOrUrl: z
        .string()
        .describe("e.g. /paper/dev/folia-support/ or full URL"),
    },
    async ({ pathOrUrl }) => {
      try {
        return text(await fetchDocsPage(pathOrUrl));
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_adventure_search",
    "Search Adventure API Javadocs (components, audiences, MiniMessage-related types).",
    {
      query: z.string(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, limit }) => {
      try {
        return text(await searchAdventure(query, limit ?? 20));
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_folia_guide",
    "Folia region-threading guidance and checklist (docs/folia.md).",
    {},
    async () => text(await foliaGuidanceMarkdown())
  );

  server.tool(
    "mc_async_guide",
    "CRITICAL: when async is allowed on Paper (I/O + heavy math), snapshots, batched apply, teleportAsync pitfalls, Folia notes. Read before scheduling work.",
    {},
    async () => text(await asyncGuidanceMarkdown())
  );

  server.tool(
    "mc_commands_guide",
    "Paper commands: classic plugin.yml executors vs Brigadier/Command API — links and checklist (do not invent APIs).",
    {},
    async () => text(await commandsGuidanceMarkdown())
  );

  server.tool(
    "mc_purpur_guide",
    "Purpur vs Paper: unique JD packages/events, Bukkit extensions (AFK, ridables), purpur-api dependency.",
    {},
    async () => text(await purpurGuidanceMarkdown())
  );

  server.tool(
    "mc_cache_stats",
    "HTTP/Javadoc cache stats + sdkPackageVersion (use this to verify MCP reloaded — Cursor may omit extra tools from the catalog).",
    {},
    async () => {
      const pruned = await pruneCache();
      const stats = await getCacheStats();
      return text({
        ...stats,
        bytesHuman: `${(stats.bytes / (1024 * 1024)).toFixed(2)} MiB`,
        autoPruned: pruned,
        sdkPackageVersion: PKG.version,
        serverName: PKG.name,
        toolsHighlight: [
          "mc_resolve_dependency",
          "mc_scaffold_project",
          "mc_validate_build_gradle",
        ],
        note: "If sdkPackageVersion is stale or toolsHighlight tools are missing from GetMcpTools, kill duplicate node MCP processes and toggle the server Off→On (full Cursor restart if needed).",
      });
    }
  );

  server.tool(
    "mc_cache_clear",
    "Clear HTTP/Javadoc disk cache (optional key prefix). Prefer relying on auto TTL/revalidate; use after broken indexes.",
    {
      prefix: z
        .string()
        .optional()
        .describe("Optional substring, e.g. jd:paper:1.21.1 or fill:paper"),
    },
    async ({ prefix }) => text(await clearCache({ prefix }))
  );

  server.tool(
    "mc_build_guidance",
    "Paper/paperweight build practices: toolchain matrix (Gradle JVM vs compile JDK), API vs NMS, Windows non-ASCII paths (build.ps1).",
    {},
    async () => text(await buildGuidanceMarkdown())
  );

  server.tool(
    "mc_api_vs_nms",
    "Decision guide: when to use Paper API vs NMS (decision tree, traps, anti-patterns, multi-version). Prefer API by default.",
    {},
    async () => text(await apiVsNmsMarkdown())
  );

  server.tool(
    "mc_velocity_guide",
    "Velocity proxy plugin development overview and Javadoc links.",
    {},
    async () => text(await velocityGuidanceMarkdown())
  );

  server.tool(
    "mc_velocity_list_versions",
    "List Velocity versions and whether Javadocs exist at jd.papermc.io/velocity/{version}/.",
    {
      limit: z.number().int().min(5).max(40).optional(),
    },
    async ({ limit }) => {
      const versions = await listVelocityVersionsWithJavadoc(limit ?? 20);
      return text({
        versions,
        withJavadoc: versions.filter((v) => v.hasJavadoc).map((v) => v.version),
        pattern: "https://jd.papermc.io/velocity/{version}/",
        latestRoot: "https://jd.papermc.io/velocity/",
      });
    }
  );

  server.tool(
    "mc_velocity_search_api",
    "Search Velocity Javadocs (com.velocitypowered.*) for a version.",
    {
      query: z.string(),
      projectRoot: z.string().optional(),
      version: z
        .string()
        .optional()
        .describe("e.g. 3.4.0, 4.0.0, latest (root docs)"),
      scope: z.enum(["all", "types", "members", "packages"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ query, projectRoot, version, scope, limit }) => {
      const v = await requireVersion(projectRoot, version, "velocity");
      if ("isError" in v) return v;
      const ver = v.version === "latest" ? "" : v.version;
      const results = await searchApi(ver, query, {
        scope,
        limit,
        platform: "velocity",
      });
      return text({ platform: "velocity", version: v.version, query, ...results });
    }
  );

  server.tool(
    "mc_velocity_get_class",
    "Fetch a Velocity API class summary from versioned Javadocs.",
    {
      className: z.string().describe("e.g. ProxyServer, Player, Plugin"),
      packageName: z.string().optional(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      maxMethods: z.number().int().min(10).max(400).optional(),
    },
    async (args) => {
      const v = await requireVersion(args.projectRoot, args.version, "velocity");
      if ("isError" in v) return v;
      try {
        const doc = await fetchClassDoc(
          v.version === "latest" ? "" : v.version,
          args.className,
          args.packageName,
          "velocity"
        );
        return text(formatClassDoc(doc, { maxMethods: args.maxMethods }));
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // —— Manifests / templates / Hangar ——
  server.tool(
    "mc_validate_plugin_yml",
    "Validate plugin.yml or paper-plugin.yml content and return issues.",
    {
      content: z.string().describe("Full YAML file contents"),
    },
    async ({ content }) => text(validatePluginYml(content))
  );

  server.tool(
    "mc_plugin_yml_schema",
    "Show plugin.yml / paper-plugin.yml field help.",
    {},
    async () => text(pluginYmlSchemaHelp())
  );

  server.tool(
    "mc_template",
    "Generate starter snippets: Paper/Purpur Gradle (26.x Java 25), async_io/cpu/secure, Folia, paperweight, Velocity, windows_build_ps1.",
    {
      kind: z.enum([
        "listener",
        "command",
        "plugin_main",
        "paper_plugin_yml",
        "plugin_yml",
        "custom_item",
        "paper_build",
        "paperweight_build",
        "nms_helper",
        "windows_build_ps1",
        "velocity_main",
        "velocity_build",
        "velocity_plugin_json",
        "async_io",
        "async_cpu",
        "async_secure",
        "folia_region_task",
        "purpur_build",
      ]),
      packageName: z.string().optional(),
      className: z.string().optional(),
      pluginName: z.string().optional(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      folia: z.boolean().optional(),
      nms: z.boolean().optional(),
    },
    async (args) => {
      let version = args.version;
      let folia = args.folia;
      let nms = args.nms;
      if (args.projectRoot) {
        const cfg = await loadProjectConfig(args.projectRoot);
        version =
          version ??
          (cfg?.platform === "velocity"
            ? cfg.velocityVersion ?? cfg.paperVersion
            : cfg?.paperVersion);
        folia = folia ?? cfg?.folia;
        nms = nms ?? cfg?.nms;
      }
      const rendered = renderTemplate(args.kind as TemplateKind, {
        packageName: args.packageName,
        className: args.className,
        pluginName: args.pluginName,
          version: version ?? "26.2",
        folia,
        nms,
      });
      const norm = version ? normalizeGameVersion(version) : null;
      return text(
        norm?.warning
          ? `${rendered}\n\n// VERSION NOTE: ${norm.warning}`
          : rendered
      );
    }
  );

  server.tool(
    "mc_resolve_dependency",
    "One-shot Gradle resolve: paper-api/purpur-api OR nms=true → userdev + paperDevBundle + min Gradle. Purpur timeout → paper-api fallback.",
    {
      version: z.string().optional().describe("e.g. 26.2 or mistaken 1.26.2"),
      platform: platformEnum.optional(),
      preferStable: z.boolean().optional().describe("Prefer *-stable over beta/alpha (default true)"),
      allowPaperFallback: z
        .boolean()
        .optional()
        .describe("If Purpur Maven fails, fall back to paper-api (default true)"),
      nms: z
        .boolean()
        .optional()
        .describe("If true, resolve paperweight-userdev + paperDevBundle (not paper-api)"),
      projectRoot: z.string().optional().describe("Optional: use pinned version when version omitted"),
    },
    async ({ version, platform, preferStable, allowPaperFallback, nms: nmsArg, projectRoot }) => {
      try {
        let ver = version;
        let plat = platform;
        let nms = nmsArg;
        if ((!ver || !plat) && projectRoot) {
          const cfg = await loadProjectConfig(projectRoot);
          ver = ver || cfg?.paperVersion || "";
          plat = plat ?? cfg?.platform ?? "paper";
          if (nms === undefined && cfg?.nms) nms = true;
        }
        if (!ver) {
          return errorText("Pass version or projectRoot with a pinned config.");
        }
        const result = await resolveDependency({
          version: ver,
          platform: plat ?? "paper",
          preferStable,
          allowPaperFallback,
          nms,
        });
        return text(result);
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_scaffold_project",
    "Write a full plugin scaffold: settings.gradle.kts, build.gradle.kts, plugin.yml, main+listener, .gitignore, build.ps1, README.",
    {
      projectRoot: z.string().describe("Absolute path for the new/empty project root"),
      version: z.string(),
      platform: platformEnum.optional(),
      packageName: z.string().optional(),
      className: z.string().optional(),
      pluginName: z.string().optional(),
      pin: z.boolean().optional().describe("Also write .mc-sdk.json (default true)"),
    },
    async ({ projectRoot, version, platform, packageName, className, pluginName, pin }) => {
      try {
        const plat = platform ?? "paper";
        const result = await scaffoldProject({
          projectRoot,
          version,
          platform: plat,
          packageName,
          className,
          pluginName,
        });
        let config = null;
        if (pin !== false && plat !== "velocity") {
          config = await saveProjectConfig(projectRoot, result.dependency.version, {
            platform: plat,
          });
        }
        return text({
          ok: true,
          written: result.written,
          dependency: result.dependency,
          versionWarning: result.versionWarning,
          config,
          next: [
            "Add Gradle wrapper if missing: gradle wrapper --gradle-version 8.14.2",
            "Windows non-ASCII path: .\\build.ps1",
            "Otherwise: ./gradlew build",
          ],
        });
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_validate_build_gradle",
    "Pre-build check: coords, Java, api-version, 1.26.x mistake, reobfJar on 26.1+, Gradle<9 with userdev 2.x.",
    {
      projectRoot: z.string(),
      expectedVersion: z.string().optional(),
      platform: platformEnum.optional(),
    },
    async ({ projectRoot, expectedVersion, platform }) => {
      let expected = expectedVersion;
      let plat = platform;
      if (!expected || !plat) {
        const cfg = await loadProjectConfig(projectRoot);
        expected = expected ?? cfg?.paperVersion;
        plat = plat ?? cfg?.platform;
      }
      return text(
        await validateBuildGradle(projectRoot, {
          expectedVersion: expected,
          platform: plat,
        })
      );
    }
  );

  server.tool(
    "mc_hangar_search",
    "Search Hangar (Paper plugin repository) for dependencies / similar plugins.",
    {
      query: z.string(),
      limit: z.number().int().min(1).max(25).optional(),
    },
    async ({ query, limit }) => {
      try {
        return text(await searchHangar(query, limit ?? 10));
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // —— NMS ——
  server.tool(
    "mc_nms_guidance",
    "NMS / paperweight workflow (Mojang mappings). Prefer Paper API — read mc_api_vs_nms first.",
    {
      projectRoot: z.string().optional(),
      version: z.string().optional(),
    },
    async ({ projectRoot, version }) => {
      const v =
        version ??
        (projectRoot
          ? (await loadProjectConfig(projectRoot))?.minecraftVersion
          : undefined);
      return text(await nmsDocMarkdown(v));
    }
  );

  server.tool(
    "mc_remapper_guidance",
    "Paper remapper / userdev multi-version guidance.",
    {},
    async () => text(remapperGuidanceMarkdown())
  );

  server.tool(
    "mc_nms_search",
    "Search Mojang-mapped NMS class names. For 26.1+ (no server_mappings) falls back to 1.21.11 with an explicit warning.",
    {
      query: z.string().describe("e.g. ServerPlayer, Abilities, ClientboundPlayerAbilitiesPacket"),
      projectRoot: z.string().optional(),
      version: z
        .string()
        .optional()
        .describe("Paper or Minecraft version; defaults to project minecraftVersion/paperVersion"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, projectRoot, version, limit }) => {
      try {
        let ver = version;
        if (!ver && projectRoot) {
          const cfg = await loadProjectConfig(projectRoot);
          ver = cfg?.minecraftVersion ?? cfg?.paperVersion;
        }
        if (!ver) {
          return errorText("Pass version or projectRoot with pinned config.");
        }
        return text(await searchNms(ver, query, limit ?? 25));
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_nms_class",
    "Get NMS class fields/methods from Mojang server mappings (+ mappings.dev). 26.1+ falls back to nearest mapped version with warning.",
    {
      className: z
        .string()
        .describe("Simple or FQCN, e.g. ServerPlayer or net.minecraft.server.level.ServerPlayer"),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
    },
    async ({ className, projectRoot, version }) => {
      try {
        let ver = version;
        if (!ver && projectRoot) {
          const cfg = await loadProjectConfig(projectRoot);
          ver = cfg?.minecraftVersion ?? cfg?.paperVersion;
        }
        if (!ver) return errorText("Pass version or projectRoot with pinned config.");
        const result = await getNmsClass(ver, className);
        return text({
          requestedVersion: result.requestedVersion,
          mcVersion: result.mcVersion,
          mappingsFallback: result.mappingsFallback,
          unobfuscatedRuntime: result.unobfuscatedRuntime,
          mojangName: result.cls.mojangName,
          obfuscated: result.cls.obfuscated,
          memberCount: result.cls.members.length,
          members: result.cls.members.slice(0, 120),
          mappingsDevUrl: result.mappingsDevUrl,
          mappingsDevExcerpt: result.mappingsDevExcerpt,
          warning:
            result.warning ??
            "NMS is unstable. Prefer Paper API. Use paperweight-userdev with Mojang names.",
          nextSteps: result.nextSteps,
        });
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // —— Resources ——
  server.resource(
    "sdk-overview",
    "minecraft://sdk/overview",
    { mimeType: "text/markdown", description: "mc-sdk overview" },
    async () => ({
      contents: [
        {
          uri: "minecraft://sdk/overview",
          mimeType: "text/markdown",
          text: `# mc-sdk

Tools use the \`mc_\` prefix. Pin with \`mc_set_version\` (\`platform: paper|velocity|folia|purpur\`).
Alias: \`1.26.2\` → \`26.2\` (with warning). Prefer \`mc_resolve_dependency\` for Gradle coords.

## Categories
- Version: mc_set_version, mc_get_config, mc_detect_version, mc_list_versions, mc_paper_builds, mc_resolve_dependency
- Paper/Folia API: mc_search_api, mc_get_class, mc_lookup_*, mc_find_event, mc_diff_api
- Velocity: mc_velocity_list_versions, mc_velocity_search_api, mc_velocity_get_class, mc_velocity_guide
- Docs: mc_docs_search, mc_docs_get, mc_adventure_search, mc_folia_guide, mc_async_guide, mc_commands_guide, mc_purpur_guide
- Build / API vs NMS: mc_build_guidance, mc_api_vs_nms
- Project: mc_scaffold_project, mc_validate_build_gradle, mc_validate_plugin_yml, mc_template, mc_hangar_search, mc_cache_stats, mc_cache_clear
- NMS: mc_nms_guidance, mc_nms_search, mc_nms_class, mc_remapper_guidance

In-repo Markdown: docs/api-vs-nms.md, docs/async.md, docs/build-guidance.md, docs/commands.md, docs/folia.md, docs/nms.md, docs/purpur.md, docs/velocity.md
`,
        },
      ],
    })
  );

  server.resource(
    "docs-catalog",
    "minecraft://docs/catalog",
    { mimeType: "application/json", description: "Curated docs.papermc.io index" },
    async () => ({
      contents: [
        {
          uri: "minecraft://docs/catalog",
          mimeType: "application/json",
          text: JSON.stringify({ paperMc: DOCS_CATALOG, external: DOCS_CATALOG_EXTERNAL }, null, 2),
        },
      ],
    })
  );

  server.resource(
    "folia-guide",
    "minecraft://guides/folia",
    { mimeType: "text/markdown", description: "Folia region threading guide" },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/folia",
          mimeType: "text/markdown",
          text: await foliaGuidanceMarkdown(),
        },
      ],
    })
  );

  server.resource(
    "async-guide",
    "minecraft://guides/async",
    {
      mimeType: "text/markdown",
      description: "Async / main-thread / performance guide for Paper",
    },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/async",
          mimeType: "text/markdown",
          text: await asyncGuidanceMarkdown(),
        },
      ],
    })
  );
  server.resource(
    "commands-guide",
    "minecraft://guides/commands",
    { mimeType: "text/markdown", description: "Paper commands / Brigadier guide" },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/commands",
          mimeType: "text/markdown",
          text: await commandsGuidanceMarkdown(),
        },
      ],
    })
  );

  server.resource(
    "purpur-guide",
    "minecraft://guides/purpur",
    { mimeType: "text/markdown", description: "Purpur vs Paper API guide" },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/purpur",
          mimeType: "text/markdown",
          text: await purpurGuidanceMarkdown(),
        },
      ],
    })
  );

  server.resource(
    "nms-guide",
    "minecraft://guides/nms",
    { mimeType: "text/markdown", description: "NMS / paperweight guide" },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/nms",
          mimeType: "text/markdown",
          text: await nmsDocMarkdown(),
        },
      ],
    })
  );

  server.resource(
    "build-guide",
    "minecraft://guides/build",
    { mimeType: "text/markdown", description: "Build guidance + API vs NMS" },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/build",
          mimeType: "text/markdown",
          text:
            (await buildGuidanceMarkdown()) +
            "\n\n---\n\n" +
            (await apiVsNmsMarkdown()),
        },
      ],
    })
  );

  server.resource(
    "api-vs-nms",
    "minecraft://guides/api-vs-nms",
    {
      mimeType: "text/markdown",
      description: "Paper API vs NMS decision guide",
    },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/api-vs-nms",
          mimeType: "text/markdown",
          text: await apiVsNmsMarkdown(),
        },
      ],
    })
  );

  server.resource(
    "velocity-guide",
    "minecraft://guides/velocity",
    { mimeType: "text/markdown", description: "Velocity plugin guide" },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/velocity",
          mimeType: "text/markdown",
          text: await velocityGuidanceMarkdown(),
        },
      ],
    })
  );

  server.prompt(
    "new-paper-plugin",
    "Scaffold a new Paper API plugin with correct version pin and threading habits",
    {
      goal: z.string().describe("What the plugin should do"),
      version: z.string().optional().describe("Paper version e.g. 1.21.1"),
    },
    async ({ goal, version }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Create a Paper plugin for: ${goal}
Pinned version hint: ${version ?? "(detect or ask)"}

Required workflow:
1. mc_set_version / mc_detect_version (1.26.x aliases to 26.x)
2. mc_resolve_dependency — paste Gradle coords (not hand-written -R0.1-SNAPSHOT on 26.x)
3. Or mc_scaffold_project for a full tree
4. mc_search_api / mc_lookup_* — do not invent API members
5. mc_async_guide before any HTTP/DB/heavy math (auth: async_secure)
6. mc_commands_guide before commands
Prefer Paper API over NMS (mc_api_vs_nms). Windows Cyrillic paths: build.ps1 / mc_build_guidance.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "needs-nms",
    "Decide if a feature needs NMS or can stay on Paper API",
    {
      feature: z.string().describe("Feature the developer wants"),
    },
    async ({ feature }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Does this need NMS on the pinned Paper version?
Feature: ${feature}

Steps: read mc_api_vs_nms → mc_search_api / mc_get_class → only then mc_nms_search / mc_nms_class.
Default: Paper API.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "offload-async",
    "Plan moving I/O or heavy math off the Paper tick thread",
    {
      work: z.string().describe("Work currently done (or about to be done) on the main thread"),
    },
    async ({ work }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Offload this off the Paper tick/region thread safely:
${work}

Follow mc_async_guide: snapshot → async → re-resolve UUID → batched apply; check isEnabled; no Bukkit from async.
Use mc_template async_io, async_cpu, or async_secure (auth/login). Folia: mc_folia_guide.`,
          },
        },
      ],
    })
  );

  return server;
}
