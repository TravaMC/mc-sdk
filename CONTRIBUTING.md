# Contributing to mc-sdk

## Development

```bash
npm install
npm run build
npm test
npm run check:docs
npm run smoke
```

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

Edit the Markdown first, then smoke-test the matching tool.

## Scope

- Prefer accurate, version-aware lookups over inventing API members.
- Never invent Paper/MC version: ask the user (or confirm detect) before `mc_set_version` / scaffold.
- Adventure for all player text (Paper + Velocity + LimboAPI) — no Bungee legacy chat by default.
- Keep NMS guidance conservative: API-first, isolate internals, pin versions.
- Do not commit Mojang mapping dumps, Paper decompiled sources, or API keys.
- Keep the MCP tool count lean — Cursor’s catalog can drop tools near ~40 entries.

## Pull requests

1. Focused change + tests when behavior changes.  
2. Ensure CI is green (`build`, `test`, `check:docs`, `smoke`).
