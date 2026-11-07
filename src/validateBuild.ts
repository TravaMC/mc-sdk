import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultMinJava,
  isModernPaperLine,
  normalizeGameVersion,
  compareGradleVersions,
  minGradleForUserdevPlugin,
  pluginApiVersion,
  requiresMojangProduction,
} from "./versioning.js";

export interface BuildGradleIssue {
  severity: "error" | "warning";
  message: string;
}

/** Declared paperweight-userdev plugin version, e.g. 2.0.0-beta.24 */
export function parseUserdevVersion(buildText: string): string | undefined {
  return (
    /io\.papermc\.paperweight\.userdev["']?\s*\)?\s*version\s*\(?\s*["']([^"']+)["']/.exec(
      buildText
    )?.[1] ?? undefined
  );
}

function usesUserdev2(buildText: string): boolean {
  return (
    /paperweight\.userdev[^"]*"2\./.test(buildText) ||
    /userdev"\)\s*version\s*"2\./.test(buildText) ||
    /id\(\s*["']io\.papermc\.paperweight\.userdev["']\s*\)\s*version\s*\(\s*["']2\./.test(
      buildText
    )
  );
}

/** Parse distributionUrl …/gradle-9.6.1-bin.zip (also escaped \:). */
export function parseGradleWrapperVersion(
  wrapperProps: string
): { major: number; minor: number; patch: number; raw: string } | null {
  const m = wrapperProps.match(/gradle-(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return {
    major: Number.parseInt(m[1], 10),
    minor: Number.parseInt(m[2], 10),
    patch: Number.parseInt(m[3] ?? "0", 10),
    raw: m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`,
  };
}

export async function validateBuildGradle(
  projectRoot: string,
  options?: { expectedVersion?: string; platform?: string }
): Promise<{ ok: boolean; issues: BuildGradleIssue[]; filesChecked: string[] }> {
  const issues: BuildGradleIssue[] = [];
  const filesChecked: string[] = [];
  let buildText = "";
  let buildFile = "";
  for (const name of ["build.gradle.kts", "build.gradle"]) {
    try {
      buildText = await readFile(path.join(projectRoot, name), "utf8");
      buildFile = name;
      break;
    } catch {
      /* next */
    }
  }
  if (!buildFile) {
    return {
      ok: false,
      issues: [{ severity: "error", message: "No build.gradle(.kts) found" }],
      filesChecked,
    };
  }
  filesChecked.push(buildFile);

  const isProxy = options?.platform === "velocity";
  // A Velocity version (4.3.1) is not a Minecraft line — never feed it to the Paper checks.
  const expected =
    options?.expectedVersion && !isProxy
      ? normalizeGameVersion(options.expectedVersion).version
      : undefined;
  // Without a pin, infer the 26.x line only from Paper/Purpur/Folia coordinates — a bare "26.x"
  // also matches unrelated deps (org.jetbrains:annotations:26.0.2). Velocity builds never qualify.
  const modern = isProxy
    ? false
    : expected
      ? isModernPaperLine(expected)
      : /(paper|purpur|folia)-api:2\d\.|paperDevBundle\(\s*["']2\d\./.test(buildText);
  const mojangProd = isProxy
    ? false
    : expected
      ? requiresMojangProduction(expected)
      : /paperDevBundle\(\s*["']26\.[1-9]/.test(buildText) ||
        /MOJANG_PRODUCTION/.test(buildText) ||
        (modern && /paperweight/.test(buildText));

  if (modern) {
    if (
      /-R0\.1-SNAPSHOT/.test(buildText) &&
      (/paper-api|purpur-api/.test(buildText) ||
        /paperDevBundle\("[^"]*-R0\.1-SNAPSHOT"\)/.test(buildText))
    ) {
      issues.push({
        severity: "error",
        message:
          "Modern Paper/Purpur 26.x should use VERSION.build.+ (or exact .build.N-stable/beta), not -R0.1-SNAPSHOT",
      });
    }
    if (/JavaLanguageVersion\.of\(21\)/.test(buildText)) {
      issues.push({
        severity: "warning",
        message: `26.x line typically needs Java ${defaultMinJava(expected ?? "26.3")} toolchain, not 21`,
      });
    }
  }

  // paperweight / reobf rules for 26.1+
  if (/paperweight|paperDevBundle/.test(buildText)) {
    if (mojangProd && /dependsOn\s*\(\s*(tasks\.)?reobfJar\s*\)/.test(buildText)) {
      issues.push({
        severity: "error",
        message:
          "26.1+: do not dependsOn(reobfJar) — use paperweight.reobfArtifactConfiguration = MOJANG_PRODUCTION (see mc_docs_get /paper/dev/userdev/)",
      });
    }
    if (mojangProd && !/MOJANG_PRODUCTION/.test(buildText)) {
      issues.push({
        severity: "warning",
        message:
          "26.1+ NMS builds should set ReobfArtifactConfiguration.MOJANG_PRODUCTION",
      });
    }
  }

  const userdev2 = usesUserdev2(buildText);

  let settingsText = "";
  try {
    settingsText = await readFile(path.join(projectRoot, "settings.gradle.kts"), "utf8");
    filesChecked.push("settings.gradle.kts");
  } catch {
    try {
      settingsText = await readFile(path.join(projectRoot, "settings.gradle"), "utf8");
      filesChecked.push("settings.gradle");
    } catch {
      /* optional */
    }
  }
  if (modern && !/foojay-resolver/.test(buildText + settingsText)) {
    issues.push({
      severity: "warning",
      message:
        "Add org.gradle.toolchains.foojay-resolver-convention (1.0.0) in settings.gradle.kts so Gradle can provision the JDK 25 toolchain automatically",
    });
  }

  // Wrapper Gradle version — only warn/error when actually < 9 (or missing)
  let wrapperVersion: ReturnType<typeof parseGradleWrapperVersion> = null;
  try {
    const wrapper = await readFile(
      path.join(projectRoot, "gradle", "wrapper", "gradle-wrapper.properties"),
      "utf8"
    );
    filesChecked.push("gradle/wrapper/gradle-wrapper.properties");
    wrapperVersion = parseGradleWrapperVersion(wrapper);
  } catch {
    /* missing */
  }

  if (userdev2) {
    const userdevVersion = parseUserdevVersion(buildText);
    const needGradle = userdevVersion ? minGradleForUserdevPlugin(userdevVersion) : "9.0";
    if (!wrapperVersion) {
      issues.push({
        severity: "warning",
        message: `paperweight-userdev ${userdevVersion ?? "2.x"} needs Gradle ${needGradle}+ — no gradle-wrapper.properties found (or unparseable distributionUrl)`,
      });
    } else if (compareGradleVersions(wrapperVersion.raw, needGradle) < 0) {
      issues.push({
        severity: "error",
        message: `gradle-wrapper is ${wrapperVersion.raw} but paperweight-userdev ${userdevVersion ?? "2.x"} requires Gradle ${needGradle}+`,
      });
    }
  }

  // velocity-api 4.x Gradle metadata targets JVM 25 — a lower toolchain fails variant resolution
  if (/velocity-api:4\./.test(buildText)) {
    const lang = /JavaLanguageVersion\.of\((\d+)\)/.exec(buildText)?.[1];
    if (lang && Number.parseInt(lang, 10) < 25) {
      issues.push({
        severity: "error",
        message: `velocity-api 4.x requires Java 25 (toolchain is ${lang}) — set JavaLanguageVersion.of(25)`,
      });
    }
  }

  if (/1\.26\.\d/.test(buildText)) {
    issues.push({
      severity: "error",
      message: 'Found "1.26.x" — Paper calendar versions are "26.x", not "1.26.x"',
    });
  }

  if (
    options?.platform === "purpur" &&
    !/purpur-api/.test(buildText) &&
    /paper-api/.test(buildText)
  ) {
    issues.push({
      severity: "warning",
      message:
        "Platform is purpur but build uses paper-api only — OK for portable plugins; Purpur-only APIs need purpur-api",
    });
  }

  // Velocity uses @Plugin / velocity-plugin.json; Paper plugins may ship only paper-plugin.yml.
  if (!isProxy) {
    let yml: string | undefined;
    for (const name of ["plugin.yml", "paper-plugin.yml"]) {
      try {
        yml = await readFile(path.join(projectRoot, "src", "main", "resources", name), "utf8");
        filesChecked.push(`src/main/resources/${name}`);
        break;
      } catch {
        /* next */
      }
    }
    if (yml === undefined) {
      issues.push({
        severity: "warning",
        message: "plugin.yml / paper-plugin.yml not found under src/main/resources/",
      });
    } else {
      const api = yml.match(/api-version:\s*['"]?([0-9.]+)/)?.[1];
      if (expected && api) {
        const want = pluginApiVersion(expected);
        if (api !== want && !api.startsWith(want + ".")) {
          issues.push({
            severity: "warning",
            message: `api-version is '${api}', expected ~'${want}' for ${expected}`,
          });
        }
      }
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues, filesChecked };
}
