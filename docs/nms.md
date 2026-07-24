# NMS and paperweight (Paper)

Prefer the **Paper API**. Use NMS only when justified — see [api-vs-nms.md](./api-vs-nms.md).

## How modern Paper expects NMS

1. **paperweight-userdev** (Gradle) — compile against **Mojang mappings** (`ServerPlayer`, `Abilities`, …).
2. **26.1+**: Minecraft/Paper ship **unobfuscated** — set `MOJANG_PRODUCTION`, **do not** `dependsOn(reobfJar)`.
3. **Pre-26.1**: optional `reobfJar` for Spigot-mapped jars; Mojang-mapped is preferred on Paper.
4. Do **not** write Spigot-style `net.minecraft.server.v1_XX_RX` packages.
5. `CraftPlayer` / `CraftWorld` bridges are **not** public API — isolate them.

## Gradle (26.x)

Prefer **`mc_resolve_dependency` with `nms: true`** (exact `paperDevBundle`, userdev version, min Gradle).

```kotlin
// settings.gradle.kts — pluginManagement: gradlePluginPortal + papermc; foojay toolchain
plugins {
  java
  id("io.papermc.paperweight.userdev") version "2.0.0-beta.21" // needs Gradle 9+
}
dependencies {
  paperweight.paperDevBundle("26.2.build.+") // or exact e.g. 26.2.build.62-beta
}
paperweight.reobfArtifactConfiguration =
  io.papermc.paperweight.userdev.ReobfArtifactConfiguration.MOJANG_PRODUCTION
```

Official: https://docs.papermc.io/paper/dev/userdev/

| Gotcha | Fix |
|--------|-----|
| userdev 2.x + Gradle 8.14 | Upgrade wrapper to **Gradle 9+** (plugin-api 9.0.0) |
| `dependsOn(reobfJar)` on 26.1+ | Remove; use `MOJANG_PRODUCTION` |
| `26.2-R0.1-SNAPSHOT` | Wrong — use `26.2.build.+` / exact beta |

## Where members actually live (26.1+)

There is **no** Paper/Mojang Javadoc for `net.minecraft.*`. Names are open in the jar, but the catalog is the **dev bundle**, not this MCP.

| Need | Where to look | When |
|------|----------------|------|
| Exact method/field on pinned 26.x | IDE: open class from **`paperDevBundle`** (Navigate / Go to Declaration after Gradle sync) | **Before** writing or after any `mc_nms_*` hit with `mappingsFallback: true` |
| “Does this compile?” | `./gradlew compileJava` (or ASCII `build.ps1` on Windows) | Before claiming NMS code works |
| Rough class name hint | `mc_nms_search` / `mc_nms_class` | Optional discovery only — on 26.x these **fall back to 1.21.11** |
| Coords / Gradle / reobf | `mc_resolve_dependency` `nms: true`, `mc_validate_build_gradle` | When scaffolding or fixing the build |

**Rule for agents:** if `mappingsFallback` / `unobfuscatedRuntime` is set, treat returned members as **hints**, not facts. Confirm in `paperDevBundle` sources or by compiling. Do not invent members from training data or from 1.21.11 alone.

## Mappings lookup (26.x)

Mojang **does not publish `server_mappings`** for calendar 26.1+ (server is already Mojang-named).  
`mc_nms_search` / `mc_nms_class` **fall back to 1.21.11** with an explicit warning.  
**Source of truth:** members visible on the **`paperDevBundle` classpath** for the pinned build — not mappings.dev (404 on 26.x), not this fallback file.

## Workflow with this SDK

1. Confirm API gap (`mc_search_api`, `mc_api_vs_nms`).
2. Pin (`mc_set_version`, `nms: true`) → `mc_resolve_dependency` `nms: true` → Gradle sync.
3. Optional hint: `mc_nms_search` / `mc_nms_class` (if fallback warning → **stop and open the class in IDE from the bundle**).
4. Write isolated NMS (`nms_helper` / your bridge) using **only** members you verified in the bundle.
5. `compileJava` / `mc_validate_build_gradle`.
6. Windows non-ASCII paths: `mc_build_guidance` / `windows_build_ps1`.

## Isolation pattern

```
api/          // no net.minecraft imports
nms-v26_2/    // implements api interfaces using NMS
plugin/       // wires implementation for the running version
```

Never sprinkle `net.minecraft` imports through listeners and commands.

## Mojang mappings license note

Server/client mapping files are fetched for **local development** and cached under `~/.cache/mc-sdk`. Do not redistribute mapping dumps.

## Related

- `mc_remapper_guidance` — remapping / Gradle 9 / MOJANG_PRODUCTION  
- `mc_build_guidance` — builds, artifacts, Windows paths  
- [api-vs-nms.md](./api-vs-nms.md)
