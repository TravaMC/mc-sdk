# Folia support

Folia is a Paper fork that **regionizes** the world across threads. Code that assumes one global server thread will break or corrupt state.

Official guide: https://docs.papermc.io/paper/dev/folia-support/  
Overview: https://docs.papermc.io/folia/  
Javadocs: pin `platform=folia` → https://jd.papermc.io/folia/ (newest published: 26.2; Folia **26.3** is released but its Javadoc lags — mc-sdk searches 26.2 and returns `javadocWarning`)

## Declare support

In `plugin.yml` / `paper-plugin.yml`:

```yaml
folia-supported: true
```

Only set this if you actually use Folia-safe schedulers and have tested region behavior.

## Detect Folia at runtime

```java
private static boolean isFolia() {
    try {
        Class.forName("io.papermc.paper.threadedregions.RegionizedServer");
        return true;
    } catch (ClassNotFoundException e) {
        return false;
    }
}
```

## Schedulers (Paper + Folia)

Prefer these APIs — on Paper they map to familiar behavior; on Folia they are required:

| Scheduler | Use for |
|-----------|---------|
| **GlobalRegionScheduler** | Work not tied to a world region |
| **RegionScheduler** | Block/world mutations at a `Location` |
| **EntityScheduler** | Work on an entity (follows region moves) |
| **AsyncScheduler** | Off-tick background (HTTP, DB, disk) |

```java
// Region — set a block where it is owned
server.getRegionScheduler().execute(plugin, location, () -> {
    location.getBlock().setType(Material.BEEHIVE);
});

// Entity — follows the entity across regions
entity.getScheduler().execute(plugin, () -> {
    entity.setVelocity(entity.getVelocity().multiply(1.1));
}, null, 1L);

// Async — never touch live world state here
server.getAsyncScheduler().runNow(plugin, task -> {
    String data = httpGet(...);
    // bounce back with region/entity/global scheduler to apply
});
```

Do **not** use classic `BukkitScheduler#runTask*` for region-owned entities/chunks if you claim Folia support.

## Rules of thumb

1. No cross-region assumptions about tick order.
2. Shared global mutable state needs concurrency-safe structures.
3. Entity work → **EntityScheduler**, not RegionScheduler.
4. Block work → **RegionScheduler** with that location.
5. I/O → **AsyncScheduler** (same spirit as Paper async — see `docs/async.md`).
6. Prefer `teleportAsync` when loading chunks matters.

## Checklist

- [ ] `folia-supported: true` only after testing
- [ ] No `BukkitScheduler` for world/entity tick work
- [ ] Region/entity/global/async used correctly
- [ ] No Bukkit world API from async threads
- [ ] Pin Folia JD: `mc_set_version` `platform=folia`

## Tools

- `mc_folia_guide` — this guide  
- `mc_template` `folia_region_task` — starter snippet  
- `mc_search_api` with `platform=folia`  
- `mc_async_guide` — when async is allowed at all  
