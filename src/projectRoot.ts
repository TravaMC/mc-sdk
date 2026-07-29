import { access } from "node:fs/promises";
import path from "node:path";
import { CONFIG_FILENAME } from "./config.js";

/**
 * Resolve plugin project root that may contain `.mc-sdk.json`.
 * Prefer explicit path; otherwise walk `process.cwd()` and parents.
 */
export async function findProjectRoot(
  explicit?: string
): Promise<{ root: string; source: "argument" | "cwd" } | undefined> {
  if (explicit?.trim()) {
    return { root: path.resolve(explicit.trim()), source: "argument" };
  }

  let dir = process.cwd();
  for (let i = 0; i < 16; i++) {
    try {
      await access(path.join(dir, CONFIG_FILENAME));
      return { root: dir, source: "cwd" };
    } catch {
      /* continue */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
