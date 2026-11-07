/** MCP resources: overview, docs catalog, and every bundled guide (one table, no copy-paste). */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DOCS_CATALOG, DOCS_CATALOG_EXTERNAL } from "./docs/papermc.js";
import {
  adventureGuidanceMarkdown,
  apiVsNmsMarkdown,
  asyncGuidanceMarkdown,
  buildGuidanceMarkdown,
  commandsGuidanceMarkdown,
  foliaGuidanceMarkdown,
  nmsDocMarkdown,
  paper26GuidanceMarkdown,
  purpurGuidanceMarkdown,
  velocityGuidanceMarkdown,
} from "./guidance.js";

const OVERVIEW = `# mc-sdk

Tools use the \`mc_\` prefix.

## HARD RULE
Never invent Paper/MC/Velocity version. If the user did not state one and \`.mc-sdk.json\` is missing: **ask them**. Then \`mc_set_version\` with \`versionSource=user_stated\` (or detect → user confirms → \`user_confirmed_detection\`).

Alias: \`1.26.3\` → \`26.3\` (with warning). Prefer \`mc_resolve_dependency\` for Gradle coords.
Tools find the pin from \`projectRoot\` or by walking up from the MCP working directory.

## Categories
- Version: mc_set_version, mc_get_config, mc_detect_version, mc_list_versions, mc_paper_builds, mc_resolve_dependency
- Paper/Folia/Purpur API: mc_search_api, mc_get_class, mc_lookup_*, mc_find_event, mc_diff_api
- Velocity: mc_velocity_list_versions, mc_velocity_search_api, mc_velocity_get_class, mc_velocity_guide
- Docs: mc_docs_search, mc_docs_get, mc_adventure_guide, mc_adventure_search, mc_paper26_guide, mc_explain_error, mc_folia_guide, mc_async_guide, mc_commands_guide, mc_purpur_guide
- Build / API vs NMS: mc_build_guidance, mc_api_vs_nms
- Project: mc_scaffold_project, mc_validate_build_gradle, mc_validate_plugin_yml, mc_template, mc_hangar_search, mc_cache_stats, mc_cache_clear
- NMS: mc_nms_guidance, mc_nms_search, mc_nms_class, mc_remapper_guidance

In-repo Markdown: docs/adventure.md, docs/api-vs-nms.md, docs/async.md, docs/build-guidance.md, docs/commands.md, docs/folia.md, docs/nms.md, docs/paper-26.md, docs/purpur.md, docs/velocity.md
`;

interface ResourceDef {
  name: string;
  uri: string;
  description: string;
  mimeType: "text/markdown" | "application/json";
  load: () => string | Promise<string>;
}

export const RESOURCES: ResourceDef[] = [
  { name: "sdk-overview", uri: "minecraft://sdk/overview", description: "mc-sdk overview", mimeType: "text/markdown", load: () => OVERVIEW },
  {
    name: "docs-catalog",
    uri: "minecraft://docs/catalog",
    description: "Curated docs.papermc.io index",
    mimeType: "application/json",
    load: () => JSON.stringify({ paperMc: DOCS_CATALOG, external: DOCS_CATALOG_EXTERNAL }, null, 2),
  },
  { name: "folia-guide", uri: "minecraft://guides/folia", description: "Folia region threading guide", mimeType: "text/markdown", load: foliaGuidanceMarkdown },
  { name: "async-guide", uri: "minecraft://guides/async", description: "Async / main-thread / performance guide for Paper", mimeType: "text/markdown", load: asyncGuidanceMarkdown },
  { name: "commands-guide", uri: "minecraft://guides/commands", description: "Paper commands / Brigadier guide", mimeType: "text/markdown", load: commandsGuidanceMarkdown },
  { name: "purpur-guide", uri: "minecraft://guides/purpur", description: "Purpur vs Paper API guide", mimeType: "text/markdown", load: purpurGuidanceMarkdown },
  { name: "nms-guide", uri: "minecraft://guides/nms", description: "NMS / paperweight guide", mimeType: "text/markdown", load: () => nmsDocMarkdown() },
  {
    name: "build-guide",
    uri: "minecraft://guides/build",
    description: "Build guidance + API vs NMS",
    mimeType: "text/markdown",
    load: async () => `${await buildGuidanceMarkdown()}\n\n---\n\n${await apiVsNmsMarkdown()}`,
  },
  { name: "api-vs-nms", uri: "minecraft://guides/api-vs-nms", description: "Paper API vs NMS decision guide", mimeType: "text/markdown", load: apiVsNmsMarkdown },
  { name: "velocity-guide", uri: "minecraft://guides/velocity", description: "Velocity plugin guide", mimeType: "text/markdown", load: velocityGuidanceMarkdown },
  { name: "adventure-guide", uri: "minecraft://guides/adventure", description: "Adventure Component API — Paper + Velocity (no Bungee legacy)", mimeType: "text/markdown", load: adventureGuidanceMarkdown },
  { name: "paper-26-guide", uri: "minecraft://guides/paper-26", description: "Paper/Purpur 26.x changes (26.1 → 26.3), world clock", mimeType: "text/markdown", load: paper26GuidanceMarkdown },
];

export function registerResources(server: McpServer): void {
  for (const r of RESOURCES) {
    server.registerResource(
      r.name,
      r.uri,
      { mimeType: r.mimeType, description: r.description },
      async () => ({ contents: [{ uri: r.uri, mimeType: r.mimeType, text: await r.load() }] })
    );
  }
}
