import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, after } from "node:test";
import {
  guessMinecraftVersion,
  loadProjectConfig,
  saveProjectConfig,
} from "../src/config.js";
import { detectVersionFromProject, pickBestDetection } from "../src/detect.js";
import { DOCS_CATALOG, searchDocsCatalog } from "../src/docs/papermc.js";
import {
  javadocBaseUrlFor,
  platformLabel,
  stripSnapshotSuffix,
} from "../src/platform.js";

describe("platform", () => {
  it("builds paper / velocity / folia / purpur JD bases", () => {
    assert.equal(
      javadocBaseUrlFor("paper", "1.21.1"),
      "https://jd.papermc.io/paper/1.21.1/"
    );
    assert.equal(
      javadocBaseUrlFor("velocity", "latest"),
      "https://jd.papermc.io/velocity/"
    );
    assert.equal(
      javadocBaseUrlFor("folia", "26.1.2"),
      "https://jd.papermc.io/folia/26.1.2/"
    );
    assert.equal(
      javadocBaseUrlFor("purpur", "1.21.1"),
      "https://purpurmc.org/javadoc/"
    );
    assert.equal(
      javadocBaseUrlFor("folia", "root"),
      "https://jd.papermc.io/folia/"
    );
  });

  it("labels platforms", () => {
    assert.equal(platformLabel("folia"), "Folia");
    assert.equal(platformLabel("velocity"), "Velocity");
    assert.equal(platformLabel("purpur"), "Purpur");
  });

  it("strips snapshot suffixes", () => {
    assert.equal(stripSnapshotSuffix("1.21.1-R0.1-SNAPSHOT"), "1.21.1");
    assert.equal(stripSnapshotSuffix("26.1.2"), "26.1.2");
    assert.equal(stripSnapshotSuffix("26.2.build.2609-stable"), "26.2");
    assert.equal(stripSnapshotSuffix("26.2.build.+"), "26.2");
  });
});

describe("config", () => {
  it("guesses minecraft version", () => {
    assert.equal(guessMinecraftVersion("1.21.1-R0.1-SNAPSHOT"), "1.21.1");
    assert.equal(guessMinecraftVersion("26.1.2"), "26.1.2");
  });

  it("saves and loads folia pin", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    const saved = await saveProjectConfig(root, "26.1.2", {
      platform: "folia",
      nms: false,
    });
    assert.equal(saved.platform, "folia");
    assert.equal(saved.folia, true);
    assert.equal(
      saved.javadocBaseUrl,
      "https://jd.papermc.io/folia/26.1.2/"
    );
    const loaded = await loadProjectConfig(root);
    assert.equal(loaded?.platform, "folia");
    assert.equal(loaded?.paperVersion, "26.1.2");
    const { CONFIG_FILENAME } = await import("../src/config.js");
    assert.equal(CONFIG_FILENAME, ".mc-sdk.json");
  });
});

describe("detect", () => {
  it("detects paper-api and prefers paperweight when present", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-det-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await writeFile(
      path.join(root, "build.gradle"),
      `
dependencies {
  compileOnly "io.papermc.paper:paper-api:1.21.1-R0.1-SNAPSHOT"
}
paperweight.paperDevBundle("1.21.1-R0.1-SNAPSHOT")
`
    );
    const hits = await detectVersionFromProject(root);
    assert.ok(hits.some((h) => h.platform === "paper" && h.version === "1.21.1"));
    const best = pickBestDetection(hits);
    assert.ok(best?.nms);
    assert.equal(best?.version, "1.21.1");
  });

  it("detects purpur-api", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-pur-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await writeFile(
      path.join(root, "build.gradle.kts"),
      `dependencies { compileOnly("org.purpurmc.purpur:purpur-api:1.21.1-R0.1-SNAPSHOT") }`
    );
    const hits = await detectVersionFromProject(root);
    const best = pickBestDetection(hits);
    assert.equal(best?.platform, "purpur");
    assert.equal(best?.version, "1.21.1");
  });

  it("detects velocity-api", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-vel-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await writeFile(
      path.join(root, "build.gradle.kts"),
      `dependencies { compileOnly("com.velocitypowered:velocity-api:3.4.0-SNAPSHOT") }`
    );
    const hits = await detectVersionFromProject(root);
    const best = pickBestDetection(hits);
    assert.equal(best?.platform, "velocity");
    assert.equal(best?.version, "3.4.0");
  });

  it("marks folia-supported paper hits", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-fol-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await mkdir(path.join(root, "src", "main", "resources"), { recursive: true });
    await writeFile(
      path.join(root, "build.gradle"),
      `compileOnly "io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT"`
    );
    await writeFile(
      path.join(root, "src", "main", "resources", "plugin.yml"),
      "name: X\nfolia-supported: true\napi-version: '1.21'\n"
    );
    const hits = await detectVersionFromProject(root);
    assert.ok(hits.some((h) => h.folia && h.version === "1.21.4"));
  });
});

