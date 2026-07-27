# Adventure API (Kyori)

**Default text stack** for Paper, Folia, Purpur, and **Velocity**: `net.kyori.adventure.*`.

Do **not** invent BungeeCord / Spigot legacy chat APIs. Look up types with `mc_adventure_search` and platform Javadocs.

Official docs: https://docs.papermc.io/adventure/  
Component intro (Paper): https://docs.papermc.io/paper/dev/api/component-api/  
Javadocs: https://jd.papermc.io/adventure/

## Hard rule

| Use | Avoid |
|-----|--------|
| `Component`, `Audience`, `MiniMessage` | `net.md_5.bungee.api.chat.*` (`TextComponent`, `BaseComponent`, `ComponentBuilder`) |
| `player.sendMessage(Component…)` | `sendMessage(String)` / `sendMessage(BaseComponent[])` as the primary API |
| `NamedTextColor`, `TextDecoration`, `TextColor.color(0xRRGGBB)` | `org.bukkit.ChatColor`, `net.md_5.bungee.api.ChatColor` |
| MiniMessage `<green>Hi</green>` | Building UX with raw `§` / `&` codes in Java |

`LegacyComponentSerializer` is **only** for bridging already-legacy config/DB strings into `Component` (or the reverse for export). Never build new UI as legacy strings.

## Core types

- **`Component`** — immutable rich text (chat, titles, action bar, kick reasons, tab list, boss bars…).
- **`Audience`** — anything that can receive Adventure content. On Velocity, `Player`, `CommandSource`, and `ProxyServer` participate in this model (exact members: `mc_velocity_get_class`).
- **`MiniMessage`** — preferred human-editable format for configs and localized strings.

## Patterns

### Plain / styled text

```java
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;

audience.sendMessage(
    Component.text("Hello ", NamedTextColor.GRAY)
        .append(Component.text("world", NamedTextColor.GREEN, TextDecoration.BOLD))
);
```

### MiniMessage (configs, Limbo messages, auth prompts)

```java
import net.kyori.adventure.text.minimessage.MiniMessage;

Component msg = MiniMessage.miniMessage()
    .deserialize("<gray>Welcome, <green><bold><player></bold></green>!");
audience.sendMessage(msg);
```

### Titles / action bar

```java
import net.kyori.adventure.title.Title;
import java.time.Duration;

audience.sendActionBar(Component.text("Status", NamedTextColor.YELLOW));
audience.showTitle(Title.title(
    Component.text("Title"),
    Component.text("Subtitle"),
    Title.Times.times(Duration.ofMillis(500), Duration.ofSeconds(3), Duration.ofMillis(500))
));
```

### Legacy bridge (only when input is already `&` / `§`)

```java
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;

Component fromConfig = LegacyComponentSerializer.legacyAmpersand()
    .deserialize(configStringWithAmpersands);
```

## Velocity (+ LimboAPI / LimboAuth / LimboFilter)

Velocity plugins ship Adventure transitively via `velocity-api`. Players and command sources are Adventure audiences — **same Component rules as Paper**.

When using **[LimboAPI](https://github.com/Elytrium/LimboAPI)** (or LimboAuth / LimboFilter):

1. Treat limbo UI (chat, title, action bar, kick, boss bar) as **Adventure `Component`**, not Bungee legacy.
2. Prefer overloads / helpers that take `Component` or MiniMessage strings you deserialize yourself.
3. Do **not** copy old BungeeCord proxy samples (`TextComponent.fromLegacyText`, `ChatColor.translateAlternateColorCodes`) into Limbo or Velocity code.
4. Confirm LimboAPI method signatures against the version you depend on (Elytrium Maven `net.elytrium.limboapi:api`) — do not invent APIs from memory.
5. Still pin Velocity with `mc_set_version` (`platform=velocity`) and look up proxy types with `mc_velocity_*`.

## Agent checklist

1. Need text/UI? → `mc_adventure_guide` (this doc) + `mc_adventure_search`.
2. On Velocity/Limbo? → also `mc_velocity_guide` / `mc_velocity_search_api`.
3. Reject any new imports under `net.md_5.bungee.api.chat` unless migrating ancient code and converting immediately to `Component`.
4. Prefer MiniMessage in YAML/config; deserialize at the boundary; keep Java typed as `Component`.
