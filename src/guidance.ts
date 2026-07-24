import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");

async function readDoc(name: string, fallback: string): Promise<string> {
  try {
    return await readFile(path.join(DOCS_DIR, name), "utf8");
  } catch {
    return fallback;
  }
}

/** Paper API vs NMS decision guide (public docs/api-vs-nms.md). */
export async function apiVsNmsMarkdown(): Promise<string> {
  return readDoc(
    "api-vs-nms.md",
    "# Paper API vs NMS\n\nSee docs/api-vs-nms.md in the mc-sdk repository.\n"
  );
}

/** Build / paperweight / Windows path guidance. */
export async function buildGuidanceMarkdown(): Promise<string> {
  return readDoc(
    "build-guidance.md",
    "# Build guidance\n\nSee docs/build-guidance.md in the mc-sdk repository.\n"
  );
}

/** Velocity overview. */
export async function velocityGuidanceMarkdown(): Promise<string> {
  return readDoc(
    "velocity.md",
    "# Velocity\n\nSee docs/velocity.md in the mc-sdk repository.\n"
  );
}

/** Folia region threading. */
export async function foliaGuidanceMarkdown(): Promise<string> {
  return readDoc(
    "folia.md",
    "# Folia\n\nSee docs/folia.md. Use Region/Entity/Global/Async schedulers; set folia-supported only after testing.\n"
  );
}

/** Async / main-thread / performance. */
export async function asyncGuidanceMarkdown(): Promise<string> {
  return readDoc(
    "async.md",
    "# Async\n\nNever block the Paper main thread with HTTP/DB/disk. See docs/async.md.\n"
  );
}

/** Paper commands / Brigadier. */
export async function commandsGuidanceMarkdown(): Promise<string> {
  return readDoc(
    "commands.md",
    "# Commands\n\nSee docs/commands.md and https://docs.papermc.io/paper/dev/api/command-api/\n"
  );
}

/** Purpur overview. */
export async function purpurGuidanceMarkdown(): Promise<string> {
  return readDoc(
    "purpur.md",
    "# Purpur\n\nSee docs/purpur.md. Javadocs: https://purpurmc.org/javadoc/\n"
  );
}

/** NMS / paperweight overview from docs (optional mcVersion hint appended). */
export async function nmsDocMarkdown(mcVersion?: string): Promise<string> {
  const body = await readDoc(
    "nms.md",
    "# NMS\n\nPrefer Paper API. Use paperweight-userdev with Mojang mappings.\n"
  );
  if (!mcVersion) return body;
  return `${body}\n\n---\n\nPinned Minecraft hint for templates: \`${mcVersion}\`\n`;
}
