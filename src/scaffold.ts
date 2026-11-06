import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDependency } from "./deps/resolve.js";
import type { Platform } from "./platform.js";
import { renderTemplate } from "./templates.js";
import { latestGradleVersion } from "./toolchain.js";
import {
  FOOJAY_RESOLVER_VERSION,
  normalizeGameVersion,
  pluginApiVersion,
} from "./versioning.js";

export async function scaffoldProject(options: {
  projectRoot: string;
  platform?: Platform;
  version: string;
  packageName?: string;
  className?: string;
  pluginName?: string;
}): Promise<{
  written: string[];
  dependency: Awaited<ReturnType<typeof resolveDependency>>;
  versionWarning?: string;
  /** Gradle version suggested for the wrapper (live from services.gradle.org) */
  gradleVersion: string;
}> {
  const platform = options.platform ?? "paper";
  const norm = normalizeGameVersion(options.version);
  const version = norm.version;
  const pkg = options.packageName ?? "com.example.myplugin";
  const cls = options.className ?? "MyPlugin";
  const pluginName = options.pluginName ?? "MyPlugin";
  const root = options.projectRoot;

  const dependency = await resolveDependency({ platform, version });
  const gradleVersion = await latestGradleVersion();
  const apiVersion = pluginApiVersion(version);
  const pkgPath = path.join(root, "src", "main", "java", ...pkg.split("."));
  const resPath = path.join(root, "src", "main", "resources");

  await mkdir(pkgPath, { recursive: true });
  await mkdir(resPath, { recursive: true });

  const written: string[] = [];
  const write = async (rel: string, body: string) => {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, "utf8");
    written.push(rel);
  };

  await write(
    "settings.gradle.kts",
    `plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "${FOOJAY_RESOLVER_VERSION}"
}
rootProject.name = "${pluginName}"
`
  );

  // Strip the settings-comment header from resolve snippet for a clean build file
  const buildBody = dependency.gradleKotlin
    .replace(/^\/\/ settings\.gradle\.kts must include:[\s\S]*?\n\n/, "")
    .trimStart();
  await write("build.gradle.kts", buildBody);
  if (platform === "velocity") {
    // Proxy plugin: @Plugin main class; velocity-plugin.json comes from the annotation processor.
    await write(
      `src/main/java/${pkg.replaceAll(".", "/")}/${cls}.java`,
      renderTemplate("velocity_main", { packageName: pkg, className: cls, pluginName, version })
    );
  } else {
    await write(
      "src/main/resources/plugin.yml",
      `name: ${pluginName}
version: '\${version}'
main: ${pkg}.${cls}
api-version: '${apiVersion}'
${platform === "folia" ? "folia-supported: true\n" : ""}description: Scaffolded by mc-sdk
authors: [You]
`
    );
    await write(
      `src/main/java/${pkg.replaceAll(".", "/")}/${cls}.java`,
      renderTemplate("plugin_main", { packageName: pkg, className: cls, version })
    );
    await write(
      `src/main/java/${pkg.replaceAll(".", "/")}/${cls}Listener.java`,
      renderTemplate("listener", { packageName: pkg, className: cls, version })
    );
  }
  await write(
    ".gitignore",
    `.gradle/
build/
.idea/
*.iml
.mc-sdk.json
.cursor/
out/
`
  );
  await write(
    "build.ps1",
    renderTemplate("windows_build_ps1", { pluginName, version })
  );
  await write(
    "README.md",
    `# ${pluginName}

Scaffolded by mc-sdk for **${platform} ${version}**.

- Min Java: **${dependency.minJava}**
- Dependency: \`${dependency.exactVersion ?? dependency.versionNotation}\`
${platform === "velocity" ? "- Velocity: `@Plugin` annotation (velocity-plugin.json is generated at compile time)" : `- api-version: \`${apiVersion}\``}

\`\`\`bash
./gradlew build
# Windows non-ASCII paths (Cyrillic user folders): .\\build.ps1
\`\`\`

Generate wrapper if missing: \`gradle wrapper --gradle-version ${gradleVersion}\`

${norm.warning ? `> ${norm.warning}\n` : ""}${
      dependency.fallbackFrom
        ? `> Fell back from ${dependency.fallbackFrom} to paper-api — still runs on Purpur.\n`
        : ""
    }
`
  );

  return { written, dependency, versionWarning: norm.warning, gradleVersion };
}
