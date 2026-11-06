# Build guidance (Paper / paperweight)

Practical build and project setup notes for plugins developed against Paper. Aimed at humans and AI agents using **mc-sdk**.

---

## Choose a toolchain

| Project type | Gradle setup | Compile dependency |
|--------------|--------------|-------------------|
| **API-only** | Java plugin | `compileOnly` Paper API |
| **NMS** | `paperweight-userdev` | `paperweight.paperDevBundle(...)` |
| **Velocity** | Java plugin | `compileOnly` Velocity API (separate platform) |

Pin versions in `.mc-sdk.json` via `mc_set_version`.  
Resolve coords with **`mc_resolve_dependency`** (exact Maven build + min Java + `api-version`).  
Full tree: **`mc_scaffold_project`**. Pre-check: **`mc_validate_build_gradle`**.

---

## Version aliases (critical)

Paper calendar line is **`26.3`**, not Minecraft-style **`1.26.3`**.

| User typed | Normalized | Wrong outcome if unaliased |
|------------|------------|----------------------------|
| `1.26.3` | `26.3` | JD 404, bogus `1.26.3-R0.1-SNAPSHOT` |
| `26.3` | `26.3` | OK |

`mc_set_version`, lookups, and `mc_resolve_dependency` alias `1.26.x` → `26.x` and emit an explicit **versionWarning**.

---

## Version → Java / Maven matrix

| Server line | Min compile Java | Dependency scheme | `plugin.yml` api-version |
|-------------|------------------|-------------------|--------------------------|
| 1.20.x (pre-5) | 17 | `VERSION-R0.1-SNAPSHOT` | `1.20` |
| 1.20.5+ / 1.21.x | 21 | `VERSION-R0.1-SNAPSHOT` | `1.21` |
| **26.x+** | **25** (confirm via Fill) | **`VERSION.build.+`** or exact `26.3.build.N-stable` | **`26.x`** (e.g. `'26.3'`; docs.papermc.io: valid 1.13 – 26.3) |
| **Velocity 4.x** | **25** (velocity-api module targets JVM 25) | `com.velocitypowered:velocity-api:4.3.1` | n/a (`@Plugin`) |
| Velocity 3.5.x / 3.3–3.4 | 21 / 17 | `velocity-api:3.x.y` | n/a |

### Gradle JVM vs compile JDK (26.x)

| Role | Recommended | Why |
|------|-------------|-----|
| **Gradle version** | **9.7.1+** (current 9.9.0) | paperweight-userdev 2.0.0-beta.24 declares Gradle API 9.7.1; Gradle runs on JDK 25 officially since **9.1.0** |
| **Gradle daemon** (`JAVA_HOME` / IDE Gradle JVM) | JDK 21 or 25 | Gradle 8.x cannot run on JDK 25 — upgrade the wrapper instead of pinning the daemon to 21 |
| **Compile toolchain** | **JavaLanguageVersion.of(25)** | Paper 26.x / velocity-api 4.x bytecode requires 25 |
| **foojay resolver** | `foojay-resolver-convention` **1.0.0** in `settings.gradle.kts` | Provisions JDK 25 for the toolchain automatically |

Prefer toolchain + foojay over relying on whatever `JAVA_HOME` happens to be.

---

## API-only (recommended default)

### Dependencies
- Legacy (~1.21.x): `io.papermc.paper:paper-api:VERSION-R0.1-SNAPSHOT`
- Modern (26.x+): `io.papermc.paper:paper-api:VERSION.build.+` or exact build from `mc_resolve_dependency`
- Purpur: `org.purpurmc.purpur:purpur-api:…` — if `repo.purpurmc.org` times out, **fall back to `paper-api`** (plugins still run on Purpur; Purpur-only APIs need purpur-api when reachable)

Always prefer **`mc_resolve_dependency`** over inventing coordinates.

### Practices that prevent bugs
- Mark custom items with **PersistentDataContainer** + `NamespacedKey`, not display name.
- On `PlayerInteractEvent`, filter `EquipmentSlot.HAND` to avoid off-hand double handling.
- Prefer Adventure `Component` over legacy chat strings / `ChatColor`.
- Look up `Material` / `EntityType` / events for the **pinned** version (`mc_lookup_*`, `mc_find_event`).
- Set `api-version` in `plugin.yml`; expand `${version}` via `processResources`.
- Validate with `mc_validate_plugin_yml` / `mc_validate_build_gradle`.

