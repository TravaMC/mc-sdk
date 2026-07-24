# Async, threading & performance (Paper)

Agents often run everything on the **main / region tick thread**. That freezes TPS.  
**Rule:** do I/O and heavy CPU off-thread; touch the live world only on the owning tick thread.

Official: https://docs.papermc.io/paper/dev/scheduler/ · Folia: https://docs.papermc.io/paper/dev/folia-support/

## Decision tree (use this every time)

```
Is this work < ~0.5ms and uses Bukkit world/entity APIs?
  YES → stay on tick / region / entity scheduler
  NO  → Can it be pure Java on copied data (no World/Player/Block calls)?
          YES → runTaskAsynchronously / AsyncScheduler, then bounce back to apply
          NO  → split: snapshot on tick → async compute → apply on tick (batched)
```

Rough budget: **1 tick ≈ 50ms** shared by *everything* on that thread. A 5ms handler every tick is already expensive.

## Thread matrix

| Context | Safe | Forbidden |
|---------|------|-----------|
| **Main tick** (Paper) / **region tick** (Folia) | Almost all Bukkit/Paper world, entity, inventory, scoreboard APIs; short Adventure sends | Blocking HTTP/DB/disk; `Thread.sleep`; huge loops; sync chunk load storms |
| **Async** (`runTaskAsynchronously` / Folia `AsyncScheduler`) | HTTP, SQL/Redis, disk, compression, hashing, **heavy math on snapshots**, building immutable results (`Component`, byte[], plans) | Live `World` / `Player` / `Entity` / `Block` / `Inventory` / `Bukkit.getOnlinePlayers()` / most event APIs |
| **EntityScheduler** | Mutations for that entity (follows regions) | Assuming global main thread |
| **RegionScheduler** | Blocks at a `Location` | Entity work that should follow the entity |

`Bukkit.isPrimaryThread()` is **true on Paper’s main thread**. On Folia it does **not** mean “safe for every region” — use region/entity schedulers when claiming Folia support.

## What belongs async

### I/O (almost always)

- HTTP, webhooks, Discord, license checks  
- SQL / Redis / Mongo — never block a tick on a query  
- Large config/schematic/log read/write  
- External processes  

### CPU / math (when non-trivial)

Cheap sync is fine: cooldowns, one `distanceSquared`, simple vector math.

| Async (snapshot first) | Stay on tick |
|------------------------|--------------|
| A*, flood-fill, BFS on a **copied** grid | Same-tick path that must see live movers |
| Noise / mesh / structure **plans** in memory | `setType` / place blocks (batch on tick) |
| Large sort/cluster/hull on **copied** coords | Scanning `getEntities()` every tick |
| Crypto, compression, image/map render | Sending the map packet |
| Monte Carlo / bulk damage tables | One damage calc in an event |

**Async math rules**

1. **Snapshot on tick** — heights, `Material` ids, UUID + `Vector` clone, int[][] grid. No `world.getBlockAt` from async.  
2. Produce an immutable **plan** (list of changes, path nodes, score).  
3. **Apply batched** on tick/region (e.g. 32–128 blocks/tick).  
4. Assume staleness — re-check chunk loaded / block still air if it matters.  
5. Prefer `distanceSquared` over `distance` (avoid `sqrt`).  
6. Cap concurrent jobs (one pathfind per player; cancel outdated generation with a generation id).

```java
Location origin = player.getLocation().clone();
UUID worldId = origin.getWorld().getUID();
int[][] snap = copyHeights(origin, 32); // MAIN

plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
    List<int[]> plan = buildSpiral(snap); // pure CPU
    plugin.getServer().getScheduler().runTask(plugin, () -> {
        World w = Bukkit.getWorld(worldId);
        if (w == null) return;
        applyBatched(plugin, w, origin, plan, 64);
    });
});
```

Templates: `async_io` (I/O), `async_cpu` (math + batch apply), `async_secure` (auth/login: pre-login / hash / bounce). Demo: `examples/SampleAsync`.

