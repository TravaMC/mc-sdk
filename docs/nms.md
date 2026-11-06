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
  id("io.papermc.paperweight.userdev") version "2.0.0-beta.24" // needs Gradle 9.7.1+
}
dependencies {
  paperweight.paperDevBundle("26.3.build.+") // or exact e.g. 26.3.build.244-stable
}
paperweight.reobfArtifactConfiguration =
  io.papermc.paperweight.userdev.ReobfArtifactConfiguration.MOJANG_PRODUCTION
```

Official: https://docs.papermc.io/paper/dev/userdev/

| Gotcha | Fix |
|--------|-----|
| userdev 2.0.0-beta.24 + Gradle < 9.7.1 | Upgrade wrapper to **Gradle 9.7.1+** (current 9.9.0); beta.1–23 needed 9.0+ |
| `dependsOn(reobfJar)` on 26.1+ | Remove; use `MOJANG_PRODUCTION` |
| `26.3-R0.1-SNAPSHOT` | Wrong — use `26.3.build.+` / exact `26.3.build.N-stable` |

## Where members actually live (26.1+)

There is **no** Paper/Mojang Javadoc for `net.minecraft.*`. Since 26.1 the official server.jar carries real names, so **`mc_nms_search` / `mc_nms_class` index that jar for your exact version** (vanilla classes, fields with types, method signatures). Paper patches and CraftBukkit additions are only in the **dev bundle**.

| Need | Where to look | When |
|------|----------------|------|
| Vanilla method/field on pinned 26.x | `mc_nms_class` (`source: "server-jar"`) | Before writing NMS code |
| Paper-added member, or `mappingsFallback: true` | IDE: open class from **`paperDevBundle`** (Go to Declaration after Gradle sync) | When the server-jar index lacks it |
| “Does this compile?” | `./gradlew compileJava` (or ASCII `build.ps1` on Windows) | Before claiming NMS code works |
| Class name discovery | `mc_nms_search` | Any time |
| Coords / Gradle / reobf | `mc_resolve_dependency` `nms: true`, `mc_validate_build_gradle` | When scaffolding or fixing the build |

**Rule for agents:** with `source: "server-jar"` the names are real for that version (vanilla). With `mappingsFallback: true` they come from another version — treat them as **hints** and confirm in `paperDevBundle` sources or by compiling. Never invent members from training data.

## Mappings lookup (26.x)

Mojang **does not publish `server_mappings`** for calendar 26.1+ (the server is already Mojang-named; mappings.dev returns 404).  
`mc_nms_search` / `mc_nms_class` download the official `server.jar` for the pinned version once (~60 MB, sha1-checked), read every `net.minecraft` / `com.mojang` class and cache the index under `~/.cache/mc-sdk`. Only if that fails (offline, unknown version) do they fall back to **1.21.11** mappings with `mappingsFallback: true`.  
**Full truth** (including Paper patches): the **`paperDevBundle` classpath** for the pinned build, and `compileJava`.

## Workflow with this SDK

1. Confirm API gap (`mc_search_api`, `mc_api_vs_nms`).
2. Pin (`mc_set_version`, `nms: true`) → `mc_resolve_dependency` `nms: true` → Gradle sync.
3. Look up names: `mc_nms_search` / `mc_nms_class` (if `mappingsFallback` → **stop and open the class in the IDE from the bundle**).
4. Write isolated NMS (`nms_helper` / your bridge) using **only** members you verified (server-jar index or bundle).
5. `compileJava` / `mc_validate_build_gradle`.
6. Windows non-ASCII paths: `mc_build_guidance` / `windows_build_ps1`.

## Isolation pattern

```
api/          // no net.minecraft imports
nms-v26_3/    // implements api interfaces using NMS
plugin/       // wires implementation for the running version
```

Never sprinkle `net.minecraft` imports through listeners and commands.

## Mojang mappings license note

Server/client mapping files and the 26.x server.jar index are fetched for **local development** and cached under `~/.cache/mc-sdk`. Do not redistribute mapping dumps or the jar.

## Related

- `mc_remapper_guidance` — remapping / Gradle 9 / MOJANG_PRODUCTION  
- `mc_build_guidance` — builds, artifacts, Windows paths  
- [api-vs-nms.md](./api-vs-nms.md)
