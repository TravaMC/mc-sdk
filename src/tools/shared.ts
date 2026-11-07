/**
 * Shared plumbing for the tool modules: result helpers, pin helpers, and the single
 * registration adapter that attaches titles + MCP tool annotations to every tool.
 */
import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Platform } from "../config.js";
import { resolveJavadocPath } from "../javadoc/available.js";
import { isPinError, resolvePin, type PlatformFamily } from "../pin.js";

export { PKG } from "../meta.js";

export function text(data: unknown) {
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text: body }] };
}

export function errorText(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

export const platformEnum = z.enum(["paper", "velocity", "folia", "purpur"]);

/** Pin lookup for tool handlers: ResolvedPin, or an MCP error result to return as-is. */
export async function requireVersion(
  projectRoot: string | undefined,
  version?: string,
  platform?: Platform,
  options?: { requireFamily?: PlatformFamily; tool?: string }
) {
  const pin = await resolvePin({
    projectRoot,
    version,
    platform,
    requireFamily: options?.requireFamily,
    tool: options?.tool,
  });
  if (isPinError(pin)) return errorText(pin.error);
  return pin;
}

/** Minecraft-family pin + the Paper Javadoc tree to use for enum/event lookups. */
export async function requirePaperJd(
  projectRoot: string | undefined,
  version: string | undefined,
  tool: string
) {
  const v = await requireVersion(projectRoot, version, undefined, {
    requireFamily: "minecraft",
    tool,
  });
  if ("isError" in v) return v;
  // Folia/Purpur pins share Paper's version line; their Paper JD may lag a fresh release.
  const jd = await resolveJavadocPath("paper", v.version);
  return { ...v, jdVersion: jd.jdVersion, javadocWarning: jd.warning };
}

// —— annotations ——

/** Local-only lookups (config, bundled guides, validators). */
const LOCAL_READ: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};
/** Read-only lookups against public endpoints (Javadoc, Fill, Maven, Mojang, Hangar, docs). */
const NET_READ: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

/** Title + annotations per tool. Every registered tool must have an entry (checked in tests). */
export const TOOL_META: Record<string, { title: string; annotations: ToolAnnotations }> = {
  // version / project memory
  mc_set_version: {
    title: "Pin platform + version",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  mc_get_config: { title: "Read project pin", annotations: LOCAL_READ },
  mc_detect_version: {
    title: "Detect version from build files",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  mc_list_versions: { title: "List Paper/Folia/Purpur versions", annotations: NET_READ },
  mc_paper_builds: { title: "Paper builds (Fill)", annotations: NET_READ },
  // API lookups
  mc_search_api: { title: "Search Javadocs", annotations: NET_READ },
  mc_get_class: { title: "Get class from Javadocs", annotations: NET_READ },
  mc_lookup_material: { title: "Look up Material", annotations: NET_READ },
  mc_lookup_entity: { title: "Look up EntityType", annotations: NET_READ },
  mc_lookup_enum: { title: "Look up enum / registry constants", annotations: NET_READ },
  mc_lookup_registry: { title: "Look up ItemType / BlockType", annotations: NET_READ },
  mc_find_event: { title: "Find event for a scenario", annotations: NET_READ },
  mc_diff_api: { title: "Diff Paper API between versions", annotations: NET_READ },
  // docs & guides
  mc_docs_search: { title: "Search PaperMC docs catalog", annotations: LOCAL_READ },
  mc_docs_get: { title: "Read a documentation page", annotations: NET_READ },
  mc_adventure_search: { title: "Search Adventure Javadocs", annotations: NET_READ },
  mc_adventure_guide: { title: "Adventure text guide", annotations: LOCAL_READ },
  mc_paper26_guide: { title: "Paper 26.x changes guide", annotations: LOCAL_READ },
  mc_explain_error: { title: "Explain a runtime error", annotations: LOCAL_READ },
  mc_folia_guide: { title: "Folia threading guide", annotations: LOCAL_READ },
  mc_async_guide: { title: "Async / main-thread guide", annotations: LOCAL_READ },
  mc_commands_guide: { title: "Commands guide", annotations: LOCAL_READ },
  mc_purpur_guide: { title: "Purpur guide", annotations: LOCAL_READ },
  mc_build_guidance: { title: "Build / toolchain guide", annotations: LOCAL_READ },
  mc_api_vs_nms: { title: "Paper API vs NMS guide", annotations: LOCAL_READ },
  mc_velocity_guide: { title: "Velocity guide", annotations: LOCAL_READ },
  // velocity
  mc_velocity_list_versions: { title: "List Velocity versions", annotations: NET_READ },
  mc_velocity_search_api: { title: "Search Velocity Javadocs", annotations: NET_READ },
  mc_velocity_get_class: { title: "Get Velocity class", annotations: NET_READ },
  // project
  mc_validate_plugin_yml: { title: "Validate plugin.yml", annotations: LOCAL_READ },
  mc_plugin_yml_schema: { title: "plugin.yml field help", annotations: LOCAL_READ },
  mc_template: { title: "Render code template", annotations: LOCAL_READ },
  mc_resolve_dependency: { title: "Resolve Gradle dependency", annotations: NET_READ },
  mc_scaffold_project: {
    title: "Scaffold plugin project",
    // writes build files into projectRoot (overwrites same-named files)
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  mc_validate_build_gradle: { title: "Validate Gradle build", annotations: LOCAL_READ },
  mc_hangar_search: { title: "Search Hangar plugins", annotations: NET_READ },
  mc_cache_stats: { title: "Cache stats / SDK version", annotations: LOCAL_READ },
  mc_cache_clear: {
    title: "Clear HTTP cache",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  // nms
  mc_nms_guidance: { title: "NMS / paperweight guide", annotations: LOCAL_READ },
  mc_remapper_guidance: { title: "Remapper / userdev notes", annotations: LOCAL_READ },
  mc_nms_search: { title: "Search NMS classes", annotations: NET_READ },
  mc_nms_class: { title: "Get NMS class members", annotations: NET_READ },
};

/**
 * Register a tool through registerTool (the non-deprecated SDK API) with its title and
 * annotations from TOOL_META. Thrown errors become MCP error results instead of protocol errors.
 */
export function tool<Shape extends ZodRawShapeCompat>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  cb: ToolCallback<Shape>
): void {
  const meta = TOOL_META[name];
  if (!meta) throw new Error(`TOOL_META is missing ${name}`);
  const handler = (async (args: unknown, extra: unknown) => {
    try {
      return await (cb as (a: unknown, e: unknown) => Promise<CallToolResult> | CallToolResult)(
        args,
        extra
      );
    } catch (e) {
      return errorText(e instanceof Error ? e.message : String(e));
    }
  }) as unknown as ToolCallback<Shape>;
  server.registerTool(
    name,
    { title: meta.title, description, inputSchema, annotations: meta.annotations },
    handler
  );
}

/** Zero-argument tool that returns a Markdown guide. */
export function guideTool(
  server: McpServer,
  name: string,
  description: string,
  load: () => string | Promise<string>
): void {
  tool(server, name, description, {}, async () => text(await load()));
}
