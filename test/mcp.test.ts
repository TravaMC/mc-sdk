/**
 * MCP layer: real Client ↔ createServer() over InMemoryTransport, no network.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { saveProjectConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import { TOOL_META } from "../src/tools/shared.js";

type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };

describe("MCP server (in-memory)", () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  let paperRoot = "";
  let proxyRoot = "";

  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as ToolResult;
  const body = (r: ToolResult) => r.content.map((c) => c.text ?? "").join("\n");

  before(async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await createServer().connect(serverT);
    await client.connect(clientT);
    paperRoot = await mkdtemp(path.join(tmpdir(), "mcsdk-mcp-paper-"));
    proxyRoot = await mkdtemp(path.join(tmpdir(), "mcsdk-mcp-proxy-"));
    await saveProjectConfig(paperRoot, "26.3", { platform: "paper" });
    await saveProjectConfig(proxyRoot, "4.3.1", { platform: "velocity" });
  });

  after(async () => {
    await client.close();
    await rm(paperRoot, { recursive: true, force: true });
    await rm(proxyRoot, { recursive: true, force: true });
  });

  it("registers every tool with a title and annotations", async () => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, Object.keys(TOOL_META).length);
    for (const t of tools) {
      assert.ok(t.title, `${t.name} has a title`);
      assert.equal(typeof t.annotations?.readOnlyHint, "boolean", `${t.name} readOnlyHint`);
      assert.ok(t.description && t.description.length > 20, `${t.name} description`);
    }
    const byName = new Map(tools.map((t) => [t.name, t]));
    assert.equal(byName.get("mc_search_api")?.annotations?.readOnlyHint, true);
    assert.equal(byName.get("mc_scaffold_project")?.annotations?.destructiveHint, true);
    assert.equal(byName.get("mc_set_version")?.annotations?.readOnlyHint, false);
  });

  it("serves resources and prompts", async () => {
    const { resources } = await client.listResources();
    assert.equal(resources.length, 12);
    const overview = await client.readResource({ uri: "minecraft://sdk/overview" });
    assert.match(String(overview.contents[0].text), /HARD RULE/);
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name).sort(), ["needs-nms", "new-paper-plugin", "offload-async"]);
    const p = await client.getPrompt({ name: "needs-nms", arguments: { feature: "fake player" } });
    assert.match(JSON.stringify(p.messages), /fake player/);
  });

  it("answers offline tools", async () => {
    const cfg = await call("mc_get_config", { projectRoot: paperRoot });
    assert.ok(!cfg.isError);
    assert.match(body(cfg), /"paperVersion": "26.3"/);

    const yml = await call("mc_template", { kind: "plugin_yml", projectRoot: paperRoot });
    assert.match(body(yml), /api-version: '26\.3'/);

    const vel = await call("mc_template", { kind: "velocity_build", projectRoot: proxyRoot });
    assert.match(body(vel), /velocity-api:4\.3\.1/);
    assert.match(body(vel), /JavaLanguageVersion\.of\(25\)/);

    const err = await call("mc_explain_error", { errorText: "Cannot set the time without a world clock" });
    assert.match(body(err), /world-clock-set-time/);

    const guide = await call("mc_paper26_guide");
    assert.match(body(guide), /26\.3/);

    const pluginYml = await call("mc_validate_plugin_yml", { content: "name: X\nversion: 1\n" });
    assert.match(body(pluginYml), /Missing required field 'main'/);
  });

  it("returns clear errors instead of throwing", async () => {
    const gated = await call("mc_lookup_material", { projectRoot: proxyRoot, query: "stone" });
    assert.equal(gated.isError, true);
    assert.match(body(gated), /mc_lookup_material needs a Paper\/Folia\/Purpur pin/);

    const cross = await call("mc_velocity_search_api", { projectRoot: paperRoot, query: "Player" });
    assert.equal(cross.isError, true);
    assert.match(body(cross), /cannot reuse/);

    const invented = await call("mc_search_api", { projectRoot: paperRoot, version: "26.1.2", query: "World" });
    assert.equal(invented.isError, true);
    assert.match(body(invented), /Do not switch to invented/);

    const blocked = await call("mc_docs_get", { pathOrUrl: "http://localhost:8080/admin" });
    assert.equal(blocked.isError, true);
    assert.match(body(blocked), /https/);

    const noPin = await call("mc_template", {
      kind: "plugin_yml",
      projectRoot: path.join(tmpdir(), "mcsdk-definitely-missing-pin"),
    });
    assert.equal(noPin.isError, true);
    assert.match(body(noPin), /Ask the user/i);
  });
});
