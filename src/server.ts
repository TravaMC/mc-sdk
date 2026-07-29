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
  adventureGuidanceMarkdown,
  buildGuidanceMarkdown,
  commandsGuidanceMarkdown,
  foliaGuidanceMarkdown,
  nmsDocMarkdown,
  paper26GuidanceMarkdown,
  purpurGuidanceMarkdown,
  velocityGuidanceMarkdown,
} from "./guidance.js";
import { explainRuntimeError } from "./hints/runtime.js";
import { findProjectRoot } from "./projectRoot.js";
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
import {
  ASK_USER_FOR_VERSION,
  SERVER_INSTRUCTIONS,
  matchConfirmedDetection,
  versionSourceSchema,
} from "./versionGate.js";

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
  const discovered = await findProjectRoot(projectRoot);
  const root = discovered?.root;

  if (root) {
    const config = await loadProjectConfig(root);
    if (config?.paperVersion || config?.velocityVersion) {
      const resolved = await resolveVersion(root, undefined, platform);
      if (resolved.source === "missing" || !resolved.version) {
        return errorText(ASK_USER_FOR_VERSION);
      }
      if (
        version?.trim() &&
        normalizeGameVersion(version).version !==
          normalizeGameVersion(resolved.version).version
      ) {
        return errorText(
          `Project is pinned to ${resolved.platform} ${resolved.version} (${CONFIG_FILENAME} in ${root}). ` +
            `Do not switch to invented "${version}". If the user wants a different version, ask them, then mc_set_version with versionSource=user_stated.`
        );
      }
      return {
        version: resolved.version,
        platform: resolved.platform,
        config: resolved.config,
        warning: resolved.warning,
        projectRoot: root,
        pinSource: discovered?.source,
      };
    }
  }

  if (version?.trim()) {
    return errorText(
      "Do not pass an invented version= without a project pin. " + ASK_USER_FOR_VERSION
    );
  }

  return errorText(ASK_USER_FOR_VERSION);
}

const platformEnum = z.enum(["paper", "velocity", "folia", "purpur"]);