### Artifacts
- Standard `jar` / `shadowJar` is enough.
- No reobfuscation required for API-only Paper plugins on modern Paper.

---

## NMS / paperweight

### When
Only after `mc_api_vs_nms` / API search says the API is insufficient. See [api-vs-nms.md](./api-vs-nms.md).

### Setup (prefer `mc_resolve_dependency` with `nms: true`)
```kotlin
plugins {
  java
  id("io.papermc.paperweight.userdev") version "2.0.0-beta.24" // Gradle 9.7.1+
}
dependencies {
  paperweight.paperDevBundle("26.3.build.+") // or exact .build.N-stable from resolve
}
// 26.1+:
paperweight.reobfArtifactConfiguration =
  io.papermc.paperweight.userdev.ReobfArtifactConfiguration.MOJANG_PRODUCTION
// Do NOT dependsOn(reobfJar)
```

| Line | Reobf | Gradle for userdev 2.x |
|------|-------|-------------------------|
| 1.21.x | optional `reobfJar` | 8.8+ (1.7.x userdev) or 9+ (2.x) |
| **26.1+** | **MOJANG_PRODUCTION only** | **9.7.1+** with userdev 2.0.0-beta.24 (beta.1–23: 9.0+) |

Docs: https://docs.papermc.io/paper/dev/userdev/ · details in [nms.md](./nms.md)

### Artifacts
- **26.1+**: ship Mojang-mapped jar (no reobf).
- Pre-26.1: `-dev` Mojang-mapped vs reobfuscated via `reobfJar`.

### First build
Expect a long first run (download server, mappings, decompile, patch). Cache lives under Gradle user home / paperweight caches.

### Mappings tools
`mc_nms_*` on 26.1+ read class/field/method names from the **official unobfuscated server.jar** of the pinned version (`source: "server-jar"`; Mojang publishes no `server_mappings` there). Paper-added members are not included; only if indexing fails do they fall back to **1.21.11** mappings with `mappingsFallback: true`. Compile is truth.

---

## Windows + non-ASCII project paths (highlight)

If the project lives under a **Cyrillic or other non-ASCII** path (typical Windows user folders), Gradle workers and paperweight often fail with:

`ClassNotFoundException: worker.org.gradle.process.internal.worker.GradleWorkerMain`

**This is the primary Windows build fix — use it early, not after hours of debugging.**

### Reliable workaround
1. Copy the project to an ASCII-only path, e.g. `C:\tmp\MyPlugin`.
2. Set `GRADLE_USER_HOME` to an ASCII path, e.g. `C:\tmp\gradle-home`.
3. Run `gradlew build --no-daemon` from that copy.
4. Copy `build/libs/*` back to the original project.

**Template:** `mc_template` → `windows_build_ps1` (also written by `mc_scaffold_project` as `build.ps1`).

---

## Folia

If `folia-supported: true` (or you target Folia):

- Do not assume a single global main thread.
- Read `mc_folia_guide` and Paper Folia docs before schedulers / entity teleports.
- NMS + Folia is advanced; default to API region schedulers.

---

## Pre-flight checklist (agents)

1. `mc_set_version` or `mc_detect_version` (watch for `1.26.x` alias warnings)  
2. `mc_resolve_dependency` — paste exact coords / min Java / api-version  
3. Optional: `mc_scaffold_project` or `mc_validate_build_gradle`  
4. Confirm platform (`paper` / `purpur` / `folia` / `velocity`)  
5. Search API for the pinned version  
6. Decide API vs NMS (`mc_api_vs_nms`)  
7. If NMS: `mc_nms_guidance` + mappings lookup  
8. **If Windows non-ASCII path: `build.ps1` / this section — do this before blaming dependencies**  

---

## Related

- [api-vs-nms.md](./api-vs-nms.md)  
- Tools: `mc_build_guidance`, `mc_resolve_dependency`, `mc_scaffold_project`, `mc_validate_build_gradle`, `mc_nms_guidance`, `mc_remapper_guidance`, `mc_folia_guide`
