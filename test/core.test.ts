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

describe("events scoring (offline helpers)", () => {
  it("stems scenario words, expands synonyms and splits event names", async () => {
    const { stem, scenarioTokens, eventNameWords } = await import("../src/events.js");
    assert.equal(stem("swings"), "swing");
    assert.equal(stem("broken"), "break");
    assert.equal(stem("breaking"), "break");
    assert.deepEqual(eventNameWords("PlayerArmSwingEvent"), ["player", "arm", "swing"]);
    assert.deepEqual(eventNameWords("TNTPrimeEvent"), ["tnt", "prime"]);
    const toks = scenarioTokens("the player hits a zombie");
    assert.ok(toks.includes("damage"), "hit → damage synonym");
    assert.ok(!toks.includes("the"));
  });
});

describe("curated deprecations are version-gated", () => {
  it("only flags PlayerSpawnLocationEvent / PlayerAnimationEvent from their since version", async () => {
    const { curatedAnnotation } = await import("../src/javadoc/deprecation.js");
    const spigot = "org.spigotmc.event.player";
    assert.equal(curatedAnnotation("PlayerSpawnLocationEvent", spigot, "1.21.1"), undefined);
    assert.equal(curatedAnnotation("PlayerSpawnLocationEvent", spigot, "26.3")?.deprecated, true);
    assert.equal(curatedAnnotation("PlayerAnimationEvent", "org.bukkit.event.player", "26.2"), undefined);
    assert.equal(
      curatedAnnotation("PlayerAnimationEvent", "org.bukkit.event.player", "26.3")?.prefer,
      "PlayerArmSwingEvent"
    );
    // Purpur's unversioned JD ("") keeps the note
    assert.equal(curatedAnnotation("PlayerAnimationEvent", undefined, "")?.deprecated, true);
  });
});

