/** NMS: paperweight guidance and Mojang-named class lookups. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  nmsDocMarkdown,
} from "../guidance.js";
import {
  isPinError,
  resolvePin,
} from "../pin.js";
import {
  getNmsClass,
  remapperGuidanceMarkdown,
  searchNms,
} from "../nms/mappings.js";
import {
  text,
  errorText,
  requireVersion,
  tool,
} from "./shared.js";

export function registerNmsTools(server: McpServer): void {
  tool(
    server,
    "mc_nms_guidance",
    "NMS / paperweight workflow (Mojang mappings). Prefer Paper API — read mc_api_vs_nms first.",
    {
      projectRoot: z.string().optional(),
      version: z.string().optional(),
    },
    async ({ projectRoot, version }) => {
      let v = version;
      if (!v) {
        const pin = await resolvePin({ projectRoot });
        if (!isPinError(pin)) v = pin.minecraftVersion;
      }
      return text(await nmsDocMarkdown(v));
    }
  );

  tool(
    server,
    "mc_remapper_guidance",
    "Paper remapper / userdev multi-version guidance.",
    {},
    async () => text(remapperGuidanceMarkdown())
  );

  tool(
    server,
    "mc_nms_search",
    "Search Mojang-named NMS classes for the pinned project. 26.1+: indexed from the official unobfuscated server.jar (source=server-jar); ≤1.21.11: Mojang mappings.",
    {
      query: z.string().describe("e.g. ServerPlayer, Abilities, ClientboundPlayerAbilitiesPacket"),
      projectRoot: z
        .string()
        .optional()
        .describe("Project root with .mc-sdk.json pin (default: walk up from cwd)"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, projectRoot, limit }) => {
      try {
        const pin = await requireVersion(projectRoot, undefined, undefined, {
          requireFamily: "minecraft",
          tool: "mc_nms_search",
        });
        if ("isError" in pin) return pin;
        return text(await searchNms(pin.minecraftVersion ?? pin.version, query, limit ?? 25));
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  tool(
    server,
    "mc_nms_class",
    "Get NMS class fields/methods (with types) for the pinned project. 26.1+: read from the official server.jar for that exact version; Paper-added members need paperDevBundle.",
    {
      className: z
        .string()
        .describe("Simple or FQCN, e.g. ServerPlayer or net.minecraft.server.level.ServerPlayer"),
      projectRoot: z
        .string()
        .optional()
        .describe("Project root with .mc-sdk.json pin (default: walk up from cwd)"),
      memberQuery: z
        .string()
        .optional()
        .describe("Filter members by name/type substring(s), e.g. 'connection' or 'teleport'"),
      maxMembers: z.number().int().min(10).max(1000).optional().describe("Default 150"),
    },
    async ({ className, projectRoot, memberQuery, maxMembers }) => {
      try {
        const pin = await requireVersion(projectRoot, undefined, undefined, {
          requireFamily: "minecraft",
          tool: "mc_nms_class",
        });
        if ("isError" in pin) return pin;
        const result = await getNmsClass(pin.minecraftVersion ?? pin.version, className);
        const parts = memberQuery?.toLowerCase().split(/[\s|,]+/).filter(Boolean) ?? [];
        const matched = parts.length
          ? result.cls.members.filter((m) => {
              const hay = `${m.mojang} ${m.signature ?? ""}`.toLowerCase();
              return parts.every((p) => hay.includes(p));
            })
          : result.cls.members;
        const cap = maxMembers ?? 150;
        return text({
          requestedVersion: result.requestedVersion,
          mcVersion: result.mcVersion,
          mappingsFallback: result.mappingsFallback,
          unobfuscatedRuntime: result.unobfuscatedRuntime,
          source: result.source,
          mojangName: result.cls.mojangName,
          obfuscated: result.cls.obfuscated,
          hierarchy: result.cls.hierarchy,
          memberCount: result.cls.members.length,
          ...(parts.length ? { memberQuery, matchedCount: matched.length } : {}),
          members: matched.slice(0, cap),
          ...(matched.length > cap
            ? {
                truncated: `${matched.length - cap} more — pass memberQuery or raise maxMembers`,
              }
            : {}),
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
}
