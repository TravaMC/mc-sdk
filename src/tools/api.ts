/** Paper/Folia/Purpur Javadoc lookups: search, classes, enums/registries, events, API diff. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diffApiVersions } from "../diff.js";
import { findEventsByScenario } from "../events.js";
import { explainRuntimeError } from "../hints/runtime.js";
import { resolveJavadocPath } from "../javadoc/available.js";
import {
  describeBuiltinEnums,
  listEnumConstants,
  resolveEnumTarget,
  searchEnumConstants,
  type BuiltinEnumKind,
} from "../javadoc/enums.js";
import { formatClassDoc, fetchClassDoc } from "../javadoc/parse.js";
import { searchApi } from "../javadoc/search.js";
import { normalizeGameVersion } from "../versioning.js";
import { platformEnum, requirePaperJd, requireVersion, text, tool } from "./shared.js";

const lookupArgs = {
  query: z.string().optional(),
  projectRoot: z.string().optional(),
  version: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  listAll: z.boolean().optional(),
};

/** Shared body of mc_lookup_material / _entity / _registry / _enum. */
async function lookupConstants(
  tool: string,
  args: {
    query?: string;
    projectRoot?: string;
    version?: string;
    limit?: number;
    listAll?: boolean;
  },
  target: { package: string; className: string },
  extra?: Record<string, unknown>
) {
  const v = await requirePaperJd(args.projectRoot, args.version, tool);
  if ("isError" in v) return v;
  const type = `${target.package}.${target.className}`;
  const jd = v.javadocWarning ? { javadocVersion: v.jdVersion, javadocWarning: v.javadocWarning } : {};
  if (args.listAll && !args.query) {
    const all = await listEnumConstants(v.jdVersion, target.package, target.className);
    return text({ version: v.version, type, count: all.length, values: all, ...jd, ...extra });
  }
  const hits = await searchEnumConstants(
    v.jdVersion,
    target.package,
    target.className,
    args.query ?? "",
    args.limit ?? 50
  );
  return text({
    version: v.version,
    type,
    values: hits.map((h) => h.name),
    urls: hits.slice(0, 15).map((h) => h.url),
    ...jd,
    ...extra,
  });
}

export function registerApiTools(server: McpServer): void {
  tool(
    server,
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
      const jd = await resolveJavadocPath(v.platform, v.version);
      const results = await searchApi(jd.jdVersion, query, {
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
        javadocVersion: jd.jdVersion || "root",
        ...(jd.warning ? { javadocWarning: jd.warning } : {}),
        projectRoot: v.projectRoot,
        pinSource: v.pinSource,
        query,
        deprecatedMode: deprecated ?? "include",
        ...results,
        ...(runtimeHints.matches.length
          ? {
              runtimeHints: runtimeHints.matches,
              runtimeHintsNote: empty
                ? "Javadoc index had no hits; curated runtimeHints may apply (exception text is not indexed)."
                : "Also matched curated runtimeHints — useful for exception-like queries.",
            }
          : empty
            ? {
                tip: "Empty JD search. If this is a stack trace / exception message, call mc_explain_error. For World time on 26.x: mc_paper26_guide + mc_get_class memberQuery=isFixedTime.",
              }
            : {}),
      });
    }
  );

  tool(
    server,
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
      const jd = await resolveJavadocPath(v.platform, v.version);
      const doc = await fetchClassDoc(jd.jdVersion, args.className, args.packageName, v.platform);
      const body = formatClassDoc(doc, {
        includeEnumConstants: args.includeAllEnumConstants,
        maxMethods: args.maxMethods,
        memberQuery: args.memberQuery,
      });
      return text(jd.warning ? `> ⚠ ${jd.warning}\n\n${body}` : body);
    }
  );

  tool(
    server,
    "mc_lookup_material",
    "Search Material constants (blocks/items) for the target Paper version.",
    lookupArgs,
    async (args) => lookupConstants("mc_lookup_material", args, resolveEnumTarget("material"))
  );

  tool(
    server,
    "mc_lookup_entity",
    "Search EntityType constants for the target Paper version.",
    lookupArgs,
    async (args) => lookupConstants("mc_lookup_entity", args, resolveEnumTarget("entity"))
  );

  tool(
    server,
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
      packageName: z.string().optional(),
      className: z.string().optional(),
      ...lookupArgs,
    },
    async (args) =>
      lookupConstants(
        "mc_lookup_enum",
        args,
        resolveEnumTarget(args.kind as BuiltinEnumKind, args.packageName, args.className),
        args.listAll && !args.query ? { builtins: describeBuiltinEnums() } : undefined
      )
  );

  tool(
    server,
    "mc_lookup_registry",
    "Modern registry API lookup — ItemType / BlockType (prefer over Material when available).",
    { kind: z.enum(["item_type", "block_type"]), ...lookupArgs },
    async (args) =>
      lookupConstants("mc_lookup_registry", args, resolveEnumTarget(args.kind), {
        note: "Prefer registry types over Material for new code when on modern Paper.",
      })
  );

  tool(
    server,
    "mc_find_event",
    "Find Bukkit/Paper event classes for a scenario (e.g. 'player swings arm', 'block broken by explosion'). Deprecated events sort last with prefer (e.g. AsyncPlayerSpawnLocationEvent over Spigot PlayerSpawnLocationEvent).",
    {
      scenario: z.string(),
      projectRoot: z.string().optional(),
      version: z.string().optional(),
      limit: z.number().int().min(1).max(40).optional(),
    },
    async ({ scenario, projectRoot, version, limit }) => {
      const v = await requirePaperJd(projectRoot, version, "mc_find_event");
      if ("isError" in v) return v;
      const found = await findEventsByScenario(v.jdVersion, scenario, limit ?? 15);
      return text({
        ...found,
        version: v.version,
        javadocVersion: v.jdVersion,
        ...(v.javadocWarning ? { javadocWarning: v.javadocWarning } : {}),
      });
    }
  );

  tool(
    server,
    "mc_diff_api",
    "Diff Paper API type indexes between two versions (added/removed types). Accepts 1.26.x aliases.",
    {
      fromVersion: z.string(),
      toVersion: z.string(),
      packagePrefix: z.string().optional().describe("e.g. org.bukkit.event"),
      limit: z.number().int().min(10).max(200).optional(),
    },
    async ({ fromVersion, toVersion, packagePrefix, limit }) =>
      text(
        await diffApiVersions(
          normalizeGameVersion(fromVersion).version,
          normalizeGameVersion(toVersion).version,
          { packagePrefix, limit }
        )
      )
  );
}