describe("docs fetching", () => {
  it("allows only https documentation hosts", async () => {
    const { resolveDocsUrl } = await import("../src/docs/papermc.js");
    assert.equal(resolveDocsUrl("/paper/dev/userdev/"), "https://docs.papermc.io/paper/dev/userdev/");
    assert.equal(resolveDocsUrl("paper/dev/api/"), "https://docs.papermc.io/paper/dev/api/");
    assert.throws(() => resolveDocsUrl("http://localhost:8080/"), /https/);
    assert.throws(() => resolveDocsUrl("https://169.254.169.254/latest"), /not an allowed/);
    assert.throws(() => resolveDocsUrl("https://evil.example/papermc.io"), /not an allowed/);
  });

  it("renders headings, code blocks, lists, tables and notes as Markdown", async () => {
    const { htmlToMarkdown } = await import("../src/docs/htmlToMarkdown.js");
    const html = `<html><head><title>T</title></head><body><nav>menu</nav><main>
      <h1>Title<a class="sl-anchor-link" href="#t">Section titled “Title”</a></h1>
      <p>Use <code>paperweight</code> <a href="/paper/dev/">docs</a>.</p>
      <pre data-language="kotlin"><code>plugins {
  java
}</code></pre>
      <ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>
      <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
      <aside><p>Note text</p></aside>
    </main></body></html>`;
    const { title, markdown } = htmlToMarkdown(html, "https://docs.papermc.io/x/");
    assert.equal(title, "Title");
    assert.match(markdown, /^# Title$/m);
    assert.ok(!markdown.includes("Section titled"));
    assert.ok(!markdown.includes("menu"));
    assert.match(markdown, /Use `paperweight` \[docs\]\(https:\/\/docs\.papermc\.io\/paper\/dev\/\)\./);
    assert.match(markdown, /```kotlin\nplugins \{\n  java\n\}\n```/);
    assert.match(markdown, /- one\n- two\n  - nested/);
    assert.match(markdown, /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
    assert.match(markdown, /> Note text/);
  });
});

describe("detect: version catalogs and run-paper", () => {
  it("finds versions in libs.versions.toml and prefers the newest", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { detectVersionFromProject, pickBestDetection } = await import("../src/detect.js");
    const root = await mkdtemp(path.join(tmpdir(), "mcsdk-detect-"));
    try {
      await mkdir(path.join(root, "gradle"), { recursive: true });
      await writeFile(
        path.join(root, "gradle", "libs.versions.toml"),
        '[versions]\npaper = "26.3.build.244-stable"\n\n[libraries]\npaper-api = { module = "io.papermc.paper:paper-api", version.ref = "paper" }\n'
      );
      await writeFile(
        path.join(root, "build.gradle.kts"),
        'tasks.runServer { minecraftVersion("26.2") }\n'
      );
      const hits = await detectVersionFromProject(root);
      assert.ok(hits.some((h) => h.version === "26.3" && h.source === "version catalog paper"));
      assert.ok(hits.some((h) => h.version === "26.2" && h.source === "run-paper minecraftVersion"));
      assert.equal(pickBestDetection(hits)?.version, "26.3");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("review regressions (3.3.0)", () => {
  it("stems verb forms that drop a silent e", async () => {
    const { stem, stems } = await import("../src/events.js");
    assert.equal(stem("moves"), "move");
    assert.ok(stems("moved").includes("move"));
    assert.ok(stems("moving").includes("move"));
    assert.ok(stems("mined").includes("mine"));
    assert.equal(stem("pushes"), "push");
    assert.equal(stem("swings"), "swing");
  });

  it("finds events for moves / mined / damaged against a fixed index (offline)", async () => {
    const { primeSearchIndexMemo, clearSearchIndexMemo } = await import("../src/javadoc/search.js");
    const { findEventsByScenario } = await import("../src/events.js");
    const t = (p: string, l: string) => ({ p, l });
    primeSearchIndexMemo("99.1", "paper", {
      types: [
        t("org.bukkit.event.player", "PlayerMoveEvent"),
        t("org.bukkit.event.block", "BlockBreakEvent"),
        t("org.bukkit.event.entity", "EntityDamageEvent"),
        t("org.bukkit.event.entity", "EntityDamageByEntityEvent"),
        t("org.bukkit.event.player", "PlayerAnimationEvent"),
        t("io.papermc.paper.event.player", "PlayerArmSwingEvent"),
        t("org.bukkit.event.world", "ChunkLoadEvent"),
      ],
      members: [],
      packages: [],
    });
    try {
      const names = async (s: string, pin?: string) =>
        (await findEventsByScenario("99.1", s, 5, "paper", pin)).events.map((e) => e.name);
      assert.equal((await names("when a player moves"))[0], "PlayerMoveEvent");
      assert.equal((await names("player moved to another chunk"))[0], "PlayerMoveEvent");
      assert.equal((await names("block mined by player"))[0], "BlockBreakEvent");
      assert.equal((await names("entity damaged by another entity"))[0], "EntityDamageEvent");
      // gating follows the pin, not the (older) Javadoc tree
      const anim = await findEventsByScenario("99.1", "player animation", 5, "paper", "26.3");
      const legacy = anim.events.find((e) => e.name === "PlayerAnimationEvent");
      assert.equal(legacy?.prefer, "PlayerArmSwingEvent");
      const old = await findEventsByScenario("99.1", "player animation", 5, "paper", "26.2");
      assert.equal(old.events.find((e) => e.name === "PlayerAnimationEvent")?.deprecated, undefined);
    } finally {
      clearSearchIndexMemo();
    }
  });

  it("class pages gate curated deprecations by the pin when the JD lags", async () => {
    const { parseClassHtml } = await import("../src/javadoc/parse.js");
    const html =
      '<html><body><h1 class="title">Class PlayerAnimationEvent</h1>' +
      '<div class="sub-title"><a>org.bukkit.event.player</a></div>' +
      '<div class="type-signature">public class PlayerAnimationEvent</div></body></html>';
    const url = "https://jd.papermc.io/folia/26.2/org/bukkit/event/player/PlayerAnimationEvent.html";
    assert.equal(parseClassHtml("26.2", url, html, "26.3").annotation.prefer, "PlayerArmSwingEvent");
    assert.equal(parseClassHtml("26.2", url, html).annotation.prefer, undefined);
  });

  it("does not apply Paper 26.x heuristics to Velocity builds", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { validateBuildGradle } = await import("../src/validateBuild.js");
    const root = await mkdtemp(path.join(tmpdir(), "mcsdk-vel-"));
    try {
      await writeFile(
        path.join(root, "build.gradle.kts"),
        [
          "java { toolchain.languageVersion.set(JavaLanguageVersion.of(21)) }",
          'dependencies { compileOnly("com.velocitypowered:velocity-api:3.4.0")',
          '  compileOnly("org.jetbrains:annotations:26.0.2") }',
        ].join("\n")
      );
      const r = await validateBuildGradle(root, { platform: "velocity", expectedVersion: "3.4.0" });
      assert.deepEqual(r.issues, []);
      // unpinned Paper project with the same jetbrains dep is not "26.x" either
      const p = await validateBuildGradle(root, {});
      assert.ok(!p.issues.some((i) => /26\.x|foojay/.test(i.message)));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("mc_cache_clear also drops in-memory indexes", async () => {
    const { primeSearchIndexMemo, searchIndexMemoSize } = await import("../src/javadoc/search.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createServer } = await import("../src/server.js");
    primeSearchIndexMemo("99.2", "paper", { types: [], members: [], packages: [] });
    assert.ok(searchIndexMemoSize() > 0);
    const [c, s] = InMemoryTransport.createLinkedPair();
    await createServer().connect(s);
    const client = new Client({ name: "t", version: "1" });
    await client.connect(c);
    await client.callTool({ name: "mc_cache_clear", arguments: { prefix: "zz-no-such-key-zz" } });
    assert.equal(searchIndexMemoSize(), 0);
    await client.close();
  });
});
