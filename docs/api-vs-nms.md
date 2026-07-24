# Paper API vs NMS

A decision guide for Paper plugin authors and AI agents using **mc-sdk**.

**Default rule:** use the **Paper API** (plus Adventure). Reach for **NMS** only after you have confirmed the API cannot do the job on your pinned Minecraft/Paper version.

**Threading:** never block the main/region thread with HTTP, DB, or disk I/O — see [`async.md`](async.md) / `mc_async_guide`.

**Purpur:** if you need AFK/ridables/Purpur events, pin `platform=purpur` and read [`purpur.md`](purpur.md) — those APIs are not on Paper Javadocs.

Pin the project version with `mc_set_version` and look up symbols with `mc_search_api` / `mc_nms_*` — do not invent members from memory.

---

## Definitions

| Term | Meaning |
|------|---------|
| **Paper API** | Public plugin surface: Bukkit + Paper extensions (`org.bukkit.*`, `io.papermc.paper.*`), Adventure, registries, events, schedulers. Stable *intent*, versioned docs at `jd.papermc.io/paper/{version}/`. |
| **CraftBukkit** | Implementation bridge (`CraftPlayer`, `CraftWorld`, …). Not public API. Breaks often. Avoid unless you already committed to NMS. |
| **NMS** | `net.minecraft.*` server internals. Compile via **paperweight-userdev** against **Mojang mappings**. Unstable by design. |
| **Packets** | Network protocol classes (`net.minecraft.network.protocol.*`). Almost always NMS (or a maintained library). |

---

## Decision tree

```
Need a feature
    │
    ├─ Can Bukkit/Paper/Adventure do it?  ──yes──►  Paper API only
    │         (search mc_search_api / docs)
    │
    ├─ Does a maintained library cover it? ──yes──►  Depend on that library
    │         (ProtocolLib, packetevents, etc.)
    │
    ├─ Is it “nice to have” cosmetics? ────yes──►  Drop or approximate with API
    │
    └─ Required for product correctness? ──yes──►  NMS (paperweight) + pin version
              Isolate behind an interface
```

Agent checklist before writing NMS:

1. `mc_search_api` for the feature / event / method on the **pinned** version  
2. `mc_docs_search` for Paper guides (data components, lifecycle, Adventure)  
3. `mc_api_vs_nms` (this doc) — still justified?  
4. Only then `mc_nms_search` / `mc_nms_class` + `mc_nms_guidance`

---

## Always Paper API

Use API for all of the following unless you have a measured, documented reason not to:

### Gameplay & world
- Blocks, items, inventories, crafting, enchanting  
- Entities spawn/despawn, damage, targeting (via Entity API / attributes)  
- Worlds, chunks (Paper chunk API), biomes, structures where API exposes them  
- Scoreboards, teams, boss bars, advancements (API surface)

### Players & UX
- Chat, action bar, titles, boss bars → **Adventure** (`Audience`, `Component`)  
- Kick/ban, permissions, commands (Brigadier / Paper command API)  
- Player velocity, teleport, gamemode, health, food, XP  
- Resource packs, server links, dialogs where Paper documents them  

### Items & data
- Custom items: **PersistentDataContainer** + `NamespacedKey` (not display-name checks)  
- Modern item data: Paper **Data Component API** (1.20.5+)  
- Prefer `ItemType` / `BlockType` / registries over legacy assumptions when available  

### Events & scheduling
- All `*Event` listeners, cancellable events, Paper-added events  
- `BukkitScheduler` on Paper; Folia → region/entity schedulers (`mc_folia_guide`)  
- Plugin messaging channels  

### Config & lifecycle
- `plugin.yml` / `paper-plugin.yml`, configs, languages  
- Paper lifecycle / bootstrap events when applicable  

---

## Prefer API — common “looks like NMS” traps

These feel “internal” but usually have API (or Adventure) equivalents. **Check the API first:**