const PKG = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { name: string; version: string };

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: PKG.name,
      version: PKG.version,
    },
    { instructions: SERVER_INSTRUCTIONS }
  );

  // —— Version / project memory ——
  server.tool(
    "mc_set_version",
    "Pin Paper, Folia, Purpur, or Velocity version after the user stated or confirmed it. Writes .mc-sdk.json and a Cursor rule. NEVER invent a version — ask the user first.",
    {
      projectRoot: z.string().describe("Absolute path to plugin project root"),
      version: z
        .string()
        .describe(
          "Exact version the user stated or confirmed (e.g. 26.2, 1.21.1). Alias: 1.26.2 → 26.2. Velocity: 3.4.0 / latest. Do not invent."
        ),
      versionSource: versionSourceSchema,
      platform: platformEnum
        .optional()
        .describe("Target platform (default paper) — ask the user if unknown"),
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
      versionSource,
      platform,
      notes,
      folia,
      nms,
      minecraftVersion,
      allowUnavailable,
    }) => {
      void versionSource;
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
    "Read pinned project config (.mc-sdk.json). Uses projectRoot or walks cwd parents. If missing, ask the user for version — do not invent one.",
    { projectRoot: z.string().optional() },
    async ({ projectRoot }) => {
      const discovered = await findProjectRoot(projectRoot);
      if (!discovered) {
        return errorText(ASK_USER_FOR_VERSION);
      }
      const config = await loadProjectConfig(discovered.root);
      if (!config) {
        return errorText(ASK_USER_FOR_VERSION);
      }
      return text({
        ...config,
        projectRoot: discovered.root,
        pinSource: discovered.source,
      });
    }
  );

  server.tool(
    "mc_detect_version",
    "Detect Paper/Folia/Purpur/Velocity version hints from Gradle/Maven/plugin.yml. Shows candidates only — pin=true requires the user to confirm an exact version first.",
    {
      projectRoot: z.string(),
      pin: z
        .boolean()
        .optional()
        .describe(
          "Only after the user confirmed a detected version. Requires userConfirmedVersion."
        ),
      userConfirmedVersion: z
        .string()
        .optional()
        .describe(
          "When pin=true: exact version string the user confirmed (must match a detected hit)"
        ),
      folia: z
        .boolean()
        .optional()
        .describe("Force Folia flag when pinning a Paper hit"),
    },
    async ({ projectRoot, pin, userConfirmedVersion, folia }) => {
      const detected = await detectVersionFromProject(projectRoot);
      if (!detected.length) {
        return errorText(
          "No version found in build files. " + ASK_USER_FOR_VERSION
        );
      }
      let pinned = null;
      if (pin) {
        const match = matchConfirmedDetection(detected, userConfirmedVersion);
        if (!match.ok) {
          return errorText(match.message);
        }
        const best = match.hit;
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
      return text({
        detected,
        pinned,
        best: pickBestDetection(detected),
        note: pin
          ? undefined
          : "Do not pin yet. Show these candidates to the user and ask which version/platform to use.",
      });
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
    "Search Paper/Folia/Purpur/Velocity Javadocs. Event hits include deprecated/prefer/usageNote; warnings[] lists traps (e.g. prefer AsyncPlayerSpawnLocationEvent).",
    {
      query: z.string(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      platform: platformEnum.optional(),
      scope: z.enum(["all", "types", "members", "packages"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      deprecated: z
        .enum(["include", "exclude", "only"])
        .optional()
        .describe(
          "Type filter: include (default, non-deprecated sorted first), exclude deprecated types, or only deprecated"
        ),
    },
    async ({ query, projectRoot, version, platform, scope, limit, deprecated }) => {
      const v = await requireVersion(projectRoot, version, platform);
      if ("isError" in v) return v;
      try {
        const jdVer = javadocSearchVersion(v.platform, v.version);
        const results = await searchApi(jdVer, query, {
          scope,
          limit,
          platform: v.platform,
          deprecated,
          enrichAnnotations: true,
        });
        const runtimeHints = explainRuntimeError(query, 3);
        const empty =
          results.types.length + results.members.length + results.packages.length === 0;
        return text({
          platform: v.platform,
          version: v.version,
          javadocVersion: jdVer || "root",
          projectRoot: "projectRoot" in v ? v.projectRoot : undefined,
          pinSource: "pinSource" in v ? v.pinSource : undefined,
          query,
          deprecatedMode: deprecated ?? "include",
          ...results,
          ...(runtimeHints.matches.length
            ? {
                runtimeHints: runtimeHints.matches,
                runtimeHintsNote:
                  empty
                    ? "Javadoc index had no hits; curated runtimeHints may apply (exception text is not indexed)."
                    : "Also matched curated runtimeHints — useful for exception-like queries.",
              }
            : empty
              ? {
                  tip: "Empty JD search. If this is a stack trace / exception message, call mc_explain_error. For World time on 26.x: mc_paper26_guide + mc_get_class memberQuery=isFixedTime.",
                }
              : {}),
        });
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_get_class",
    "Fetch API class summary. @Deprecated / prefer / usageNote are shown first when present. For huge types (World), pass memberQuery.",
    {
      className: z.string(),
      packageName: z.string().optional(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      platform: platformEnum.optional(),
      includeAllEnumConstants: z.boolean().optional(),
      maxMethods: z.number().int().min(10).max(800).optional(),
      memberQuery: z
        .string()
        .optional()
        .describe(
          "Filter members by name/signature/description (e.g. isFixedTime, setTime, world clock). Preferred for World and other large classes."
        ),
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
            memberQuery: args.memberQuery,
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
    "Find Bukkit/Paper event classes for a scenario. Prefers Paper/async events; surfaces deprecated + prefer (e.g. AsyncPlayerSpawnLocationEvent over Spigot PlayerSpawnLocationEvent).",
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
    "Search Adventure API Javadocs (Component, Audience, MiniMessage). Prefer over Bungee legacy chat — see mc_adventure_guide.",
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
    "mc_adventure_guide",
    "Adventure Component/Audience/MiniMessage rules for Paper and Velocity. Bans Bungee legacy chat; LimboAPI must use Component too.",
    {},
    async () => text(await adventureGuidanceMarkdown())
  );

  server.tool(
    "mc_paper26_guide",
    "Paper/Purpur 26.x breakages: world clock, setTime/isFixedTime, gamerules, spawn notes. Use with mc_explain_error for exception text.",
    {},
    async () => text(await paper26GuidanceMarkdown())
  );

  server.tool(
    "mc_explain_error",
    "Map Paper/Purpur runtime exception text (e.g. Cannot set time without a world clock) to API guidance. Javadoc search does not index exception strings.",
    {
      errorText: z
        .string()
        .describe("Full exception message or fragment from server log / stack trace"),
      limit: z.number().int().min(1).max(10).optional(),
    },
    async ({ errorText: err, limit }) => text(explainRuntimeError(err, limit ?? 5))
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
          "mc_paper26_guide",
          "mc_explain_error",
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
    "Velocity proxy plugins: setup, Adventure text (not legacy), LimboAPI notes, Javadoc links.",
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
      try {
        const ver = v.version === "latest" ? "" : v.version;
        const results = await searchApi(ver, query, {
          scope,
          limit,
          platform: "velocity",
        });
        return text({
          platform: "velocity",
          version: v.version,
          query,
          ...results,
        });
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
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
    "Generate starter snippets from the pinned project version. Ask the user and mc_set_version first if unpinned.",
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
      projectRoot: z
        .string()
        .describe("Plugin project root with .mc-sdk.json pin"),
      folia: z.boolean().optional(),
      nms: z.boolean().optional(),
    },
    async (args) => {
      const cfg = await loadProjectConfig(args.projectRoot);
      if (!cfg?.paperVersion && !cfg?.velocityVersion) {
        return errorText(ASK_USER_FOR_VERSION);
      }
      const version =
        cfg.platform === "velocity"
          ? cfg.velocityVersion ?? cfg.paperVersion
          : cfg.paperVersion;
      const folia = args.folia ?? cfg.folia;
      const nms = args.nms ?? cfg.nms;
      const rendered = renderTemplate(args.kind as TemplateKind, {
        packageName: args.packageName,
        className: args.className,
        pluginName: args.pluginName,
        version,
        folia,
        nms,
      });
      return text(rendered);
    }
  );

  server.tool(
    "mc_resolve_dependency",
    "Resolve Gradle coords for the pinned project version (or after user-stated pin). Never invent a version.",
    {
      version: z
        .string()
        .optional()
        .describe("Only with versionSource after user stated it; prefer projectRoot pin"),
      versionSource: versionSourceSchema.optional(),
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
      projectRoot: z.string().optional().describe("Use pinned .mc-sdk.json version"),
    },
    async ({
      version,
      versionSource,
      platform,
      preferStable,
      allowPaperFallback,
      nms: nmsArg,
      projectRoot,
    }) => {
      try {
        let ver = "";
        let plat: Platform = platform ?? "paper";
        let nms = nmsArg;
        if (projectRoot) {
          const cfg = await loadProjectConfig(projectRoot);
          if (cfg?.paperVersion || cfg?.velocityVersion) {
            ver =
              cfg.platform === "velocity"
                ? cfg.velocityVersion ?? cfg.paperVersion
                : cfg.paperVersion;
            plat = platform ?? cfg.platform ?? "paper";
            if (nms === undefined && cfg.nms) nms = true;
          }
        }
        if (!ver && version?.trim() && versionSource) {
          ver = normalizeGameVersion(version).version;
          plat = platform ?? "paper";
        }
        if (!ver) {
          return errorText(ASK_USER_FOR_VERSION);
        }
        const result = await resolveDependency({
          version: ver,
          platform: plat,
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
    "Write a full plugin scaffold. Version must be user-stated or user-confirmed — never invent one.",
    {
      projectRoot: z.string().describe("Absolute path for the new/empty project root"),
      version: z
        .string()
        .describe("Exact version the user stated or confirmed — do not invent"),
      versionSource: versionSourceSchema,
      platform: platformEnum.optional(),
      packageName: z.string().optional(),
      className: z.string().optional(),
      pluginName: z.string().optional(),
      pin: z.boolean().optional().describe("Also write .mc-sdk.json (default true)"),
    },
    async ({
      projectRoot,
      version,
      versionSource,
      platform,
      packageName,
      className,
      pluginName,
      pin,
    }) => {
      void versionSource;
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
    "Search Mojang-mapped NMS class names for the pinned project. For 26.1+ falls back to 1.21.11 with warning.",
    {
      query: z.string().describe("e.g. ServerPlayer, Abilities, ClientboundPlayerAbilitiesPacket"),
      projectRoot: z.string().describe("Project root with .mc-sdk.json pin"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, projectRoot, limit }) => {
      try {
        const cfg = await loadProjectConfig(projectRoot);
        const ver = cfg?.minecraftVersion ?? cfg?.paperVersion;
        if (!ver) return errorText(ASK_USER_FOR_VERSION);
        return text(await searchNms(ver, query, limit ?? 25));
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "mc_nms_class",
    "Get NMS class fields/methods for the pinned project. 26.1+ falls back to nearest mapped version with warning.",
    {
      className: z
        .string()
        .describe("Simple or FQCN, e.g. ServerPlayer or net.minecraft.server.level.ServerPlayer"),
      projectRoot: z.string().describe("Project root with .mc-sdk.json pin"),
    },
    async ({ className, projectRoot }) => {
      try {
        const cfg = await loadProjectConfig(projectRoot);
        const ver = cfg?.minecraftVersion ?? cfg?.paperVersion;
        if (!ver) return errorText(ASK_USER_FOR_VERSION);
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

Tools use the \`mc_\` prefix.

## HARD RULE
Never invent Paper/MC/Velocity version. If the user did not state one and \`.mc-sdk.json\` is missing: **ask them**. Then \`mc_set_version\` with \`versionSource=user_stated\` (or detect → user confirms → \`user_confirmed_detection\`).

Alias: \`1.26.2\` → \`26.2\` (with warning). Prefer \`mc_resolve_dependency\` for Gradle coords.

## Categories
- Version: mc_set_version, mc_get_config, mc_detect_version, mc_list_versions, mc_paper_builds, mc_resolve_dependency
- Paper/Folia API: mc_search_api, mc_get_class, mc_lookup_*, mc_find_event, mc_diff_api
- Velocity: mc_velocity_list_versions, mc_velocity_search_api, mc_velocity_get_class, mc_velocity_guide
- Docs: mc_docs_search, mc_docs_get, mc_adventure_guide, mc_adventure_search, mc_paper26_guide, mc_explain_error, mc_folia_guide, mc_async_guide, mc_commands_guide, mc_purpur_guide
- Build / API vs NMS: mc_build_guidance, mc_api_vs_nms
- Project: mc_scaffold_project, mc_validate_build_gradle, mc_validate_plugin_yml, mc_template, mc_hangar_search, mc_cache_stats, mc_cache_clear
- NMS: mc_nms_guidance, mc_nms_search, mc_nms_class, mc_remapper_guidance

In-repo Markdown: docs/adventure.md, docs/api-vs-nms.md, docs/async.md, docs/build-guidance.md, docs/commands.md, docs/folia.md, docs/nms.md, docs/paper-26.md, docs/purpur.md, docs/velocity.md
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

  server.resource(
    "adventure-guide",
    "minecraft://guides/adventure",
    {
      mimeType: "text/markdown",
      description: "Adventure Component API — Paper + Velocity (no Bungee legacy)",
    },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/adventure",
          mimeType: "text/markdown",
          text: await adventureGuidanceMarkdown(),
        },
      ],
    })
  );

  server.resource(
    "paper-26-guide",
    "minecraft://guides/paper-26",
    {
      mimeType: "text/markdown",
      description: "Paper/Purpur 26.x world clock and related breakages",
    },
    async () => ({
      contents: [
        {
          uri: "minecraft://guides/paper-26",
          mimeType: "text/markdown",
          text: await paper26GuidanceMarkdown(),
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
Pinned version: ${version ?? "(UNKNOWN — ask the user before any pin/scaffold; never invent)"}

Required workflow:
1. If version unknown: ASK the user (platform + version). Do not guess 1.21.x / 26.x / latest.
2. mc_set_version with versionSource=user_stated (or detect → user confirms → user_confirmed_detection). Alias 1.26.x → 26.x
3. mc_resolve_dependency — paste Gradle coords (not hand-written -R0.1-SNAPSHOT on 26.x)
4. Or mc_scaffold_project with the same versionSource
5. mc_search_api / mc_lookup_* — do not invent API members
6. mc_async_guide before any HTTP/DB/heavy math (auth: async_secure)
7. mc_commands_guide before commands
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
