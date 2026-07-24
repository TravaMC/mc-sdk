# Commands (Paper)

Agents often invent Bukkit `CommandExecutor` APIs or outdated Brigadier registration. Prefer **current Paper docs** for the pinned version.

## Official docs

| Topic | URL |
|-------|-----|
| Command API hub | https://docs.papermc.io/paper/dev/api/command-api/ |
| Introduction | https://docs.papermc.io/paper/dev/command-api/basics/introduction |
| Command trees | https://docs.papermc.io/paper/dev/command-api/basics/command-tree |
| Arguments / literals | https://docs.papermc.io/paper/dev/command-api/basics/arguments-and-literals |
| Registration | https://docs.papermc.io/paper/dev/command-api/basics/registration |
| Bukkit-style BasicCommand | https://docs.papermc.io/paper/dev/command-api/misc/basic-command |
| Comparison Bukkit vs Brigadier | https://docs.papermc.io/paper/dev/command-api/misc/comparison-bukkit-brigadier |

Also declare commands in `plugin.yml` when using the classic executor path (`mc_validate_plugin_yml`, `mc_template` `plugin_yml` / `command`).

## Two styles

### 1. Classic (still common)

- `plugin.yml` → `commands:`  
- `PluginCommand#setExecutor` / `setTabCompleter`  
- Fine for simple `/foo` tools; tab complete is manual  

Template: `mc_template` kind `command`

### 2. Paper Brigadier / Command API (preferred for new plugins)

- Typed arguments, better suggestions, literals  
- Register via Paper’s lifecycle / Brigadier helpers (see **Registration** doc above)  
- Look up exact types with `mc_search_api` / `mc_get_class` for your pinned Paper version — **do not invent** package names from memory  

## Async note

Command executors run on the **tick thread**. Do not block them with HTTP/DB/heavy math — start async work and return quickly (`mc_async_guide`).

## Checklist

- [ ] Read Command API docs for pinned version (not Spigot blog posts from 2016)  
- [ ] `plugin.yml` permissions / aliases match code  
- [ ] Player-only commands check sender type  
- [ ] Suggestions don’t do disk/network  
- [ ] Heavy work deferred async  

## Tools

- `mc_commands_guide` — this file  
- `mc_docs_search` query `command brigadier`  
- `mc_docs_get` path `/paper/dev/api/command-api/`  
- `mc_template` `command` — classic starter  
