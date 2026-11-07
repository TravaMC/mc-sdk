/** Project files: templates, Gradle dependency/scaffold/validation, plugin.yml, Hangar, cache. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  loadProjectConfig,
  pinnedVersion,
  saveProjectConfig,
  type Platform,
} from "../config.js";
import {
  searchHangar,
} from "../hangar.js";
import {
  isPinError,
  resolvePin,
} from "../pin.js";
import {
  clearCache,
  getCacheStats,
  pruneCache,
} from "../cache.js";
import {
  pluginYmlSchemaHelp,
  validatePluginYml,
} from "../schemas/pluginYml.js";
import {
  renderTemplate,
  type TemplateKind,
} from "../templates.js";
import {
  resolveDependency,
} from "../deps/resolve.js";
import {
  scaffoldProject,
} from "../scaffold.js";
import {
  validateBuildGradle,
} from "../validateBuild.js";
import {
  normalizeGameVersion,
} from "../versioning.js";
import {
  ASK_USER_FOR_VERSION,
  versionSourceSchema,
} from "../versionGate.js";
import {
  text,
  errorText,
  requireVersion,
  platformEnum,
  PKG,
  tool,
} from "./shared.js";

export function registerProjectTools(server: McpServer): void {
  tool(
    server,
    "mc_validate_plugin_yml",
    "Validate plugin.yml or paper-plugin.yml content and return issues.",
    {
      content: z.string().describe("Full YAML file contents"),
    },
    async ({ content }) => text(validatePluginYml(content))
  );

  tool(
    server,
    "mc_plugin_yml_schema",
    "Show plugin.yml / paper-plugin.yml field help.",
    {},
    async () => text(pluginYmlSchemaHelp())
  );

  tool(
    server,
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
        .optional()
        .describe("Plugin project root with .mc-sdk.json pin (default: walk up from cwd)"),
      folia: z.boolean().optional(),
      nms: z.boolean().optional(),
    },
    async (args) => {
      const pin = await requireVersion(args.projectRoot);
      if ("isError" in pin) return pin;
      const version = pin.version;
      const folia = args.folia ?? pin.config.folia;
      const nms = args.nms ?? pin.config.nms;
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

  tool(
    server,
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
      projectRoot: z
        .string()
        .optional()
        .describe("Use pinned .mc-sdk.json version (default: walk up from cwd when no version is given)"),
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
        // Order: explicit projectRoot pin → user-stated version → pin found from cwd.
        const userStated = Boolean(version?.trim() && versionSource);
        if (projectRoot || !userStated) {
          const pin = await resolvePin({ projectRoot, platform });
          if (!isPinError(pin)) {
            ver = pin.version;
            plat = pin.platform;
            if (nms === undefined && pin.config.nms) nms = true;
          } else if (projectRoot) {
            return errorText(pin.error);
          }
        }
        if (!ver && userStated && version) {
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

  tool(
    server,
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
        if (pin !== false) {
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
            `Add Gradle wrapper if missing: gradle wrapper --gradle-version ${result.gradleVersion}`,
            "Windows non-ASCII path: .\\build.ps1",
            "Otherwise: ./gradlew build",
          ],
        });
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  tool(
    server,
    "mc_validate_build_gradle",
    "Pre-build check: coords, Java, api-version, 1.26.x mistake, reobfJar on 26.1+, Gradle wrapper vs paperweight-userdev requirement, velocity-api 4.x Java 25.",
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
        expected = expected ?? (cfg ? pinnedVersion(cfg) : undefined);
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

  tool(
    server,
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

  tool(
    server,
    "mc_cache_stats",
    "HTTP/Javadoc cache stats + sdkPackageVersion (use this to verify MCP reloaded). Fast — does not wait on network.",
    {},
    async () => {
      // Never await prune here — a stuck previous network call already freezes the MCP;
      // prune is opportunistic and must not delay the health check.
      void pruneCache().catch(() => undefined);
      const stats = await getCacheStats();
      return text({
        ...stats,
        bytesHuman: `${(stats.bytes / (1024 * 1024)).toFixed(2)} MiB`,
        sdkPackageVersion: PKG.version,
        serverName: PKG.name,
        toolsHighlight: [
          "mc_resolve_dependency",
          "mc_scaffold_project",
          "mc_validate_build_gradle",
          "mc_paper26_guide",
          "mc_explain_error",
        ],
        note: "If sdkPackageVersion is stale or tools hang: kill stuck node MCP processes and toggle the server Off→On (full Cursor restart if needed). HTTP fetches time out after 15s.",
      });
    }
  );

  tool(
    server,
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
}