## What must stay on tick / region

- Block/entity/inventory/scoreboard mutations  
- Sync teleport (prefer `teleportAsync` when chunks may load)  
- Spawning entities, most damage/effect application  
- Reading live world state for the snapshot itself  

Adventure **send** to an online player: usually on tick (cheap). **Building** a huge `Component` tree from pure data can be async; send on tick.

## Patterns

### Bounce (I/O or CPU → world)

```text
tick: snapshot / start
async: work
tick: apply if plugin still enabled && subject still valid
```

Always re-resolve `Bukkit.getPlayer(uuid)` after async — never keep a `Player` reference across threads.

### Batched apply

```java
void applyBatched(JavaPlugin plugin, Queue<Runnable> work, int perTick) {
    plugin.getServer().getScheduler().runTaskTimer(plugin, task -> {
        for (int i = 0; i < perTick && !work.isEmpty(); i++) work.poll().run();
        if (work.isEmpty()) task.cancel();
    }, 1L, 1L);
}
```

### teleportAsync (Paper)

```java
entity.teleportAsync(loc).thenAccept(ok -> {
    // completed on main — Bukkit OK here
});
// NEVER call future.get() / join() on the tick thread → deadlock risk
```

### Shared state

| OK | Risky |
|----|-------|
| `ConcurrentHashMap`, immutable snapshots, `AtomicInteger` gen ids | Mutating `ArrayList`/`HashMap` from async + tick |
| Read-only config fields copied at reload | Live `FileConfiguration` / Yaml from multiple threads |

On `onDisable`: cancel tasks; async callbacks must check `plugin.isEnabled()` before scheduling sync apply.

### Rate limits

- Don’t start a new heavy async job every move/interact — cooldown or “busy” flag.  
- Limit pool pile-up: if previous pathfind for that player isn’t done, skip or supersede with a newer generation id.

## Common AI mistakes

1. `Thread.sleep` / busy-wait on tick  
2. Sync JDBC / HTTP in `onEnable` or join/chat listeners  
3. Bukkit API from async (`Player`, `World`, `getOnlinePlayers`)  
4. Keeping `Player`/`ItemStack` live refs across async  
5. Folia + classic `BukkitScheduler` for region/entity work  
6. `teleportAsync(...).get()` on main  
7. Applying 10k blocks in one sync task after async generate  
8. Entity/block scan every tick with no filter/cooldown  
9. Assuming `isPrimaryThread()` ⇒ Folia-global-safe  
10. Ignoring `isEnabled()` after slow HTTP  

## Optimization checklist

- [ ] No blocking I/O on tick/region  
- [ ] Heavy math uses snapshots + async + batched apply  
- [ ] Cooldowns on interact/move/chat-triggered work  
- [ ] Caches / PDC instead of reparsing config every event  
- [ ] `teleportAsync` / async chunk APIs where loads matter  
- [ ] Folia schedulers if `folia-supported`  
- [ ] Profile (Spark / timings) before micro-opts or NMS  
- [ ] Cancel / generation-id outdated async work  

## Folia

No single global main thread for the whole world:

| Scheduler | Use |
|-----------|-----|
| `RegionScheduler` | Blocks at a location |
| `EntityScheduler` | Work following an entity |
| `GlobalRegionScheduler` | Non-region global work |
| `AsyncScheduler` | Off-tick I/O & CPU |

Details: `mc_folia_guide`, `docs/folia.md`

## Tools

| Tool | Use |
|------|-----|
| `mc_async_guide` | This document |
| `mc_folia_guide` | Region threading |
| `mc_template` `async_io` | HTTP/DB → sync message |
| `mc_template` `async_cpu` | Snapshot → math → batched apply |
| `mc_template` `async_secure` | Auth/login: pre-login + hash/DB → tick apply/kick |
| `mc_template` `folia_region_task` | Region/entity/async |
| `mc_docs_get` | `/paper/dev/scheduler/`, `/paper/dev/entity-teleport/` |
