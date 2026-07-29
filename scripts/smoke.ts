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

    console.log("\nSMOKE OK");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
