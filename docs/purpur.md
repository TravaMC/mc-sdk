# Purpur

Purpur is a **Paper fork** with extra configurability and gameplay APIs. Most Paper plugins run unchanged. For Purpur-only APIs, depend on **`purpur-api`** and look them up in Purpur Javadocs — do not invent members from Paper JD alone.

## Javadocs

| URL | Notes |
|-----|--------|
| https://purpurmc.org/javadoc/ | Current Purpur API docs (not path-versioned like Paper) |

Pin with:

```text
mc_set_version
  platform: purpur
  version: 26.3   # calendar id (alias: 1.26.3 → 26.3)
```

Then `mc_search_api` / `mc_get_class` use Purpur JD. Prefer `org.purpurmc.*` hits and Purpur-extended Bukkit methods.

## Dependency

Prefer **`mc_resolve_dependency`** (`platform=purpur`) — it picks exact `.build.N-stable` and falls back to `paper-api` if Purpur Maven times out.

```kotlin
// settings.gradle.kts: foojay-resolver-convention
// build.gradle.kts (26.x — Java 25 toolchain; Gradle daemon on 21)
repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
    maven("https://repo.purpurmc.org/snapshots")
}
dependencies {
    compileOnly("org.purpurmc.purpur:purpur-api:26.3.build.+")
    // or exact: 26.3.build.2656-stable (from mc_resolve_dependency)
}
```

Legacy (~1.21.x) still uses `1.21.1-R0.1-SNAPSHOT`. Do **not** invent `1.26.3-R0.1-SNAPSHOT`.

Purpur 26.2+ inherits Paper's **Adventure 5** and the 26.2/26.3 API changes — read `mc_paper26_guide` when upgrading.

`purpur-api` includes Paper / Spigot / Bukkit APIs. Using only `paper-api` is fine if you do **not** call Purpur-specific methods (plugin still runs on Purpur).

Docs: https://purpurmc.org/docs/purpur/  
Downloads API: https://api.purpurmc.org/v2/purpur/

## What is unique (look these up — names drift between builds)

### Dedicated packages (`org.purpurmc.purpur.*`)

Examples present in current JD (always verify with `mc_search_api`):

| Area | Examples |
|------|----------|
| Player / AFK | `PlayerAFKEvent` |
| Ridables | `RidableMoveEvent`, `RidableSpacebarEvent` |
| Bees / goats / llamas | `BeeFoundFlowerEvent`, `GoatRamEntityEvent`, `LlamaJoinCaravanEvent`, … |
| Explosions | `PreBlockExplodeEvent`, `PreEntityExplodeEvent` |
| Anvil / grindstone | `AnvilTakeResultEvent`, `AnvilUpdateResultEvent`, `GrindstoneTakeResultEvent` |
| Spawners | `PlayerSetSpawnerTypeWithEggEvent`, `PlayerSetTrialSpawnerTypeWithEggEvent` |
| Other | `ExecuteCommandEvent`, `PlayerBookTooLargeEvent`, `StoredEntity`, `Language`, `PurpurPermissions` |

### Bukkit API extensions (same classes, Purpur methods)

Purpur patches extra methods onto Bukkit types. They show up in Purpur JD on e.g. `Player` / `Entity`, **not** on Paper JD:

| Type | Examples (verify in JD) |
|------|-------------------------|
| `Player` | `isAfk()`, `setAfk(boolean)`, `usesPurpurClient()` |
| `Entity` / mobs | `isRidable()`, `isRidableInWater()`, `hasRider()`, `getRider()`, … |

If `mc_search_api` on `platform=paper` misses AFK/ridable APIs, switch to **`platform=purpur`**.

## Agent rules

1. Target server is Purpur → pin `platform=purpur` and read `mc_purpur_guide`.  
2. Prefer Paper-compatible APIs when writing plugins that must also run on Paper.  
3. Purpur-only features → `purpur-api` + Purpur JD lookup.  
4. Threading is still Paper-like — follow `mc_async_guide` (Purpur is not Folia unless you run Folia separately).  
5. NMS: same paperweight story as Paper; Purpur server jar ≠ reason to skip API search.

## Tools

| Tool | Use |
|------|-----|
| `mc_purpur_guide` | This document |
| `mc_set_version` `platform=purpur` | Pin + Cursor rule |
| `mc_search_api` / `mc_get_class` | Purpur JD |
| `mc_list_versions` `platform=purpur` | Builds from api.purpurmc.org |
| `mc_template` `purpur_build` | Gradle snippet |

## See also

- Paper JD still useful for shared API: pin Paper version for comparison, or search Paper after Purpur  
- `mc_api_vs_nms`, `mc_async_guide`  
