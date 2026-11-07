import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { stripSnapshotSuffix, type Platform } from "./platform.js";
import { compareVersions } from "./util/versionCompare.js";
import { normalizeGameVersion } from "./versioning.js";

export interface DetectedVersion {
  version: string;
  source: string;
  file: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
  /** Inferred platform for this hit */
  platform: Platform;
  /** True when paperweight / NMS toolchain detected */
  nms?: boolean;
  /** True when Folia support markers found */
  folia?: boolean;
}

const VERSION_PATTERNS: Array<{
  re: RegExp;
  confidence: DetectedVersion["confidence"];
  label: string;
  platform: Platform;
  nms?: boolean;
}> = [
  {
    re: /com\.velocitypowered:velocity-api:([^\s"']+)/,
    confidence: "high",
    label: "velocity-api dependency",
    platform: "velocity",
  },
  {
    re: /org\.purpurmc\.purpur:purpur-api:([^\s"'@]+)/,
    confidence: "high",
    label: "purpur-api dependency",
    platform: "purpur",
  },
  {
    re: /paperweight\.paperDevBundle\(\s*["']([^"']+)["']\s*\)/,
    confidence: "high",
    label: "paperweight.paperDevBundle",
    platform: "paper",
    nms: true,
  },
  {
    re: /io\.papermc\.paper:folia-api:([^\s"'@]+)/,
    confidence: "high",
    label: "folia-api dependency",
    platform: "folia",
  },
  {
    re: /io\.papermc\.paper:paper-api:([^\s"'@]+)/,
    confidence: "high",
    label: "paper-api dependency",
    platform: "paper",
  },
  {
    re: /paper-api[:\s]+["']?([0-9]+(?:\.[0-9]+){1,3}(?:-R0\.1-SNAPSHOT)?)/,
    confidence: "high",
    label: "paper-api coordinate",
    platform: "paper",
  },
  // Gradle version catalogs (gradle/libs.versions.toml): [versions] paper = "26.3.build.244-stable"
  {
    re: /module\s*=\s*["']io\.papermc\.paper:paper-api["']\s*,\s*version\s*=\s*["']([^"']+)["']/,
    confidence: "high",
    label: "version catalog paper-api",
    platform: "paper",
  },
  {
    re: /^\s*(?:velocity|velocity-api|velocityApi)\s*=\s*["']([0-9][^"']*)["']/m,
    confidence: "high",
    label: "version catalog velocity",
    platform: "velocity",
  },
  {
    re: /^\s*(?:purpur|purpur-api|purpurApi)\s*=\s*["']([0-9][^"']*)["']/m,
    confidence: "high",
    label: "version catalog purpur",
    platform: "purpur",
  },
  {
    re: /^\s*(?:folia|folia-api|foliaApi)\s*=\s*["']([0-9][^"']*)["']/m,
    confidence: "high",
    label: "version catalog folia",
    platform: "folia",
  },
  {
    re: /^\s*(?:paper|paper-api|paperApi|paperweight-dev-bundle|dev-bundle)\s*=\s*["']([0-9][^"']*)["']/m,
    confidence: "high",
    label: "version catalog paper",
    platform: "paper",
  },
  // gradle.properties: paperVersion=26.3.build.244-stable
  {
    re: /^\s*(?:paperVersion|paper_version|paper\.version)\s*=\s*([0-9][^\s#]*)/m,
    confidence: "medium",
    label: "gradle.properties paperVersion",
    platform: "paper",
  },
  // run-paper: tasks.runServer { minecraftVersion("26.3") }
  {
    re: /minecraftVersion\(\s*["']([0-9][^"']*)["']\s*\)/,
    confidence: "medium",
    label: "run-paper minecraftVersion",
    platform: "paper",
  },
  {
    re: /id\s*\(\s*["']io\.papermc\.paperweight\.userdev["']/,
    confidence: "low",
    label: "paperweight plugin (version elsewhere)",
    platform: "paper",
    nms: true,
  },
  {
    re: /minecraft[_-]?version\s*[=:]\s*["']([^"']+)["']/i,
    confidence: "medium",
    label: "minecraft_version property",
    platform: "paper",
  },
  {
    re: /api-version:\s*["']?([0-9]+(?:\.[0-9]+){1,2})/,
    confidence: "medium",
    label: "plugin.yml api-version",
    platform: "paper",
  },
];

async function walkFiles(
  root: string,
  maxDepth = 4,
  acc: string[] = [],
  depth = 0
): Promise<string[]> {
  if (depth > maxDepth || acc.length > 80) return acc;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (
      e.name === "node_modules" ||
      e.name === ".git" ||
      e.name === "build" ||
      e.name === "dist" ||
      e.name === ".gradle"
    ) {
      continue;
    }
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      await walkFiles(full, maxDepth, acc, depth + 1);
    } else if (
      /\.(gradle|kts|xml|yml|yaml|properties|toml)$/i.test(e.name) ||
      e.name === "gradle.properties" ||
      e.name === "libs.versions.toml"
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function platformPriority(p: Platform): number {
  if (p === "velocity") return 0;
  if (p === "folia") return 1;
  if (p === "purpur") return 2;
  return 3;
}

/**
 * Pick the best detection hit for auto-pin.
 * Priority: velocity > folia > paperweight(NMS) > paper-api > weaker signals.
 */
export function pickBestDetection(
  hits: DetectedVersion[]
): DetectedVersion | null {
  if (!hits.length) return null;
  const ranked = [...hits].sort((a, b) => {
    const conf = { high: 0, medium: 1, low: 2 };
    const nmsBoost = (h: DetectedVersion) => (h.nms ? -0.5 : 0);
    return (
      conf[a.confidence] - conf[b.confidence] ||
      platformPriority(a.platform) - platformPriority(b.platform) ||
      nmsBoost(a) - nmsBoost(b) ||
      // several modules / branches: the newest version is the likely target
      compareVersions(b.version, a.version)
    );
  });
  return ranked[0];
}

export async function detectVersionFromProject(
  projectRoot: string
): Promise<DetectedVersion[]> {
  const files = await walkFiles(projectRoot);
  const hits: DetectedVersion[] = [];
  let projectFoliaMarker = false;

  for (const file of files) {
    let text: string;
    try {
      const st = await stat(file);
      if (st.size > 2_000_000) continue;
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }

    if (
      /folia-supported:\s*true/i.test(text) ||
      /folia_supported:\s*true/i.test(text)
    ) {
      projectFoliaMarker = true;
    }

    for (const pat of VERSION_PATTERNS) {
      if (pat.confidence === "low") {
        if (!pat.re.test(text)) continue;
        hits.push({
          version: "",
          source: pat.label,
          file: path.relative(projectRoot, file) || file,
          confidence: pat.confidence,
          evidence: pat.label,
          platform: pat.platform,
          nms: pat.nms,
        });
        continue;
      }
      const m = text.match(pat.re);
      if (!m?.[1]) continue;
      const stripped = stripSnapshotSuffix(m[1]);
      const version = normalizeGameVersion(stripped).version;
      hits.push({
        version,
        source: pat.label,
        file: path.relative(projectRoot, file) || file,
        confidence: pat.confidence,
        evidence: m[0].slice(0, 120),
        platform: pat.platform,
        nms: pat.nms,
        folia: pat.platform === "folia" || undefined,
      });
    }
  }

  // Promote paper hits to folia when plugin.yml marks folia-supported
  if (projectFoliaMarker) {
    for (const h of hits) {
      if (h.platform === "paper" && h.version) {
        h.folia = true;
      }
    }
  }

  hits.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return (
      rank[a.confidence] - rank[b.confidence] ||
      platformPriority(a.platform) - platformPriority(b.platform) ||
      compareVersions(b.version, a.version)
    );
  });

  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.platform}|${h.version}|${h.source}|${h.nms ? "nms" : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
