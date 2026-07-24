# Examples (optional)

These folders are **demos** for learning. They are **not** required to run the MCP server and are excluded from the npm package.

| Example | What it shows |
|---------|----------------|
| [`SampleStick`](./SampleStick/) | API-only Paper plugin (PDC item, interact, Adventure) |
| [`SampleAsync`](./SampleAsync/) | Snapshot → async CPU → batched particles (`/sampleasync spiral`) |
| [`SampleStickNms`](./SampleStickNms/) | paperweight-userdev + Mojang-mapped NMS (visual lightning) |
| [`SampleVelocity`](./SampleVelocity/) | Velocity proxy plugin (`/sampleping`, Adventure) |

## Requirements

- JDK 21+
- Gradle wrapper (already present in each example)

## Windows note

If your user path contains non-ASCII characters, paperweight builds may fail. Use `SampleStickNms/build.ps1` or see `docs/build-guidance.md` / `mc_build_guidance`.

## Prefer API + async

The NMS example is educational. Production plugins should follow `docs/api-vs-nms.md` and default to the Paper API.

Never block the server tick with HTTP/DB/disk/heavy math — see `docs/async.md` / `mc_async_guide`. Folia: `docs/folia.md`. Commands: `docs/commands.md`.
