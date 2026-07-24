# mc-sdk

MCP server for **Paper**, **Folia**, **Purpur**, and **Velocity** plugin development: versioned Javadocs, PaperMC docs, Hangar search, templates, and **Mojang-mapped NMS** lookups.

Agents should pin a platform/version, then look up APIs instead of inventing members from training data.

[![CI](https://github.com/TsuckermanDev/mc-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/TsuckermanDev/mc-sdk/actions/workflows/ci.yml)

## Platforms

| Platform | Javadocs | Pin |
|----------|----------|-----|
| Paper | https://jd.papermc.io/paper/{version}/ | `mc_set_version` `platform=paper` |
| Folia | https://jd.papermc.io/folia/{version}/ | `mc_set_version` `platform=folia` |
| Purpur | https://purpurmc.org/javadoc/ | `mc_set_version` `platform=purpur` |
| Velocity | https://jd.papermc.io/velocity/{version}/ | `mc_set_version` `platform=velocity` |

Project memory: `.mc-sdk.json` (+ Cursor rule `.cursor/rules/mc-sdk.mdc`).  
Still reads legacy `.minecraft-plugin-sdk.json` and `.paper-mcp.json`.

## Requirements

- Node.js **18+**
- Network access to Paper / Purpur / Mojang endpoints (cached under `~/.cache/mc-sdk`)

## Install (local / Cursor)

```bash
git clone https://github.com/TsuckermanDev/mc-sdk.git
cd mc-sdk
npm install
npm run build
npm link          # optional — puts `mc-sdk` on PATH
```

### Cursor MCP config

Prefer an absolute `node` path so reloads cannot stick to a stale PATH shim:

```json
{
  "mcpServers": {
    "mc-sdk": {
      "command": "node",
      "args": ["C:\\\\path\\\\to\\\\mc-sdk\\\\dist\\\\index.js"]
    }
  }
}
```

After code changes: `npm run build`, then **toggle MCP Off→On**. Soft reload often keeps a stale Node process.

Verify with **`mc_cache_stats`** → `sdkPackageVersion` (expect `3.0.0`+). Confirm `mc_resolve_dependency` appears in the tool list.

Keep **one** MCP entry only (do not also run `cmd /c mc-sdk` in parallel).

If the catalog stays incomplete:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'mc-sdk|minecraft-plugin-sdk' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Then toggle the server again (or restart Cursor).

See [`mcp.json.example`](mcp.json.example).

## Core tools

| Area | Tools |
|------|--------|
| Version | `mc_set_version`, `mc_get_config`, `mc_detect_version`, `mc_list_versions`, `mc_paper_builds`, **`mc_resolve_dependency`** |
| Paper / Folia API | `mc_search_api`, `mc_get_class`, `mc_lookup_*`, `mc_find_event`, `mc_diff_api` |
| Velocity | `mc_velocity_list_versions`, `mc_velocity_search_api`, `mc_velocity_get_class`, `mc_velocity_guide` |
| Docs | `mc_docs_search`, `mc_docs_get`, `mc_adventure_search`, `mc_folia_guide`, **`mc_async_guide`**, `mc_commands_guide`, `mc_purpur_guide` |
| **API vs NMS** | **`mc_api_vs_nms`**, `mc_build_guidance`, `mc_nms_guidance`, `mc_remapper_guidance` |
| Project | **`mc_scaffold_project`**, **`mc_validate_build_gradle`**, `mc_validate_plugin_yml`, `mc_template`, `mc_hangar_search`, `mc_cache_stats`, `mc_cache_clear` |
| NMS lookup | `mc_nms_search`, `mc_nms_class` |

**26.x tip:** do not invent `1.26.2-R0.1-SNAPSHOT` — call `mc_resolve_dependency`. Alias `1.26.2` → `26.2` is automatic with a warning. NMS on 26.1+: `nms: true`, `MOJANG_PRODUCTION`, no `reobfJar`.

## Guidance docs

- [docs/async.md](docs/async.md) — main thread vs async  
- [docs/commands.md](docs/commands.md) — classic vs Brigadier  
- [docs/purpur.md](docs/purpur.md) — Purpur-only APIs  
- [docs/folia.md](docs/folia.md) — region schedulers  
- [docs/api-vs-nms.md](docs/api-vs-nms.md) — when NMS is justified  
- [docs/build-guidance.md](docs/build-guidance.md) — toolchain / Windows paths  
- [docs/nms.md](docs/nms.md) — paperweight workflow  
- [docs/velocity.md](docs/velocity.md) — proxy plugins  

**Default:** Paper API (+ Adventure). Never block the tick thread with HTTP/DB/disk (`mc_async_guide`).

## Typical workflows

**Paper API:** pin → `mc_resolve_dependency` / `mc_scaffold_project` → `mc_search_api`  

**Purpur:** pin `platform=purpur` → `mc_resolve_dependency` → `mc_purpur_guide`  

**NMS:** `mc_api_vs_nms` → `mc_resolve_dependency` `nms: true` → verify members in `paperDevBundle` / `compileJava`  

**Async:** `mc_async_guide` → `mc_template` (`async_io` / `async_cpu` / `async_secure`)

## Cache

HTTP/Javadoc responses live under `~/.cache/mc-sdk` (not in your plugin project). Auto TTL / ETag revalidation; optional `mc_cache_stats` / `mc_cache_clear`.

Mojang mappings are for local development only — do not redistribute dumps.

## Examples

Optional demos under [`examples/`](examples/) (not in the npm tarball). See [examples/README.md](examples/README.md).

## Develop

```bash
npm install
npm run build
npm test
npm run check:docs
npm run smoke
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Publish checklist (maintainers)

1. `npm run build && npm test && npm run smoke`  
2. Tag `v3.0.0` (or current version) and push.  
3. Optional: `npm publish` (package name `mc-sdk`).

## License

MIT — see [LICENSE](LICENSE). Mojang/Minecraft assets and mappings remain under their respective terms.

## Rename note (3.0.0)

Formerly **minecraft-plugin-sdk**. Config: write `.mc-sdk.json`; still reads `.minecraft-plugin-sdk.json`. Cache dir: `~/.cache/mc-sdk`. CLI / MCP id: `mc-sdk`.
