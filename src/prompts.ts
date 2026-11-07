/** Prompt templates (new plugin, NMS decision, async offload). */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PromptCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type PromptArgs = Record<string, z.ZodType<string | undefined>>;

/** registerPrompt adapter (server.prompt is deprecated). */
function prompt<A extends PromptArgs>(
  server: McpServer,
  name: string,
  description: string,
  argsSchema: A,
  cb: PromptCallback<A>
): void {
  server.registerPrompt(name, { description, argsSchema }, cb);
}

export function registerPrompts(server: McpServer): void {
  prompt(
    server,
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

  prompt(
    server,
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

  prompt(
    server,
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
}
