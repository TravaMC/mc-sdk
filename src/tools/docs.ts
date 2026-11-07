/** PaperMC docs, Adventure, and the bundled Markdown guides. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DOCS_ALLOWED_HOSTS, fetchDocsPage, searchDocsCatalog } from "../docs/papermc.js";
import {
  adventureGuidanceMarkdown,
  apiVsNmsMarkdown,
  asyncGuidanceMarkdown,
  buildGuidanceMarkdown,
  commandsGuidanceMarkdown,
  foliaGuidanceMarkdown,
  paper26GuidanceMarkdown,
  purpurGuidanceMarkdown,
} from "../guidance.js";
import { explainRuntimeError } from "../hints/runtime.js";
import { adventureMajorFor, searchAdventure } from "../javadoc/adventure.js";
import { isPinError, resolvePin } from "../pin.js";
import { guideTool, text, tool } from "./shared.js";

export function registerDocsTools(server: McpServer): void {
  tool(
    server,
    "mc_docs_search",
    "Search curated PaperMC documentation pages (docs.papermc.io).",
    {
      query: z.string(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async ({ query, limit }) => text(searchDocsCatalog(query, limit ?? 10))
  );

  tool(
    server,
    "mc_docs_get",
    `Fetch a documentation page as Markdown (headings, code blocks, lists, tables). Path on docs.papermc.io or an https URL on: ${DOCS_ALLOWED_HOSTS.join(", ")}.`,
    {
      pathOrUrl: z.string().describe("e.g. /paper/dev/folia-support/ or full https URL"),
    },
    async ({ pathOrUrl }) => text(await fetchDocsPage(pathOrUrl))
  );

  tool(
    server,
    "mc_adventure_search",
    "Search Adventure API Javadocs (Component, Audience, MiniMessage). Prefer over Bungee legacy chat — see mc_adventure_guide.",
    {
      query: z.string(),
      limit: z.number().int().min(1).max(50).optional(),
      projectRoot: z
        .string()
        .optional()
        .describe("Pinned project: picks Adventure 5 (26.2+ / Velocity 4.x) or 4 (older lines)"),
      major: z
        .enum(["4", "5"])
        .optional()
        .describe("Force Adventure major (default: from pin, else 5)"),
    },
    async ({ query, limit, projectRoot, major }) => {
      let adventureMajor: 4 | 5 | undefined = major ? (Number(major) as 4 | 5) : undefined;
      if (!adventureMajor) {
        const pin = await resolvePin({ projectRoot });
        if (!isPinError(pin)) adventureMajor = adventureMajorFor(pin.platform, pin.version);
      }
      return text(await searchAdventure(query, limit ?? 20, { major: adventureMajor }));
    }
  );

  tool(
    server,
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

  guideTool(
    server,
    "mc_adventure_guide",
    "Adventure Component/Audience/MiniMessage rules for Paper and Velocity, incl. Adventure 4 → 5 migration (26.2+, Velocity 4.x). Bans Bungee legacy chat; LimboAPI must use Component too.",
    adventureGuidanceMarkdown
  );
  guideTool(
    server,
    "mc_paper26_guide",
    "Paper/Purpur 26.x: what changed in 26.1 → 26.3 (Adventure 5, beds, cube mobs, deprecations), world clock / setTime / isFixedTime, gamerules, spawn notes. Use with mc_explain_error for exception text.",
    paper26GuidanceMarkdown
  );
  guideTool(
    server,
    "mc_folia_guide",
    "Folia region-threading guidance and checklist (docs/folia.md).",
    foliaGuidanceMarkdown
  );
  guideTool(
    server,
    "mc_async_guide",
    "CRITICAL: when async is allowed on Paper (I/O + heavy math), snapshots, batched apply, teleportAsync pitfalls, Folia notes. Read before scheduling work.",
    asyncGuidanceMarkdown
  );
  guideTool(
    server,
    "mc_commands_guide",
    "Paper commands: classic plugin.yml executors vs Brigadier/Command API — links and checklist (do not invent APIs).",
    commandsGuidanceMarkdown
  );
  guideTool(
    server,
    "mc_purpur_guide",
    "Purpur vs Paper: unique JD packages/events, Bukkit extensions (AFK, ridables), purpur-api dependency.",
    purpurGuidanceMarkdown
  );
  guideTool(
    server,
    "mc_build_guidance",
    "Paper/paperweight build practices: Java/Gradle matrix (Java 25, Gradle 9.7.1+ for userdev beta.24), API vs NMS, Windows non-ASCII paths (build.ps1).",
    buildGuidanceMarkdown
  );
  guideTool(
    server,
    "mc_api_vs_nms",
    "Decision guide: when to use Paper API vs NMS (decision tree, traps, anti-patterns, multi-version). Prefer API by default.",
    apiVsNmsMarkdown
  );
}
