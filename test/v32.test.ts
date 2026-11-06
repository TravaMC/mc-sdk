import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, after } from "node:test";

describe("toolchain / velocity / adventure (3.2)", () => {
  it("knows Velocity Java levels and userdev Gradle floors", async () => {
    const { velocityMinJava, minGradleForUserdevPlugin, compareGradleVersions } = await import(
      "../src/versioning.js"
    );
    assert.equal(velocityMinJava("4.3.1"), 25);
    assert.equal(velocityMinJava("3.5.1"), 21);
    assert.equal(velocityMinJava("3.4.0"), 17);
    assert.equal(minGradleForUserdevPlugin("2.0.0-beta.21"), "9.0");
    assert.equal(minGradleForUserdevPlugin("2.0.0-beta.24"), "9.7.1");
    assert.equal(minGradleForUserdevPlugin("1.7.7"), "8.8");
    assert.ok(compareGradleVersions("9.6.1", "9.7.1") < 0);
    assert.ok(compareGradleVersions("9.10", "9.7.1") > 0);
  });

  it("velocity_build template uses Java 25 for velocity-api 4.x", async () => {
    const { renderTemplate } = await import("../src/templates.js");
    const v4 = renderTemplate("velocity_build", { version: "4.3.1" });
    assert.ok(v4.includes("velocity-api:4.3.1"));
    assert.ok(v4.includes("JavaLanguageVersion.of(25)"));
    const v3 = renderTemplate("velocity_build", { version: "3.4.0" });
    assert.ok(v3.includes("JavaLanguageVersion.of(17)"));
    const paper = renderTemplate("paper_build", { version: "26.3" });
    assert.ok(paper.includes('foojay-resolver-convention") version "1.0.0"'));
    assert.ok(!paper.includes("0.9.0"));
    const yml = renderTemplate("plugin_yml", { version: "26.3" });
    assert.ok(yml.includes("api-version: '26.3'"));
  });

  it("picks Adventure 5 for 26.2+/Velocity 4 and 4 for older lines", async () => {
    const { adventureMajorFor } = await import("../src/javadoc/adventure.js");
    assert.equal(adventureMajorFor("paper", "26.3"), 5);
    assert.equal(adventureMajorFor("purpur", "26.2"), 5);
    assert.equal(adventureMajorFor("paper", "26.1.2"), 4);
    assert.equal(adventureMajorFor("paper", "1.21.11"), 4);
    assert.equal(adventureMajorFor("velocity", "4.3.1"), 5);
    assert.equal(adventureMajorFor("velocity", "3.4.0"), 4);
    assert.equal(adventureMajorFor(undefined, undefined), 5);
  });

  it("validator flags velocity-api 4 on Java 21 and userdev beta.24 on Gradle 9.6.1", async () => {
    const { validateBuildGradle, parseUserdevVersion } = await import("../src/validateBuild.js");
    assert.equal(
      parseUserdevVersion('plugins { id("io.papermc.paperweight.userdev") version "2.0.0-beta.24" }'),
      "2.0.0-beta.24"
    );
    const root = await mkdtemp(path.join(tmpdir(), "mpsdk-val4-"));
    after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await writeFile(
      path.join(root, "build.gradle.kts"),
      [
        "java { toolchain.languageVersion.set(JavaLanguageVersion.of(21)) }",
        'dependencies { compileOnly("com.velocitypowered:velocity-api:4.3.1") }',
        "",
      ].join("\n")
    );
    const vel = await validateBuildGradle(root, { platform: "velocity" });
    assert.equal(vel.ok, false);
    assert.ok(vel.issues.some((i) => /velocity-api 4\.x requires Java 25/.test(i.message)));

    await mkdir(path.join(root, "gradle", "wrapper"), { recursive: true });
    await writeFile(
      path.join(root, "build.gradle.kts"),
      [
        'plugins { id("io.papermc.paperweight.userdev") version "2.0.0-beta.24" }',
        'dependencies { paperweight.paperDevBundle("26.3.build.+") }',
        "paperweight.reobfArtifactConfiguration = io.papermc.paperweight.userdev.ReobfArtifactConfiguration.MOJANG_PRODUCTION",
        "",
      ].join("\n")
    );
    await writeFile(
      path.join(root, "gradle", "wrapper", "gradle-wrapper.properties"),
      "distributionUrl=https\\://services.gradle.org/distributions/gradle-9.6.1-bin.zip\n"
    );
    const pw = await validateBuildGradle(root, { expectedVersion: "26.3" });
    assert.ok(pw.issues.some((i) => i.severity === "error" && /9\.7\.1/.test(i.message)));
  });
});