describe("docs catalog", () => {
  it("has no obvious duplicate paths", () => {
    const paths = DOCS_CATALOG.map((p) => p.path);
    assert.equal(paths.length, new Set(paths).size);
  });

  it("includes verified Folia and Adventure paths", () => {
    const paths = new Set(DOCS_CATALOG.map((p) => p.path));
    assert.ok(paths.has("/paper/dev/api/component-api/"));
    assert.ok(paths.has("/paper/dev/data-component-api/"));
    assert.ok(paths.has("/paper/dev/registries/"));
    assert.ok(paths.has("/paper/dev/scheduler/"));
    assert.ok(paths.has("/paper/dev/entity-teleport/"));
    assert.ok(paths.has("/paper/dev/api/command-api/"));
    assert.ok(paths.has("/paper/dev/pdc/"));
    assert.ok(paths.has("/folia/"));
    assert.ok(paths.has("/paper/dev/folia-support/"));
  });

  it("search ranks adventure queries", () => {
    const hits = searchDocsCatalog("adventure component", 5);
    assert.ok(hits.length > 0);
    assert.ok(hits[0].path.includes("component") || hits[0].path.includes("adventure"));
  });

  it("search finds async / performance docs", () => {
    const hits = searchDocsCatalog("async main thread", 5);
    assert.ok(hits.some((h) => String(h.path).includes("scheduler") || h.url.includes("scheduler")));
  });

  it("search finds purpur docs", () => {
    const hits = searchDocsCatalog("purpur afk", 5);
    assert.ok(hits.some((h) => h.url.includes("purpurmc.org")));
  });
});

describe("templates", () => {
  it("renders async_io, async_cpu, async_secure, folia_region_task, purpur_build", async () => {
    const { renderTemplate } = await import("../src/templates.js");
    const asyncIo = renderTemplate("async_io", { className: "Demo", packageName: "x" });
    assert.ok(asyncIo.includes("runTaskAsynchronously"));
    assert.ok(asyncIo.includes("runTask"));
    const asyncCpu = renderTemplate("async_cpu", { className: "Demo", packageName: "x" });
    assert.ok(asyncCpu.includes("generation"));
    assert.ok(asyncCpu.includes("runTaskTimer"));
    const secure = renderTemplate("async_secure", { className: "Demo", packageName: "x" });
    assert.ok(secure.includes("AsyncPlayerPreLoginEvent"));
    assert.ok(secure.includes("runTaskAsynchronously"));
    const folia = renderTemplate("folia_region_task", { className: "Demo", packageName: "x" });
    assert.ok(folia.includes("getRegionScheduler"));
    assert.ok(folia.includes("getAsyncScheduler"));
    const purpur = renderTemplate("purpur_build", { version: "26.2" });
    assert.ok(purpur.includes("purpur-api:26.2.build.+"));
    assert.ok(purpur.includes("JavaLanguageVersion.of(25)"));
    assert.ok(purpur.includes("foojay-resolver"));
    assert.ok(purpur.includes("processResources"));
    const aliased = renderTemplate("purpur_build", { version: "1.26.2" });
    assert.ok(aliased.includes("26.2.build.+"));
  });

  it("paperweight_build is MOJANG_PRODUCTION on 26.2 without reobfJar", async () => {
    const { renderTemplate } = await import("../src/templates.js");
    const pw = renderTemplate("paperweight_build", { version: "26.2", pluginName: "X" });
    assert.ok(pw.includes("26.2.build.+"));
    assert.ok(pw.includes("MOJANG_PRODUCTION"));
    assert.ok(!/dependsOn\(tasks\.reobfJar\)/.test(pw));
    assert.ok(pw.includes("2.0.0-beta.21"));
    const nms = renderTemplate("nms_helper", { version: "26.2", className: "Auth" });
    assert.ok(nms.includes("ClientboundPlayerAbilitiesPacket"));
    assert.ok(!nms.includes("LightningBolt"));
    assert.ok(!nms.includes("visualLightning"));
  });
});

