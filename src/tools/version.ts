/** Version pinning and version/build listings. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  loadProjectConfig,
  saveProjectConfig,
  CONFIG_FILENAME,
  type Platform,
} from "../config.js";
import {
  detectVersionFromProject,
  pickBestDetection,
} from "../detect.js";
import {
  findProjectRoot,
  resolveWritableProjectRoot,
} from "../projectRoot.js";
import {
  listFoliaVersionsWithJavadoc,
  resolveFoliaJavadocVersion,
} from "../folia/versions.js";
import {
  listPurpurVersionsWithJavadoc,
  resolvePurpurJavadocVersion,
} from "../purpur/versions.js";
import {
  isKnownRelease,
  resolveJavadocPath,
} from "../javadoc/available.js";
import {
  getPaperBuilds,
  listVersionsWithJavadocStatus,
  resolveJavadocVersion,
} from "../versions.js";
import {
  resolveVelocityJavadocVersion,
} from "../velocity/versions.js";
import {
  normalizeGameVersion,
} from "../versioning.js";
import {
  ASK_USER_FOR_VERSION,
  matchConfirmedDetection,
  versionSourceSchema,
} from "../versionGate.js";
import {
  text,
  errorText,
  platformEnum,
  tool,
} from "./shared.js";

export function registerVersionTools(server: McpServer): void {
  tool(
    server,
    "mc_set_version",
    "Pin Paper/Folia/Purpur/Velocity after the user stated or confirmed the version. Requires version + versionSource. projectRoot optional (defaults to existing .mc-sdk.json near cwd, else cwd). NEVER invent a version.",
    {
      projectRoot: z
        .string()
        .optional()
        .describe(
          "Absolute plugin project root. Optional: walks cwd for .mc-sdk.json, otherwise pins into process.cwd()."
        ),
      version: z
        .string()
        .describe(
          "Exact version the user stated or confirmed (e.g. 26.3, 1.21.11). Alias: 1.26.3 → 26.3. Velocity: 4.3.1 / latest. Do not invent."
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
      const target = await resolveWritableProjectRoot(projectRoot);
      const root = target.root;
      const plat: Platform = platform ?? "paper";
      if (plat === "velocity") {
        const resolved = await resolveVelocityJavadocVersion(version);
        const released =
          !resolved.available && (await isKnownRelease("velocity", version.trim()));
        if (!resolved.available && !released && !allowUnavailable) {
          return errorText(
            `No Velocity Javadocs for ${version} and Fill does not list it as a release.` +
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
        const jd = released ? await resolveJavadocPath("velocity", effective) : undefined;
        const config = await saveProjectConfig(root, effective, {
          notes,
          platform: "velocity",
        });
        return text({
          ok: true,
          message: `Pinned Velocity ${effective}`,
          config,
          configFile: CONFIG_FILENAME,
          projectRoot: root,
          pinSource: target.source,
          javadocAvailable: resolved.available,
          javadocVersion: jd?.jdVersion,
          javadocWarning: jd?.warning,
        });
      }

      if (plat === "folia") {
        const resolved = await resolveFoliaJavadocVersion(version);
        const released =
          !resolved.available && (await isKnownRelease("folia", resolved.version));
        if (released) {
          const jd = await resolveJavadocPath("folia", resolved.version);
          const config = await saveProjectConfig(root, resolved.version, {
            notes,
            nms,
            minecraftVersion,
            platform: "folia",
          });
          return text({
            ok: true,
            message: `Pinned Folia ${resolved.version}${nms ? " (NMS/paperweight)" : ""}`,
            config,
            configFile: CONFIG_FILENAME,
            projectRoot: root,
            pinSource: target.source,
            javadocAvailable: false,
            javadocVersion: jd.jdVersion,
            javadocWarning: jd.warning,
            versionWarning: resolved.warning,
            inputVersion: resolved.input ?? version,
          });
        }
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
        const config = await saveProjectConfig(root, effective, {
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
          projectRoot: root,
          pinSource: target.source,
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
        const config = await saveProjectConfig(root, effective, {
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
          projectRoot: root,
          pinSource: target.source,
          javadocAvailable: resolved.available,
          versionWarning: resolved.warning,
          inputVersion: resolved.input ?? version,
          note: "Purpur Javadocs are a single tree at purpurmc.org/javadoc — version pin aligns Maven/Minecraft.",
        });
      }

      const resolved = await resolveJavadocVersion(version);
      const paperReleased =
        !resolved.available && (await isKnownRelease("paper", resolved.version));
      if (!resolved.available && !paperReleased && !allowUnavailable) {
        return errorText(
          `No Javadocs at https://jd.papermc.io/paper/${resolved.version}/.` +
            (resolved.suggestion
              ? ` Try ${resolved.suggestion} or allowUnavailable=true.`
              : "") +
            (resolved.warning ? ` (${resolved.warning})` : "")
        );
      }
      const effective = resolved.version;
      const paperJd = paperReleased
        ? await resolveJavadocPath("paper", effective)
        : undefined;
      const config = await saveProjectConfig(root, effective, {
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
        projectRoot: root,
        pinSource: target.source,
        javadocAvailable: resolved.available,
        javadocVersion: paperJd?.jdVersion,
        javadocWarning: paperJd?.warning,
        versionWarning: resolved.warning,
        inputVersion: resolved.input ?? version,
      });
    }
  );

  tool(
    server,
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

  tool(
    server,
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
        // Released but JD not yet published → keep the detected version (JD falls back at lookup).
        const pinFor = async (
          plat: Platform,
          resolved: { available: boolean; version: string; suggestion?: string }
        ): Promise<string> => {
          if (resolved.available) return resolved.version;
          if (await isKnownRelease(plat, best.version)) return best.version;
          return resolved.suggestion ?? best.version;
        };
        if (best.platform === "velocity") {
          const resolved = await resolveVelocityJavadocVersion(best.version);
          const version = await pinFor("velocity", resolved);
          pinned = await saveProjectConfig(projectRoot, version, {
            platform: "velocity",
          });
        } else if (best.platform === "folia") {
          const resolved = await resolveFoliaJavadocVersion(best.version);
          const version = await pinFor("folia", resolved);
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
            const version = await pinFor("folia", resolved);
            pinned = await saveProjectConfig(projectRoot, version, {
              platform: "folia",
              nms: best.nms,
            });
          } else {
            const resolved = await resolveJavadocVersion(best.version);
            const version = await pinFor("paper", resolved);
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

  tool(
    server,
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

  tool(
    server,
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
}
