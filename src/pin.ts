/**
 * One place that answers "which platform + version is this project pinned to?" for every tool.
 *
 * Rules (HARD RULE from SERVER_INSTRUCTIONS):
 * - the pin in .mc-sdk.json (explicit projectRoot, else walked up from cwd) is authoritative;
 * - a `version` argument that differs from the pin is refused (no invented versions);
 * - no pin + a `version` argument is refused (ask the user first);
 * - a `platform` argument may switch within the Minecraft family (paper/folia/purpur share
 *   the version line) but never between Minecraft and the Velocity proxy.
 */
import {
  CONFIG_FILENAME,
  loadProjectConfig,
  pinnedVersion,
  type ProjectConfig,
} from "./config.js";
import { platformLabel, type Platform } from "./platform.js";
import { findProjectRoot } from "./projectRoot.js";
import { ASK_USER_FOR_VERSION } from "./versionGate.js";
import { normalizeGameVersion } from "./versioning.js";

export type PlatformFamily = "minecraft" | "proxy";

export function platformFamily(platform: Platform): PlatformFamily {
  return platform === "velocity" ? "proxy" : "minecraft";
}

export interface ResolvedPin {
  version: string;
  platform: Platform;
  config: ProjectConfig;
  projectRoot: string;
  pinSource: "argument" | "cwd";
  /** Minecraft version for NMS / mappings (minecraft family only) */
  minecraftVersion?: string;
}

export interface PinError {
  error: string;
}

export function isPinError(x: ResolvedPin | PinError): x is PinError {
  return "error" in x;
}

const FAMILY_TOOLS: Record<PlatformFamily, string> = {
  minecraft: "mc_search_api / mc_get_class (platform paper|folia|purpur)",
  proxy: "mc_velocity_search_api / mc_velocity_get_class",
};

export async function resolvePin(options: {
  projectRoot?: string;
  /** Version argument passed by the agent (must match the pin) */
  version?: string;
  /** Platform argument passed by the agent (must stay in the pin's family) */
  platform?: Platform;
  /** Tool only works for this family (e.g. Material lookups need a Minecraft pin) */
  requireFamily?: PlatformFamily;
  /** Tool name for error messages */
  tool?: string;
}): Promise<ResolvedPin | PinError> {
  const found = await findProjectRoot(options.projectRoot);
  const config = found ? await loadProjectConfig(found.root) : null;
  const pinned = config ? pinnedVersion(config) : "";

  if (!found || !config || !pinned) {
    if (options.version?.trim()) {
      return {
        error: "Do not pass an invented version= without a project pin. " + ASK_USER_FOR_VERSION,
      };
    }
    return { error: ASK_USER_FOR_VERSION };
  }

  const pinnedPlatform: Platform = config.platform ?? "paper";
  const where = `${CONFIG_FILENAME} in ${found.root}`;

  if (
    options.version?.trim() &&
    normalizeGameVersion(options.version).version !== normalizeGameVersion(pinned).version
  ) {
    return {
      error:
        `Project is pinned to ${pinnedPlatform} ${pinned} (${where}). ` +
        `Do not switch to invented "${options.version}". If the user wants a different version, ask them, then mc_set_version with versionSource=user_stated.`,
    };
  }

  const platform = options.platform ?? pinnedPlatform;
  if (platformFamily(platform) !== platformFamily(pinnedPlatform)) {
    return {
      error:
        `Project is pinned to ${platformLabel(pinnedPlatform)} ${pinned} (${where}); ` +
        `platform=${platform} cannot reuse that version. Use ${FAMILY_TOOLS[platformFamily(pinnedPlatform)]}, ` +
        `or pin the ${platformLabel(platform)} project in its own folder (ask the user for its version).`,
    };
  }

  if (options.requireFamily && platformFamily(platform) !== options.requireFamily) {
    const tool = options.tool ? `${options.tool} ` : "This tool ";
    return {
      error:
        `${tool}needs a ${options.requireFamily === "proxy" ? "Velocity" : "Paper/Folia/Purpur"} pin, ` +
        `but the project is pinned to ${platformLabel(pinnedPlatform)} ${pinned} (${where}). ` +
        `Use ${FAMILY_TOOLS[platformFamily(pinnedPlatform)]} instead.`,
    };
  }

  return {
    version: normalizeGameVersion(pinned).version,
    platform,
    config,
    projectRoot: found.root,
    pinSource: found.source,
    minecraftVersion:
      platformFamily(platform) === "minecraft"
        ? config.minecraftVersion ?? normalizeGameVersion(pinned).version
        : undefined,
  };
}