describe("versioning", () => {
  it("aliases 1.26.2 → 26.2 with warning", async () => {
    const { normalizeGameVersion, pluginApiVersion, paperApiDependencyNotation } =
      await import("../src/versioning.js");
    const n = normalizeGameVersion("1.26.2");
    assert.equal(n.version, "26.2");
    assert.equal(n.aliased, true);
    assert.ok(n.warning?.includes("26.2"));
    assert.equal(pluginApiVersion("26.2"), "1.21");
    assert.equal(paperApiDependencyNotation("26.2"), "io.papermc.paper:paper-api:26.2.build.+");
    assert.equal(
      paperApiDependencyNotation("1.21.1"),
      "io.papermc.paper:paper-api:1.21.1-R0.1-SNAPSHOT"
    );
  });

  it("requires MOJANG_PRODUCTION and Gradle 9 for 26.x userdev", async () => {
    const {
      requiresMojangProduction,
      minGradleForUserdev,
      paperDevBundleNotation,
    } = await import("../src/versioning.js");
    assert.equal(requiresMojangProduction("26.2"), true);
    assert.equal(requiresMojangProduction("1.21.11"), false);
    assert.equal(minGradleForUserdev("26.2"), "9.0");
    assert.equal(paperDevBundleNotation("26.2"), "26.2.build.+");
  });
});

describe("validateBuildGradle", () => {
  it("flags -R0.1-SNAPSHOT and Java 21 on 26.x builds", async () => {
    const { validateBuildGradle } = await import("../src/validateBuild.js");
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-val-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await writeFile(
      path.join(root, "build.gradle.kts"),
      `
java { toolchain.languageVersion.set(JavaLanguageVersion.of(21)) }
dependencies { compileOnly("io.papermc.paper:paper-api:1.26.2-R0.1-SNAPSHOT") }
`
    );
    await mkdir(path.join(root, "src", "main", "resources"), { recursive: true });
    await writeFile(
      path.join(root, "src", "main", "resources", "plugin.yml"),
      "name: X\napi-version: '1.20'\n"
    );
    const result = await validateBuildGradle(root, { expectedVersion: "26.2" });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.message.includes("1.26")));
    assert.ok(result.issues.some((i) => i.message.includes("R0.1-SNAPSHOT")));
  });

  it("flags reobfJar and Gradle 8 with userdev 2.x on 26.2", async () => {
    const { validateBuildGradle } = await import("../src/validateBuild.js");
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-val2-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await mkdir(path.join(root, "gradle", "wrapper"), { recursive: true });
    await writeFile(
      path.join(root, "build.gradle.kts"),
      `
plugins { id("io.papermc.paperweight.userdev") version "2.0.0-beta.21" }
dependencies { paperweight.paperDevBundle("26.2.build.+") }
tasks.assemble { dependsOn(tasks.reobfJar) }
`
    );
    await writeFile(
      path.join(root, "gradle", "wrapper", "gradle-wrapper.properties"),
      "distributionUrl=https\\\\://services.gradle.org/distributions/gradle-8.14.2-bin.zip\n"
    );
    const result = await validateBuildGradle(root, { expectedVersion: "26.2" });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.message.includes("reobfJar")));
    assert.ok(result.issues.some((i) => i.message.includes("Gradle 9")));
  });

  it("does not warn about Gradle 9 when wrapper is already 9.6.1", async () => {
    const { validateBuildGradle, parseGradleWrapperVersion } = await import(
      "../src/validateBuild.js"
    );
    assert.equal(
      parseGradleWrapperVersion(
        "distributionUrl=https\\://services.gradle.org/distributions/gradle-9.6.1-bin.zip"
      )?.raw,
      "9.6.1"
    );
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-val3-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await mkdir(path.join(root, "gradle", "wrapper"), { recursive: true });
    await writeFile(
      path.join(root, "build.gradle.kts"),
      `
plugins { id("io.papermc.paperweight.userdev") version "2.0.0-beta.21" }
dependencies { paperweight.paperDevBundle("26.2.build.+") }
paperweight.reobfArtifactConfiguration = io.papermc.paperweight.userdev.ReobfArtifactConfiguration.MOJANG_PRODUCTION
`
    );
    await writeFile(
      path.join(root, "gradle", "wrapper", "gradle-wrapper.properties"),
      "distributionUrl=https\\://services.gradle.org/distributions/gradle-9.6.1-bin.zip\n"
    );
    const result = await validateBuildGradle(root, { expectedVersion: "26.2" });
    assert.ok(!result.issues.some((i) => /Gradle 9/.test(i.message)));
  });
});

describe("cache", () => {
  it("inspects fresh vs miss and stores etag meta", async () => {
    const { setCached, inspectCached, clearCache, cacheDir } = await import(
      "../src/cache.js"
    );
    const key = `test:unit:${Date.now()}`;
    await setCached(key, "hello", { etag: '"abc"' });
    const hit = await inspectCached<string>(key, 60_000, 120_000);
    assert.equal(hit.status, "fresh");
    if (hit.status === "fresh") assert.equal(hit.value, "hello");
    const stale = await inspectCached<string>(key, 0, 120_000);
    assert.equal(stale.status, "stale");
    await clearCache({ prefix: "test:unit" });
    assert.ok(cacheDir().includes("mc-sdk"));
  });
});
