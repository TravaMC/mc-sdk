import { fetchText } from "../cache.js";
import { htmlToMarkdown } from "./htmlToMarkdown.js";

const DOCS_BASE = "https://docs.papermc.io";

/** Curated index — paths verified against docs.papermc.io (keep in sync / CI can recheck). */
export const DOCS_CATALOG: Array<{
  title: string;
  path: string;
  tags: string[];
}> = [
  { title: "Project setup", path: "/paper/dev/project-setup/", tags: ["setup", "gradle", "start", "paper", "nms", "paperweight", "userdev"] },
  { title: "plugin.yml", path: "/paper/dev/plugin-yml/", tags: ["plugin.yml", "bukkit", "manifest"] },
  { title: "Paper plugins", path: "/paper/dev/getting-started/paper-plugins/", tags: ["paper-plugin.yml", "modern"] },
  { title: "Plugin configuration", path: "/paper/dev/plugin-configurations/", tags: ["config", "yaml"] },
  { title: "Event listeners", path: "/paper/dev/event-listeners/", tags: ["events", "listener"] },
  { title: "Paper API index", path: "/paper/dev/api/", tags: ["api", "paper", "commands", "reference"] },
  { title: "Command API", path: "/paper/dev/api/command-api/", tags: ["commands", "brigadier", "command"] },
  { title: "Adventure / Component API", path: "/paper/dev/api/component-api/", tags: ["adventure", "component", "chat", "minimessage", "legacy"] },
  { title: "Adventure docs", path: "/adventure/", tags: ["adventure", "minimessage", "audience", "component", "velocity"] },
  { title: "Adventure text components", path: "/adventure/text/", tags: ["adventure", "component", "text"] },
  { title: "Adventure MiniMessage", path: "/adventure/minimessage/", tags: ["adventure", "minimessage"] },
  { title: "Adventure audiences", path: "/adventure/audiences/", tags: ["adventure", "audience"] },
  { title: "Adventure serializers", path: "/adventure/serializer/", tags: ["adventure", "serializer", "legacy"] },
  { title: "Migrating from Adventure 4.x to 5.x", path: "/adventure/migration/adventure-4.x/", tags: ["adventure", "migration", "adventure5", "clickevent", "26.2", "velocity"] },
  { title: "Folia support", path: "/paper/dev/folia-support/", tags: ["folia", "region", "scheduler"] },
  { title: "Folia home", path: "/folia/", tags: ["folia"] },
  { title: "Folia FAQ", path: "/folia/faq/", tags: ["folia", "faq"] },
  { title: "Lifecycle events", path: "/paper/dev/lifecycle/", tags: ["lifecycle", "bootstrap"] },
  { title: "Data component API", path: "/paper/dev/data-component-api/", tags: ["items", "components", "1.20.5"] },
  { title: "PDC", path: "/paper/dev/pdc/", tags: ["pdc", "persistent", "data", "items"] },
  { title: "Registries", path: "/paper/dev/registries/", tags: ["registry", "itemtype", "blocktype"] },
  { title: "Scheduling", path: "/paper/dev/scheduler/", tags: ["scheduler", "tasks", "folia", "async", "performance", "main-thread"] },
  { title: "Entity teleport", path: "/paper/dev/entity-teleport/", tags: ["teleport", "async", "chunks", "performance"] },
  // Velocity
  { title: "Velocity docs home", path: "/velocity/", tags: ["velocity", "proxy"] },
  { title: "Velocity getting started", path: "/velocity/getting-started/", tags: ["velocity", "setup", "admin"] },
  { title: "Creating a Velocity plugin", path: "/velocity/dev/creating-your-first-plugin/", tags: ["velocity", "plugin", "dev", "setup"] },
  { title: "Velocity API basics", path: "/velocity/dev/api/", tags: ["velocity", "api", "proxy"] },
  { title: "Velocity events", path: "/velocity/dev/event-api/", tags: ["velocity", "events"] },
  { title: "Velocity FAQ", path: "/velocity/faq/", tags: ["velocity", "faq"] },
];

// Purpur docs live on purpurmc.org (not docs.papermc.io) — see DOCS_CATALOG_EXTERNAL
export const DOCS_CATALOG_EXTERNAL: Array<{
  title: string;
  url: string;
  tags: string[];
}> = [
  {
    title: "Purpur docs home",
    url: "https://purpurmc.org/docs/purpur/",
    tags: ["purpur", "api", "setup"],
  },
  {
    title: "Purpur Javadocs",
    url: "https://purpurmc.org/javadoc/",
    tags: ["purpur", "javadoc", "api", "afk", "ridable"],
  },
  {
    title: "LimboAPI (Velocity limbo library)",
    url: "https://github.com/Elytrium/LimboAPI",
    tags: ["limbo", "limboapi", "velocity", "elytrium", "adventure"],
  },
];

export function searchDocsCatalog(query: string, limit = 10) {
  const q = query.toLowerCase();
  const parts = q.split(/\s+/).filter(Boolean);
  const paperHits = DOCS_CATALOG.map((page) => {
    const hay = `${page.title} ${page.tags.join(" ")} ${page.path}`.toLowerCase();
    let score = 0;
    if (hay.includes(q)) score += 50;
    for (const p of parts) if (hay.includes(p)) score += 10;
    return { title: page.title, path: page.path, tags: page.tags, url: `${DOCS_BASE}${page.path}`, score };
  });
  const externalHits = DOCS_CATALOG_EXTERNAL.map((page) => {
    const hay = `${page.title} ${page.tags.join(" ")} ${page.url}`.toLowerCase();
    let score = 0;
    if (hay.includes(q)) score += 50;
    for (const p of parts) if (hay.includes(p)) score += 10;
    return { title: page.title, path: page.url, tags: page.tags, url: page.url, score };
  });
  return [...paperHits, ...externalHits]
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Hosts mc_docs_get may fetch. The tool takes free-form URLs from an agent, so it must not
 * become a generic fetcher (localhost, intranet, arbitrary sites).
 */
export const DOCS_ALLOWED_HOSTS = [
  "docs.papermc.io",
  "papermc.io",
  "jd.papermc.io",
  "hangar.papermc.io",
  "purpurmc.org",
  "jd.advntr.dev",
  "minecraft.wiki",
  "github.com",
];

export function resolveDocsUrl(pathOrUrl: string): string {
  const raw = pathOrUrl.trim();
  const url = /^[a-z]+:\/\//i.test(raw)
    ? raw
    : `${DOCS_BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Not a valid docs path or URL: ${pathOrUrl}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Only https documentation URLs are allowed (got ${parsed.protocol})`);
  }
  if (!DOCS_ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase())) {
    throw new Error(
      `Host ${parsed.hostname} is not an allowed documentation host (${DOCS_ALLOWED_HOSTS.join(", ")}).`
    );
  }
  return parsed.toString();
}

const DOCS_MAX_CHARS = 30_000;

export async function fetchDocsPage(pathOrUrl: string): Promise<{
  url: string;
  title: string;
  markdown: string;
  truncated?: boolean;
}> {
  const url = resolveDocsUrl(pathOrUrl);
  const html = await fetchText(url, {
    cacheKey: `docs:${url}`,
    ttlMs: 12 * 60 * 60 * 1000,
  });
  const { title, markdown } = htmlToMarkdown(html, url);
  const truncated = markdown.length > DOCS_MAX_CHARS;
  return {
    url,
    title,
    markdown: truncated ? markdown.slice(0, DOCS_MAX_CHARS) + "\n\n…(truncated)" : markdown,
    ...(truncated ? { truncated } : {}),
  };
}
