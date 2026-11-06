# Paper / Purpur 26.x developer notes (26.1 → 26.3)

Current line (Nov 2026): **26.3** (Paper / Purpur / Folia), Java **25**. Sources: PaperMC announcements
[26.1](https://papermc.io/news/26-1/), [26.2](https://papermc.io/news/26-2/), [26.3](https://papermc.io/news/26-3/).
Always confirm a member with `mc_search_api` / `mc_get_class` for **your pin** — this page is a map, not the API.

## What changed per release

| Release | Developer-facing changes |
|---------|--------------------------|
| **26.1** | Calendar versioning; Maven coords `26.1.2.build.N-stable` (use `VERSION.build.+`, never `26.1.+`). **World clocks** (per-world by default, `time.affects-all-worlds`), new parent `ClockTimeSkipEvent`. World storage moved under `world/dimensions/…`; `WorldInfo#getName` is obsolete — prefer `getKey()`. **Unobfuscated server jar** — no remapper, NMS via `MOJANG_PRODUCTION`. New API: `World#locateNearestPoi`, `WorldCreator#forcedSpawnPosition`, `GameRule#getDefaultValue`, `Damageable#kill`, `EntityLungeEvent`, `ItemCraftedEvent`, … |
| **26.2** | **Adventure 5** (deprecated Adventure API removed — see `mc_adventure_guide` → *Adventure 5*). `BookMeta` no longer extends Adventure `Book` (use its own pages methods). **Beds are no longer block entities** → no PDC on beds; rescue data via `AsyncServerDataFixerRemoveBlockEntityEvent`. Cube mobs share `AbstractCubeMob`: `MagmaCube` no longer extends `Slime`, `SlimeSplitEvent#getEntity` returns `AbstractCubeMob`. `EntityIgniteEvent` is the parent of `CreeperIgniteEvent`. Deprecated: `Vex#getSummoner` → `getOwner`, `World#setSpawnFlags` / `getAllowAnimals`, `PointedDripstone` → `Speleothem`. Trim registries via `RegistryEvents.TRIM_MATERIAL` / `TRIM_PATTERN`. Client brand on `PlayerCommonConnection`. |
| **26.3** | Most of the **data component API is no longer experimental**. New events: `EntityBreakEvent` / `EntityBreakByEntityEvent` (cushions; with `EntityPlaceEvent`), `EntityConstructEvent` (golems / Wither from block patterns), `EntityCollideWithEntityEvent` (pushing), `SulfurCubeSwallowItemEvent`, `PlayerCodeOfConductSendEvent`. New API: `Player#postEffects`, `Entity#getRemovalReason` + `RemovalReason`, `SulfurCube#swallow`, `CreakingHeart` creaking/protector access; `Mob#setDespawnInPeacefulOverride` un-deprecated. Deprecated: `PlayerAnimationEvent` → **`PlayerArmSwingEvent`**, `PotionEffectTypeCategory` → `PotionEffectType.Category`, `PotionBrewer` → data-driven `BrewingRecipe`. |
| **26.4** (announced) | Bukkit/Spigot/Paper config files are planned to merge into one — do not hardcode `spigot.yml`/`bukkit.yml` paths in new tooling. |

### Upgrade checklist (1.21.x / 26.1 → 26.3)

1. Gradle coords from `mc_resolve_dependency` (`26.3.build.N-stable`), toolchain Java 25, plugin.yml `api-version: '26.3'`.
2. Text: migrate to Adventure 5 (`ClickEvent`/`HoverEvent` removals, `BookMeta` pages, no `Audience#sendMessage(Identity, …)`).
3. Replace `PlayerAnimationEvent` listeners with `PlayerArmSwingEvent`; replace `MagmaCube instanceof Slime` checks with `AbstractCubeMob`.
4. Bed PDC data: move it elsewhere before worlds are upgraded.
5. Time code: follow the world-clock checklist below.
6. NMS: `MOJANG_PRODUCTION`, no `reobfJar`; look up names with `mc_nms_class` (reads the 26.x server.jar).

## World clock (26.1+)

Calendar line **26.1+** (Paper `26.x`, Purpur aligned) introduces **world clocks**. Plugin code that blindly calls `World.setTime` / assumes every dimension has a day cycle will break.

Pin first (`mc_get_config` / project `.mc-sdk.json`), then look up members with:

```
mc_get_class
  className: World
  memberQuery: isFixedTime   # or setTime, getTime, getGameTime
```

Javadoc search does **not** index exception message strings — use `mc_explain_error` for texts like `Cannot set the time…` / `without a world clock`.

## World clock & time API

| Topic | Guidance |
|-------|----------|
| `getTime()` / `getFullTime()` | Return **`0` if the world has no world clock** (see Paper JD). |
| `setTime(long)` | Relative day-cycle time. May throw / fail when there is **no world clock**. Check `isFixedTime()` and dimension. |
| `setFullTime(long)` | Absolute full time; JD warns about redstone clocks / scheduled events. Use when you need rewind vs relative `setTime`. |
| `getGameTime()` | Time since world generation — **not** the same as day/night cycle. |
| `isFixedTime()` | Whether the world has fixed time (no advancing day cycle). Gate plugins that mutate time. |
| Future / datapack clocks | Vanilla adds datapack `world_clock` registry; Bukkit may grow helpers (e.g. clock presence APIs). Always re-check JD for your pin — do not invent `hasWorldClock` unless `mc_search_api` finds it. |

### Migration checklist

1. Before `setTime` / `setFullTime`: `if (world.isFixedTime()) { /* skip or alternate */ }`
2. Do not treat `getTime() == 0` as “midnight” without confirming a clock exists.
3. Re-test Nether/End/custom dimensions — they may not share overworld clock behavior.
4. Prefer Paper JD for `org.bukkit.World` on 26.x even in Purpur plugins when Purpur JD lags (Purpur still implements Paper API).

## Gamerules

- Expect **renames / new rules** around time advancement (e.g. interactions with `advance_time` vs older `doDaylightCycle` mental models).
- Resolve exact names with `mc_search_api` `GameRule` + pinned version — do not hardcode from 1.21 memory.

## Spawn / join location

- Use Paper's **`AsyncPlayerSpawnLocationEvent`** for the initial spawn location. Spigot's `org.spigotmc.event.player.PlayerSpawnLocationEvent` is **deprecated for removal** — `mc_search_api` / `mc_find_event` return it with `prefer` set.
- Join listeners (`PlayerJoinEvent`) remain the right layer for post-join setup.
- Re-verify spawn/respawn related APIs after upgrading 1.21 → 26.x (`mc_find_event`, `mc_search_api`).
- World-clock changes do **not** replace spawn events — but lobby plugins that also force daytime must adopt the time checklist above.

## Tools

| Need | Tool |
|------|------|
| Exception text | `mc_explain_error` |
| World time members | `mc_get_class` + `memberQuery` |
| Type/member names | `mc_search_api` (`isFixedTime`, `setFullTime`) |
| Cross-version types | `mc_diff_api` |
| Purpur-only extras | `mc_purpur_guide` (clock basics still Paper) |

## External reading

- Minecraft Wiki: [World clock](https://minecraft.wiki/w/World_clock)
- Paper JD: `https://jd.papermc.io/paper/{version}/org/bukkit/World.html`