| Temptation | Prefer instead |
|------------|----------------|
| Send action bar / title via packets | Adventure `player.sendActionBar` / `showTitle` |
| Fake visual lightning | `World#strikeLightningEffect` (or Paper equivalents) |
| Glow / glow color | Team / scoreboard API, Paper entity effects where exposed |
| Custom item identity | PDC + NamespacedKey / data components |
| Hide player nametag | Scoreboard teams |
| Change tab list name | Adventure / Paper player list APIs |
| Play sound / particle | `World#playSound`, `spawnParticle` |
| Set client-side weather/time for one player | Player-specific API methods where they exist |
| Kick with fancy reason | Adventure Component kick message |
| Open sign / anvil / book UI | Bukkit inventory / Paper dialogs / documented APIs |
| “Just get ServerPlayer for teleport” | `Player#teleport` / Paper teleport flags |

If `mc_search_api` finds a method whose name matches your goal, **use it**.

---

## Consider a library before raw NMS

Raw NMS is highest maintenance. Prefer a well-maintained abstraction when the problem is packets/protocol:

- **packetevents**, **ProtocolLib**, similar — when you need clientbound/serverbound packets across versions  
- Adventure / MiniMessage — text, not NMS chat components  
- Existing Paper APIs added every release — re-check after upgrades  

Use Hangar (`mc_hangar_search`) to see if the ecosystem already solved it.

---

## When NMS is justified

NMS is reasonable when **all** of these hold:

1. Product requirement cannot be met by Paper API on the target version (verified via javadoc/docs).  
2. No suitable maintained library, or library is unacceptable for licensing/size/support.  
3. You can **pin** Minecraft/Paper version(s) and accept breakage on upgrades.  
4. You isolate NMS behind a small module/interface (API code never imports `net.minecraft` directly everywhere).

### Typical justified domains
- Clientbound packets with **no** Paper/Adventure wrapper (custom payload UX, rare protocol features)  
- Entity / block entity fields not exposed after searching Paper javadocs  
- Server-internal hooks Paper has not stabilized yet (document *why* and *which version*)  
- Performance-critical hot paths **after profiling** proved API cost is the bottleneck (rare; measure first)

### Not sufficient justifications
- “Tutorials on Spigot used NMS in 2019”  
- “Faster to copy CraftBukkit snippet than read docs”  
- “I need Mojang class names to feel powerful”  
- Supporting 8 versions with one reflective NMS soup (prefer API + per-version adapters or drop old versions)

---

## Cost of NMS (be honest with users)

| Cost | Detail |
|------|--------|
| Breakage | Method/field renames every Minecraft release |
| Build | paperweight downloads/decompile/remap; first build is slow |
| Tooling | Need Mojang mappings workflow; never `v1_20_R1` package style on modern Paper |
| Review | Harder code review; on 26.x re-verify members in **paperDevBundle** / IDE (not mappings JD) |
| Support | Bug reports often version-specific |
| Folia | Region threading + NMS is especially easy to get wrong |

If the feature is optional cosmetics, **cut NMS** and ship API-only.

---

## Multi-version strategies

1. **Best:** API-only on a reasonable `api-version` / Paper range.  
2. **Good:** API + optional NMS module loaded only on known versions.  
3. **Acceptable:** NMS adapters per major MC version behind an interface.  
4. **Avoid:** One class reflecting into all versions with stringly-typed field names.  
5. **Avoid:** Shipping obfuscated Spigot NMS names in source.

Paper remaps Mojang-mapped plugins on modern versions — see `mc_remapper_guidance` / `mc_nms_guidance`.

---

## Agent anti-patterns

- Inventing `net.minecraft.server.v1_XX_RX` packages for Paper 1.20.5+  
- Using CraftBukkit without paperweight (classpath won’t match)  
- Identifying items by display name / lore alone  
- Double-firing interact handlers (ignore `EquipmentSlot.HAND`)  
- Global Bukkit scheduler assumptions on Folia  
- Mixing Adventure `Component` with NMS `net.minecraft.network.chat.Component` without converting carefully  
- Copying NMS from a different Minecraft version than the pinned one  

---

## Quick reference

| Goal | Path |
|------|------|
| Almost everything plugins do | Paper API |
| Fancy text / UI text | Adventure |
| Custom item marking | PDC / data components |
| Protocol across versions | Library first |
| True missing server hook | NMS + pin + isolate |
| Unsure | `mc_search_api` → docs → then NMS |

**Related tools:** `mc_build_guidance`, `mc_nms_guidance`, `mc_remapper_guidance`, `mc_folia_guide`.
