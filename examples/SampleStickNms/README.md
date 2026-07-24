# SampleStickNms (Paper 1.21.1 + NMS)

Educational **paperweight-userdev** demo: right-click a blaze rod → **visual-only** lightning via NMS
`LightningBolt#setVisualOnly(true)` plus an action-bar packet.

Mappings were checked with **mc-sdk** (`mc_nms_class` on 1.21.1).

## Build

On Windows, if the user path contains non-ASCII characters, Gradle/paperweight often fails — use:

```powershell
cd examples\SampleStickNms
.\build.ps1
```

That builds under `C:\tmp\SampleStickNms` and copies the JAR back to `build\libs\`.

- `SampleStickNms-1.0.0-dev.jar` — for Paper (Mojang-mapped / remapped at runtime)
- `SampleStickNms-1.0.0.jar` — reobf

Put the **dev** jar in `plugins/` on Paper **1.21.1**.

## Prefer API

NMS breaks across versions. For production, prefer the Paper API
(`World#strikeLightningEffect` can do visual lightning — this project exists to practice paperweight).

See `docs/api-vs-nms.md` and `mc_api_vs_nms`.
