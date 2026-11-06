import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("util/versionCompare", () => {
  it("orders calendar, classic, velocity and pre-release ids", async () => {
    const { compareVersions, sortVersionsDesc } = await import("../src/util/versionCompare.js");
    assert.ok(compareVersions("26.3", "26.2") > 0);
    assert.ok(compareVersions("26.1.2", "26.1") > 0);
    assert.ok(compareVersions("26.1", "1.21.11") > 0);
    assert.ok(compareVersions("4.3.1", "4.2.1") > 0);
    assert.ok(compareVersions("26.3-rc-3", "26.3") < 0, "pre-release sorts before release");
    assert.ok(compareVersions("9.10", "9.7.1") > 0);
    assert.deepEqual(sortVersionsDesc(["1.21.11", "26.3", "26.1.2", "26.3"]), [
      "26.3",
      "26.1.2",
      "1.21.11",
    ]);
  });
});

describe("javadoc/indexParse", () => {
  it("extracts the array without eval, handling brackets inside strings", async () => {
    const { parseJsIndexArray } = await import("../src/javadoc/indexParse.js");
    const src =
      'typeSearchIndex = [{"p":"a.b","l":"Foo[]"},{"l":"Bar \\"q\\" ]"}];updateSearchResults();';
    const arr = parseJsIndexArray<{ p?: string; l: string }>(src, "typeSearchIndex");
    assert.equal(arr.length, 2);
    assert.equal(arr[0].l, "Foo[]");
    assert.equal(arr[1].l, 'Bar "q" ]');
    assert.throws(() => parseJsIndexArray("nothing here", "typeSearchIndex"));
  });
});

describe("cache / HttpStatusError", () => {
  it("treats 4xx as final and 5xx/408/429 as retryable", async () => {
    const { HttpStatusError } = await import("../src/cache.js");
    assert.equal(new HttpStatusError(404, "u").retryable, false);
    assert.equal(new HttpStatusError(403, "u").retryable, false);
    assert.equal(new HttpStatusError(429, "u").retryable, true);
    assert.equal(new HttpStatusError(408, "u").retryable, true);
    assert.equal(new HttpStatusError(503, "u").retryable, true);
  });
});

describe("pin resolution", () => {
  it("guards version and platform family, and gates Paper-only tools", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { saveProjectConfig } = await import("../src/config.js");
    const { resolvePin, isPinError } = await import("../src/pin.js");

    const paperRoot = await mkdtemp(path.join(tmpdir(), "mcsdk-pin-paper-"));
    const proxyRoot = await mkdtemp(path.join(tmpdir(), "mcsdk-pin-proxy-"));
    try {
      await saveProjectConfig(paperRoot, "26.3", { platform: "paper" });
      await saveProjectConfig(proxyRoot, "4.3.1", { platform: "velocity" });

      const ok = await resolvePin({ projectRoot: paperRoot });
      assert.ok(!isPinError(ok));
      if (!isPinError(ok)) {
        assert.equal(ok.version, "26.3");
        assert.equal(ok.minecraftVersion, "26.3");
      }

      // same family switch is allowed (Purpur JD for a Paper-line pin)
      const purpur = await resolvePin({ projectRoot: paperRoot, platform: "purpur" });
      assert.ok(!isPinError(purpur) && purpur.platform === "purpur");

      // alias of the pinned version is fine, another version is not
      assert.ok(!isPinError(await resolvePin({ projectRoot: paperRoot, version: "1.26.3" })));
      const other = await resolvePin({ projectRoot: paperRoot, version: "26.2" });
      assert.ok(isPinError(other) && /pinned to paper 26\.3/.test(other.error));

      // Minecraft pin + velocity lookups → refused (would search Velocity 26.3)
      const cross = await resolvePin({ projectRoot: paperRoot, platform: "velocity" });
      assert.ok(isPinError(cross) && /cannot reuse/.test(cross.error));

      // Velocity pin + Material lookup → clear error instead of a Paper JD 404
      const gated = await resolvePin({
        projectRoot: proxyRoot,
        requireFamily: "minecraft",
        tool: "mc_lookup_material",
      });
      assert.ok(isPinError(gated) && /mc_lookup_material needs a Paper/.test(gated.error));
      const proxy = await resolvePin({ projectRoot: proxyRoot, requireFamily: "proxy" });
      assert.ok(!isPinError(proxy) && proxy.version === "4.3.1" && !proxy.minecraftVersion);
    } finally {
      await rm(paperRoot, { recursive: true, force: true });
      await rm(proxyRoot, { recursive: true, force: true });
    }
  });
});