/** Minimal class-file builder (no javac needed): one field, one method, one synthetic method. */
function buildClassFile(): Buffer {
  const pool: Buffer[] = [];
  const utf8 = (sv: string) => {
    const b = Buffer.from(sv, "utf8");
    const h = Buffer.alloc(3);
    h[0] = 1;
    h.writeUInt16BE(b.length, 1);
    pool.push(Buffer.concat([h, b]));
    return pool.length;
  };
  const cls = (nameIdx: number) => {
    const h = Buffer.alloc(3);
    h[0] = 7;
    h.writeUInt16BE(nameIdx, 1);
    pool.push(h);
    return pool.length;
  };
  const thisCls = cls(utf8("net/minecraft/world/Demo"));
  const superCls = cls(utf8("net/minecraft/world/Base"));
  const iface = cls(utf8("java/lang/Runnable"));
  const fName = utf8("connection");
  const fDesc = utf8("Lnet/minecraft/server/network/Conn;");
  const mName = utf8("setPos");
  const mDesc = utf8("(DD[I)Z");
  const sName = utf8("lambda$x$0");
  const sDesc = utf8("()V");
  const u2 = (n: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n);
    return b;
  };
  const header = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 69]);
  return Buffer.concat([
    header,
    u2(pool.length + 1),
    ...pool,
    u2(0x0021), // public super
    u2(thisCls),
    u2(superCls),
    u2(1),
    u2(iface),
    u2(1), // fields
    u2(0x0001), u2(fName), u2(fDesc), u2(0),
    u2(2), // methods
    u2(0x0009), u2(mName), u2(mDesc), u2(0),
    u2(0x1002), u2(sName), u2(sDesc), u2(0),
    u2(0), // class attributes
  ]);
}

/** Minimal stored (method 0) ZIP writer for tests. */
function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt32LE(f.data.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt32LE(f.data.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + f.data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

describe("nms server.jar index (26.1+)", () => {
  it("parses class files into a mapping-style block", async () => {
    const { parseClassFile, classToMappingBlock, methodDescriptorToJava } = await import(
      "../src/nms/serverJar.js"
    );
    assert.deepEqual(methodDescriptorToJava("(DD[I)Z"), {
      params: ["double", "double", "int[]"],
      returns: "boolean",
    });
    const cls = parseClassFile(buildClassFile());
    assert.equal(cls.name, "net/minecraft/world/Demo");
    assert.equal(cls.superName, "net/minecraft/world/Base");
    const block = classToMappingBlock(cls);
    assert.match(block, /^net\.minecraft\.world\.Demo -> net\.minecraft\.world\.Demo:/);
    assert.match(block, /# extends net\.minecraft\.world\.Base implements java\.lang\.Runnable/);
    assert.match(block, /public net\.minecraft\.server\.network\.Conn connection -> connection/);
    assert.match(block, /public static boolean setPos\(double,double,int\[\]\) -> setPos/);
    assert.ok(!block.includes("lambda$x$0"), "synthetic members are skipped");
  });

  it("reads a bundler jar (versions.list → nested server jar)", async () => {
    const { buildIndexFromServerJar } = await import("../src/nms/serverJar.js");
    const inner = buildZip([
      { name: "net/minecraft/world/Demo.class", data: buildClassFile() },
      { name: "data/minecraft/recipe/x.json", data: Buffer.from("{}") },
    ]);
    const outer = buildZip([
      { name: "META-INF/versions.list", data: Buffer.from("abc\t26.9\t26.9/server-26.9.jar\n") },
      { name: "META-INF/versions/26.9/server-26.9.jar", data: inner },
    ]);
    const text = buildIndexFromServerJar(outer, "26.9");
    assert.match(text, /net\.minecraft\.world\.Demo -> net\.minecraft\.world\.Demo:/);
    assert.ok(!text.includes("recipe"));
  });
});
