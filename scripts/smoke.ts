/**
 * Smoke test including Velocity + Paper paths.
 */
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { saveProjectConfig, loadProjectConfig } from "../src/config.js";
import { searchApi } from "../src/javadoc/search.js";
import { fetchClassDoc } from "../src/javadoc/parse.js";
import { listVelocityVersionsWithJavadoc } from "../src/velocity/versions.js";
import { buildGuidanceMarkdown } from "../src/guidance.js";

function assert(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Error(`SMOKE assertion failed: ${what}`);
}

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "mc-sdk-"));
  try {
    await saveProjectConfig(tmp, "3.4.0", { platform: "velocity" });
    console.log("velocity config:", await loadProjectConfig(tmp));

    const vSearch = await searchApi("3.4.0", "ProxyServer", {
      platform: "velocity",
      scope: "types",
      limit: 3,
    });
    console.log(
      "velocity types:",
      vSearch.types.map((t) => `${t.package}.${t.name}`)
    );

    const doc = await fetchClassDoc("3.4.0", "ProxyServer", undefined, "velocity");
    console.log("velocity class:", doc.title, "methods:", doc.methods.length);

    const versions = await listVelocityVersionsWithJavadoc(8);
    console.log(
      "velocity jd:",
      versions.filter((v) => v.hasJavadoc).map((v) => v.version)
    );

    await saveProjectConfig(tmp, "1.21.1", { platform: "paper", nms: true });
    const paper = await searchApi("1.21.1", "PlayerInteractEvent", {
      platform: "paper",
      scope: "types",
      limit: 1,
    });
    console.log("paper:", paper.types[0]?.name);

    await saveProjectConfig(tmp, "26.1.2", { platform: "folia" });
    const folia = await searchApi("26.1.2", "RegionizedServer", {
      platform: "folia",
      scope: "types",
      limit: 3,
    });
    console.log(
      "folia types:",
      folia.types.map((t) => t.name).join(", ") || "(none — OK if index differs)"
    );

    console.log("guidance bytes:", (await buildGuidanceMarkdown()).length);

    const { asyncGuidanceMarkdown, foliaGuidanceMarkdown } = await import(
      "../src/guidance.js"
    );
    console.log("async guide bytes:", (await asyncGuidanceMarkdown()).length);
    console.log("folia guide bytes:", (await foliaGuidanceMarkdown()).length);
    const { commandsGuidanceMarkdown, adventureGuidanceMarkdown, velocityGuidanceMarkdown } =
      await import("../src/guidance.js");
    console.log("commands guide bytes:", (await commandsGuidanceMarkdown()).length);
    console.log("adventure guide bytes:", (await adventureGuidanceMarkdown()).length);
    console.log("velocity guide bytes:", (await velocityGuidanceMarkdown()).length);
    const { paper26GuidanceMarkdown } = await import("../src/guidance.js");
    console.log("paper26 guide bytes:", (await paper26GuidanceMarkdown()).length);
    const { explainRuntimeError } = await import("../src/hints/runtime.js");
    console.log(
      "runtime hint:",
      explainRuntimeError("Cannot set the time without a world clock").matches[0]?.id
    );

    await saveProjectConfig(tmp, "1.21.1", { platform: "purpur" });
    const purpur = await searchApi("", "PlayerAFKEvent", {
      platform: "purpur",
      scope: "types",
      limit: 3,
    });
    console.log(
      "purpur types:",
      purpur.types.map((t) => t.name).join(", ") || "(none)"
    );
    const { purpurGuidanceMarkdown } = await import("../src/guidance.js");
    console.log("purpur guide bytes:", (await purpurGuidanceMarkdown()).length);

    // —— 3.2: current 26.3 / Velocity 4.3.1 paths (live) ——
    const { resolveJavadocPath, isKnownRelease } = await import("../src/javadoc/available.js");
    const { resolveDependency } = await import("../src/deps/resolve.js");
    const { searchAdventure } = await import("../src/javadoc/adventure.js");
    const { latestUserdev, latestGradleVersion } = await import("../src/toolchain.js");

    const p263 = await searchApi("26.3", "AsyncPlayerSpawnLocationEvent", {
      platform: "paper",
      scope: "types",
      limit: 1,
    });
    assert(p263.types[0]?.name === "AsyncPlayerSpawnLocationEvent", "paper 26.3 JD search");
    console.log("paper 26.3:", p263.types[0]?.name);

    const v431 = await resolveJavadocPath("velocity", "4.3.1");
    assert(v431.jdVersion !== "", "velocity 4.3.1 JD path");
    assert(await isKnownRelease("velocity", "4.3.1"), "velocity 4.3.1 is a Fill release");
    console.log("velocity 4.3.1 →", v431.jdVersion, v431.fallback ? "(fallback)" : "");
    const vel = await searchApi(v431.jdVersion, "ProxyServer", {
      platform: "velocity",
      scope: "types",
      limit: 1,
    });
    assert(vel.types[0]?.name === "ProxyServer", "velocity 4.x search");

    const f263 = await resolveJavadocPath("folia", "26.3");
    console.log("folia 26.3 →", f263.jdVersion, f263.fallback ? "(fallback)" : "");

    const velDep = await resolveDependency({ platform: "velocity", version: "4.3.1" });
    assert(velDep.minJava === 25, "velocity 4.3.1 needs Java 25");
    assert(velDep.gradleKotlin.includes("JavaLanguageVersion.of(25)"), "velocity snippet Java 25");
    console.log("velocity dep minJava:", velDep.minJava);

    const paperDep = await resolveDependency({ platform: "paper", version: "26.3", nms: true });
    console.log(
      "paper 26.3 nms:",
      paperDep.nms?.userdevPlugin,
      "gradle",
      paperDep.nms?.minGradle,
      paperDep.exactVersion,
      "api-version",
      paperDep.apiVersion
    );
    assert(paperDep.apiVersion === "26.3", "api-version 26.3");

    const purDep = await resolveDependency({ platform: "purpur", version: "26.3" });
    console.log("purpur 26.3:", purDep.exactVersion ?? purDep.versionNotation);

    const adv5 = await searchAdventure("ClickEvent", 2);
    const adv4 = await searchAdventure("ClickEvent", 2, { major: 4 });
    assert(adv5.hits.length > 0 && adv4.hits.length > 0, "adventure 5 + 4 search");
    console.log("adventure:", adv5.adventureVersion, "/", adv4.adventureVersion);

    const ud = await latestUserdev();
    console.log("userdev:", ud.version, "needs Gradle", ud.minGradle, `(${ud.source})`);
    console.log("gradle current:", await latestGradleVersion());

    console.log("\nSMOKE OK");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
