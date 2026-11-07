/** Velocity proxy: versions and Javadoc lookups. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  velocityGuidanceMarkdown,
} from "../guidance.js";
import {
  resolveJavadocPath,
} from "../javadoc/available.js";
import {
  formatClassDoc,
  fetchClassDoc,
} from "../javadoc/parse.js";
import {
  searchApi,
} from "../javadoc/search.js";
import {
  listVelocityVersionsWithJavadoc,
} from "../velocity/versions.js";
import {
  text,
  errorText,
  requireVersion,
  tool,
} from "./shared.js";

export function registerVelocityTools(server: McpServer): void {
  tool(
    server,
    "mc_velocity_guide",
    "Velocity proxy plugins: setup, Adventure text (not legacy), LimboAPI notes, Javadoc links.",
    {},
    async () => text(await velocityGuidanceMarkdown())
  );

  tool(
    server,
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

  tool(
    server,
    "mc_velocity_search_api",
    "Search Velocity Javadocs (com.velocitypowered.*) for a version.",
    {
      query: z.string(),
      projectRoot: z.string().optional(),
      version: z
        .string()
        .optional()
        .describe("e.g. 4.3.1, 3.4.0, latest (root docs). Unpublished JD (4.3.x) falls back to the closest published tree with javadocWarning."),
      scope: z.enum(["all", "types", "members", "packages"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ query, projectRoot, version, scope, limit }) => {
      const v = await requireVersion(projectRoot, version, "velocity");
      if ("isError" in v) return v;
      try {
        const jd = await resolveJavadocPath("velocity", v.version);
        const results = await searchApi(jd.jdVersion, query, {
          scope,
          limit,
          platform: "velocity",
        });
        return text({
          platform: "velocity",
          version: v.version,
          javadocVersion: jd.jdVersion || "latest",
          ...(jd.warning ? { javadocWarning: jd.warning } : {}),
          query,
          ...results,
        });
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );

  tool(
    server,
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
        const jd = await resolveJavadocPath("velocity", v.version);
        const doc = await fetchClassDoc(
          jd.jdVersion,
          args.className,
          args.packageName,
          "velocity"
        );
        const body = formatClassDoc(doc, { maxMethods: args.maxMethods });
        return text(jd.warning ? `> ⚠ ${jd.warning}\n\n${body}` : body);
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
