# Contributing to mc-sdk

## Development

```bash
npm install
npm run build
npm test
npm run check:docs
npm run smoke
```

Node **20.18.1+** (CI runs 22 and 24). `npm test` is offline (unit + an in-memory MCP client);
`npm run smoke` and `npm run check:docs` hit live PaperMC / Purpur / Mojang endpoints.

## Code layout

| Path | What lives there |
|------|------------------|
| `src/server.ts` | Assembles the MCP server (tools, resources, prompts) |
| `src/tools/*.ts` | One module per area: `version`, `api`, `docs`, `velocity`, `project`, `nms` |
| `src/tools/shared.ts` | `tool()` registration adapter + **`TOOL_META`** (title + annotations for every tool), result/pin helpers |
| `src/pin.ts` | The only place that resolves `.mc-sdk.json` (walk-up, version guard, platform family guard) |
| `src/javadoc/*` | Javadoc indexes (search, class pages, enums, deprecations, JD-lag fallback, Adventure) |
| `src/nms/*` | Mojang mappings (≤1.21.11) and the unobfuscated server.jar index (26.1+) |
| `src/docs/*` | Curated docs catalog, allowlisted fetch, HTML → Markdown |
| `src/util/*`, `src/cache.ts`, `src/meta.ts` | Version ordering, HTTP cache, package metadata / User-Agent |

### Adding a tool

1. Add an entry to `TOOL_META` in `src/tools/shared.ts` (title + `readOnlyHint` / `openWorldHint` / `destructiveHint`).
2. Register it with `tool(server, name, description, schema, handler)` in the matching module.
3. Resolve versions only through `requireVersion` / `requirePaperJd` (never read `.mc-sdk.json` directly).
4. `test/mcp.test.ts` fails if a tool lacks metadata.

## Guidance docs

Human- and agent-facing guides live under [`docs/`](docs/). MCP tools load them at runtime:

| File | Tool / resource |
|------|-----------------|
| `docs/api-vs-nms.md` | `mc_api_vs_nms` |
| `docs/async.md` | `mc_async_guide` |
| `docs/build-guidance.md` | `mc_build_guidance` |
| `docs/nms.md` | `mc_nms_guidance` themes |
| `docs/folia.md` | `mc_folia_guide` |
| `docs/purpur.md` | `mc_purpur_guide` |
| `docs/commands.md` | `mc_commands_guide` |
| `docs/velocity.md` | `mc_velocity_guide` |
| `docs/adventure.md` | `mc_adventure_guide` |
| `docs/paper-26.md` | `mc_paper26_guide` |

Edit the Markdown first, then smoke-test the matching tool.

## Scope

- Prefer accurate, version-aware lookups over inventing API members.
- Never invent Paper/MC version: ask the user (or confirm detect) before `mc_set_version` / scaffold.
- Adventure for all player text (Paper + Velocity + LimboAPI) — no Bungee legacy chat by default.
- Prefer non-deprecated Paper APIs; surface `prefer` / `warnings` from search (e.g. AsyncPlayerSpawnLocationEvent).
- Keep NMS guidance conservative: API-first, isolate internals, pin versions.
- Do not commit Mojang mapping dumps, Paper decompiled sources, or API keys.
- Keep the MCP tool count lean — Cursor’s catalog can drop tools near ~40 entries (currently 42; prefer extending an existing tool over adding one).

## Pull requests

1. Focused change + tests when behavior changes.  
2. Ensure CI is green (`build`, `test`, `check:docs`, `smoke`).
