# Velocity plugins

Velocity is a **proxy**. There are no Bukkit worlds, blocks, or living entities. Do not use Paper/Bukkit APIs in a Velocity plugin.

## Setup

- Dependency: `com.velocitypowered:velocity-api:VERSION`
- Annotate the main class with `@Plugin` and/or ship `velocity-plugin.json`
- Use the JDK version required by your Velocity release

## Javadocs

| URL | Notes |
|-----|--------|
| `https://jd.papermc.io/velocity/{version}/` | Versioned (e.g. `3.4.0`, `4.0.0`, `4.1.0`) |
| `https://jd.papermc.io/velocity/` | Current / latest root docs |

Tools: `mc_velocity_list_versions`, `mc_velocity_search_api`, `mc_velocity_get_class`, `mc_velocity_guide`

## Docs

- https://docs.papermc.io/velocity/dev  
- `mc_docs_search` with query `velocity`

## Pin

```
mc_set_version
  platform: velocity
  version: 3.4.0   # or 4.0.0 / latest
```

## Templates

`mc_template` kinds: `velocity_main`, `velocity_build`, `velocity_plugin_json`

## Example

See `examples/SampleVelocity/` (`/sampleping`, PostLogin tip).
