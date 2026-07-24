---
name: paper-async-threading
description: >-
  Enforces Paper/Folia async and main-thread rules when writing Minecraft
  plugins. Use when implementing HTTP, database, disk I/O, heavy math/pathfinding,
  schedulers, BukkitRunnable, runTaskAsynchronously, Folia RegionScheduler,
  teleportAsync, batched block apply, or when TPS/lag/main-thread freezes are discussed.
---

# Paper async & threading

## Decision tree

1. Needs live `World`/`Player`/`Block`/`Entity`? → tick / region / entity scheduler only.
2. I/O or heavy CPU on **copied** data? → async, then bounce back.
3. Applying many blocks? → **batch** on tick (don’t dump 10k `setType` in one task).

Call MCP **`mc_async_guide`** (`docs/async.md`) before scheduling. Folia → **`mc_folia_guide`**.

## Quick matrix

| Do async | Stay on tick/region |
|----------|---------------------|
| HTTP, DB, disk, heavy math on snapshots (A*, noise, big sorts) | Live world reads/writes, inventories, entities |
| Build large immutable `Component` / plans | Send messages / apply plans |

## Must

- Snapshot on tick → compute async → re-resolve UUID → apply if `plugin.isEnabled()`
- Never keep `Player` across threads; never `teleportAsync(...).get()` on tick
- Cap concurrent jobs; use generation ids to supersede stale results

## Templates

- `mc_template` `async_io`
- `mc_template` `async_cpu`
- `mc_template` `folia_region_task`
- Demo: `examples/SampleAsync`
