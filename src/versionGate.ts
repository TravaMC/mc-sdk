import { z } from "zod";
import { normalizeGameVersion } from "./versioning.js";

/**
 * How the agent claims it knows the target version.
 * We cannot verify chat history; the enum + descriptions exist to stop silent guessing.
 */
export const versionSourceSchema = z
  .enum(["user_stated", "user_confirmed_detection"])
  .describe(
    "REQUIRED proof you did not invent the version. " +
      "user_stated = the user explicitly typed/said this exact version in this conversation. " +
      "user_confirmed_detection = mc_detect_version found candidates AND the user confirmed that exact version. " +
      "If neither happened: STOP — ask the user for Paper/Folia/Purpur/Velocity version. " +
      "Never guess 1.21.x, 26.x, latest, or 'whatever is current'."
  );

export type VersionSource = z.infer<typeof versionSourceSchema>;

export const ASK_USER_FOR_VERSION =
  "STOP. Do not invent or guess a Minecraft/Paper/Folia/Purpur/Velocity version. " +
  "Ask the user which platform and version to target (e.g. Paper 26.2, Paper 1.21.1, Velocity 3.4.0). " +
  "Only after they answer: call mc_set_version with version=<their answer> and versionSource=user_stated (projectRoot optional — uses cwd). " +
  "If build files exist, you may run mc_detect_version (without pin), show results, and pin only after they confirm " +
  "(versionSource=user_confirmed_detection or pin with userConfirmedVersion). " +
  "If `.mc-sdk.json` already exists: pass projectRoot (or run the MCP with cwd inside that project) — the pin is used automatically; do not ask again.";

export const SERVER_INSTRUCTIONS = `mc-sdk — Minecraft plugin MCP.

HARD RULE — version must come from the user (or their confirmed detection), never from the model:
1. If .mc-sdk.json already pins a version, use that pin silently (pass projectRoot, or rely on cwd auto-detect). Do not ask again and do not invent another version.
2. If there is no pin and the user has not stated a version in this chat: ASK them. Then mc_set_version with version + versionSource=user_stated (projectRoot optional). Do not invent a version.
3. Optional mc_detect_version is OK to propose candidates, but never pin=true until the user confirms the exact version string.
4. Never invent Gradle coords or API members for an assumed version — pin first, then look up.

TEXT / UI — Adventure only (Paper and Velocity, including LimboAPI):
- Use Component / Audience / MiniMessage. Read mc_adventure_guide (and mc_velocity_guide on proxy).
- Do not use net.md_5.bungee.api.chat.* or ChatColor/§ as the primary API.

26.x / large classes:
- World time: mc_paper26_guide + mc_get_class memberQuery=isFixedTime|setTime. Exception text: mc_explain_error.
- Default mc_get_class truncates huge types — always pass memberQuery for the member you need.
- Events: read deprecated/prefer/warnings from mc_search_api / mc_find_event (e.g. AsyncPlayerSpawnLocationEvent over Spigot PlayerSpawnLocationEvent). Never pick a deprecated Spigot event when prefer is set.

Workflow: ask/confirm version (or use existing pin) → mc_set_version if needed → mc_resolve_dependency / mc_search_api.`;

/** When auto-pinning detection, require an exact user-confirmed version string. */
export function matchConfirmedDetection<T extends { version: string }>(
  hits: T[],
  userConfirmedVersion: string | undefined
): { ok: true; hit: T } | { ok: false; message: string } {
  if (!userConfirmedVersion?.trim()) {
    return {
      ok: false,
      message:
        "Cannot pin without user confirmation. Show `detected` to the user, ask which version to use, " +
        "then call again with pin=true and userConfirmedVersion=<exact version they chose>, " +
        "or call mc_set_version with versionSource=user_confirmed_detection.",
    };
  }
  const want = normalizeGameVersion(userConfirmedVersion).version;
  const hit =
    hits.find((h) => normalizeGameVersion(h.version).version === want) ??
    hits.find((h) => h.version.trim() === userConfirmedVersion.trim());
  if (!hit) {
    const options = [
      ...new Set(hits.map((h) => h.version).filter(Boolean)),
    ].join(", ");
    return {
      ok: false,
      message:
        `userConfirmedVersion "${userConfirmedVersion}" is not among detected versions` +
        (options ? ` (${options})` : "") +
        ". Ask the user to pick one of the detected versions (or state a different version for mc_set_version).",
    };
  }
  return { ok: true, hit };
}
