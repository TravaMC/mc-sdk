# Paper / Purpur 26.x breaking notes (world clock, time, rules)

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

- Classic Bukkit events (`PlayerSpawnLocationEvent`, join listeners) remain the right layer for lobby spawn.
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
