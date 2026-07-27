# Velocity plugins

Velocity is a **proxy**. There are no Bukkit worlds, blocks, or living entities. Do not use Paper/Bukkit APIs in a Velocity plugin.

## Setup

- Dependency: `com.velocitypowered:velocity-api:VERSION`
- Annotate the main class with `@Plugin` and/or ship `velocity-plugin.json`
- Use the JDK version required by your Velocity release
- Adventure (`Component` / `Audience`) comes with `velocity-api` — **use it for all player-facing text**

## Adventure (mandatory for chat / titles / kicks)

Read **`mc_adventure_guide`** (`docs/adventure.md`). Short version:

```java
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

player.sendMessage(Component.text("Hello", NamedTextColor.GREEN));
```

**Do not use legacy Bungee chat** in Velocity plugins:

- `net.md_5.bungee.api.chat.TextComponent` / `BaseComponent`
- `ChatColor` + `§` / `&` as the primary message API
- `sendMessage(String)` with color codes instead of `Component`

`LegacyComponentSerializer` is only for converting already-legacy config strings into `Component`.

Lookup: `mc_adventure_search`, docs https://docs.papermc.io/adventure/

## LimboAPI / LimboAuth / LimboFilter

These Elytrium libraries run **on Velocity**. Agents often regress to Bungee legacy samples — that is wrong.

- Send limbo chat / title / action bar / kick reasons as Adventure **`Component`** (or MiniMessage → `Component`).
- Include `limboapi-api` as `compileOnly` from `https://maven.elytrium.net/repo/` when needed; pin the exact artifact version the user uses.
- Look up Limbo factory/event APIs for that version — do not invent methods.
- Still use Velocity Javadocs for `Player`, events, commands: `mc_velocity_search_api` / `mc_velocity_get_class`.

## Javadocs

| URL | Notes |
|-----|--------|
| `https://jd.papermc.io/velocity/{version}/` | Versioned (e.g. `3.4.0`, `4.0.0`, `4.1.0`) |
| `https://jd.papermc.io/velocity/` | Current / latest root docs |

Tools: `mc_velocity_list_versions`, `mc_velocity_search_api`, `mc_velocity_get_class`, `mc_velocity_guide`, `mc_adventure_guide`, `mc_adventure_search`

## Docs

- https://docs.papermc.io/velocity/dev  
- `mc_docs_search` with query `velocity`
- Adventure: https://docs.papermc.io/adventure/

## Pin

```
mc_set_version
  platform: velocity
  version: 3.4.0   # ask the user — never invent
  versionSource: user_stated
```

## Templates

`mc_template` kinds: `velocity_main`, `velocity_build`, `velocity_plugin_json`

## Example

See `examples/SampleVelocity/` (`/sampleping`, PostLogin tip) — uses Adventure `Component`, not legacy chat.
