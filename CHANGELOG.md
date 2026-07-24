# Changelog

## 3.0.0

### Changed (rename)
- Package / CLI / MCP server id: **`mc-sdk`** (was `minecraft-plugin-sdk`)
- Project config file: **`.mc-sdk.json`** (still reads `.minecraft-plugin-sdk.json` and `.paper-mcp.json`)
- Cursor rule: `.cursor/rules/mc-sdk.mdc`
- Disk cache: `~/.cache/mc-sdk`

### Kept from 2.9.x
- Version alias `1.26.x` → `26.x`, `mc_resolve_dependency` (+ `nms: true`), scaffold / validate, NMS 26.x mappings fallback docs, paperweight `MOJANG_PRODUCTION` templates

## 2.9.2

### Fixed
- Removed standalone `mc_sdk_info` (Cursor tool catalog often dropped it near the ~40-tool ceiling)
- Version probe on **`mc_cache_stats.sdkPackageVersion`**
- Document duplicate Node processes breaking reloads

## 2.9.1

### Fixed
- `mc_validate_build_gradle`: no false Gradle 9+ warning when wrapper is already 9.x
- Bump for Cursor schema reload (`nms` on `mc_resolve_dependency`)

## 2.9.0

### Added / Fixed (NMS 26.x)
- `mc_nms_*` fallback to 1.21.11 with explicit warning when no `server_mappings`
- `paperweight_build` / `mc_resolve_dependency nms:true` for Gradle 9 + `MOJANG_PRODUCTION`
- `nms_helper` abilities example; validate `reobfJar` on 26.1+

## 2.8.x – 2.0.0

- Purpur, Folia, async guides, cache revalidation, Velocity, rename from earlier Paper MCP prototypes
