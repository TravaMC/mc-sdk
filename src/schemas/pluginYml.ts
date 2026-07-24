import YAML from "yaml";

export interface YmlIssue {
  level: "error" | "warning" | "info";
  path: string;
  message: string;
}

const PLUGIN_YML_REQUIRED = ["name", "version", "main"] as const;

export function validatePluginYml(content: string): {
  kind: "plugin.yml" | "paper-plugin.yml" | "unknown";
  issues: YmlIssue[];
  parsed: Record<string, unknown> | null;
} {
  let parsed: Record<string, unknown>;
  try {
    parsed = YAML.parse(content) as Record<string, unknown>;
  } catch (e) {
    return {
      kind: "unknown",
      issues: [
        {
          level: "error",
          path: "",
          message: `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      parsed: null,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      kind: "unknown",
      issues: [{ level: "error", path: "", message: "Root must be a mapping" }],
      parsed: null,
    };
  }

  const paperHints =
    "loader" in parsed ||
    "bootstrapper" in parsed ||
    ("dependencies" in parsed && typeof parsed.dependencies === "object");

  const kind: "plugin.yml" | "paper-plugin.yml" | "unknown" = paperHints
    ? "paper-plugin.yml"
    : "main" in parsed
      ? "plugin.yml"
      : "unknown";

  const issues: YmlIssue[] = [];

  if (kind === "plugin.yml" || (!paperHints && "main" in parsed)) {
    for (const key of PLUGIN_YML_REQUIRED) {
      if (parsed[key] == null || parsed[key] === "") {
        issues.push({
          level: "error",
          path: key,
          message: `Missing required field '${key}'`,
        });
      }
    }
    if (parsed["api-version"] == null) {
      issues.push({
        level: "warning",
        path: "api-version",
        message: "api-version is recommended (e.g. '1.21')",
      });
    }
    if (typeof parsed.main === "string" && !parsed.main.includes(".")) {
      issues.push({
        level: "warning",
        path: "main",
        message: "main should be a fully-qualified class name",
      });
    }
  }

  if (kind === "paper-plugin.yml" || paperHints) {
    if (parsed.name == null) {
      issues.push({ level: "error", path: "name", message: "Missing name" });
    }
    if (parsed.version == null) {
      issues.push({ level: "error", path: "version", message: "Missing version" });
    }
    issues.push({
      level: "info",
      path: "",
      message:
        "Paper plugins: see https://docs.papermc.io/paper/dev/getting-started/paper-plugins/",
    });
  }

  if (parsed.folia_supported === true || parsed["folia-supported"] === true) {
    issues.push({
      level: "info",
      path: "folia-supported",
      message: "Folia marked supported — ensure region-safe scheduling (mc_folia_guide).",
    });
  }

  return { kind, issues, parsed };
}

export function pluginYmlSchemaHelp(): string {
  return `# plugin.yml (Bukkit) — key fields

required:
  - name: string
  - version: string
  - main: FQCN of JavaPlugin subclass
recommended:
  - api-version: "1.21" (or your major.minor)
  - description, authors, website
  - commands: map
  - permissions: map
optional Folia:
  - folia-supported: true

# paper-plugin.yml — modern Paper plugins

See docs: https://docs.papermc.io/paper/dev/getting-started/paper-plugins/
Often includes loader/bootstrapper and dependency declarations with lifecycle support.
`;
}
