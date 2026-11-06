# mc-sdk

MCP-сервер для разработки плагинов **Paper**, **Folia**, **Purpur** и **Velocity**: версионированные Javadoc, документация PaperMC, поиск Hangar, шаблоны и lookup **NMS** (на 26.1+ — прямо из официального server.jar).

Агенты должны сначала **узнать у пользователя** платформу/версию (или подтвердить detect), закрепить её, затем смотреть API — а не угадывать версию и не выдумывать члены классов.

[![CI](https://github.com/TravaMC/mc-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/TravaMC/mc-sdk/actions/workflows/ci.yml)

## Платформы

| Платформа | Javadoc | Пин |
|-----------|---------|-----|
| Paper | https://jd.papermc.io/paper/{version}/ | `mc_set_version` `platform=paper` |
| Folia | https://jd.papermc.io/folia/{version}/ | `mc_set_version` `platform=folia` |
| Purpur | https://purpurmc.org/javadoc/ | `mc_set_version` `platform=purpur` |
| Velocity | https://jd.papermc.io/velocity/{version}/ | `mc_set_version` `platform=velocity` |

Актуально на ноябрь 2026: **Paper / Purpur / Folia 26.3**, **Velocity 4.3.1** (всё на Java 25). Javadoc Velocity 4.3.x и Folia 26.3 ещё не опубликованы — mc-sdk закрепляет реальную версию, а ищет по ближайшему опубликованному дереву (4.2.1 / 26.2) и пишет `javadocWarning`.

Память проекта: `.mc-sdk.json` (+ правило Cursor `.cursor/rules/mc-sdk.mdc`).

## Требования

- Node.js **18+**
- Сеть до эндпоинтов Paper / Purpur / Mojang (кэш в `~/.cache/mc-sdk`)

## Установка (локально / Cursor)

```bash
git clone https://github.com/TravaMC/mc-sdk.git
cd mc-sdk
npm install
npm run build
npm link          # опционально — `mc-sdk` в PATH
```

### Конфиг MCP в Cursor

После `npm link` (или глобальной установки):

```json
{
  "mcpServers": {
    "mc-sdk": {
      "command": "mc-sdk"
    }
  }
}
```

После правок кода: `npm run build`, затем перезапустите MCP (Off→On).  
Проверка: `mc_cache_stats` → `sdkPackageVersion` (`3.2.0`+).

См. [`mcp.json.example`](mcp.json.example).

## Основные инструменты

| Область | Инструменты |
|---------|-------------|
| Версия | `mc_set_version`, `mc_get_config`, `mc_detect_version`, `mc_list_versions`, `mc_paper_builds`, **`mc_resolve_dependency`** |
| Paper / Folia API | `mc_search_api`, `mc_get_class`, `mc_lookup_*`, `mc_find_event`, `mc_diff_api` |
| Velocity | `mc_velocity_list_versions`, `mc_velocity_search_api`, `mc_velocity_get_class`, `mc_velocity_guide` |
| Документация | `mc_docs_search`, `mc_docs_get`, **`mc_adventure_guide`**, `mc_adventure_search`, **`mc_paper26_guide`**, **`mc_explain_error`**, `mc_folia_guide`, **`mc_async_guide`**, `mc_commands_guide`, `mc_purpur_guide` |
| **API vs NMS** | **`mc_api_vs_nms`**, `mc_build_guidance`, `mc_nms_guidance`, `mc_remapper_guidance` |
| Проект | **`mc_scaffold_project`**, **`mc_validate_build_gradle`**, `mc_validate_plugin_yml`, `mc_template`, `mc_hangar_search`, `mc_cache_stats`, `mc_cache_clear` |
| NMS lookup | `mc_nms_search`, `mc_nms_class` |

**Совет для 26.x:** не выдумывайте `1.26.3-R0.1-SNAPSHOT` — вызывайте `mc_resolve_dependency` (даёт `26.3.build.N-stable`, Java 25, `api-version: '26.3'`). Алиас `1.26.3` → `26.3` срабатывает автоматически с предупреждением. NMS на 26.1+: `nms: true`, `MOJANG_PRODUCTION`, без `reobfJar`, paperweight-userdev 2.0.0-beta.24 → Gradle 9.7.1+. `mc_nms_class` на 26.1+ читает имена из server.jar нужной версии.

**Adventure 5:** Paper/Purpur/Folia 26.2+ и Velocity 4.x используют Adventure 5 — `mc_adventure_search` сам выбирает 5.x или 4.x по пину; раздел миграции — в `mc_adventure_guide`.

**Версия:** если пользователь не назвал Paper/MC версию и нет `.mc-sdk.json` — агент обязан спросить. Уже есть pin → передайте `projectRoot` или запустите MCP из корня проекта (авто-поиск `.mc-sdk.json` вверх от cwd). `mc_set_version` / `mc_scaffold_project` требуют `versionSource=user_stated|user_confirmed_detection`.

**26.x / World:** для `isFixedTime` / `setTime` используйте `mc_get_class` с `memberQuery` (дефолтный listing обрезает огромные классы). Тексты исключений — `mc_explain_error` / `mc_paper26_guide`.

**События:** в `mc_search_api` / `mc_find_event` смотрите `deprecated`, `prefer`, `warnings[]` (например Spigot `PlayerSpawnLocationEvent` → Paper `AsyncPlayerSpawnLocationEvent`). Фильтр: `deprecated=exclude`.

## Руководства

- [docs/adventure.md](docs/adventure.md) — Adventure Component (Paper + Velocity; без Bungee legacy)  
- [docs/paper-26.md](docs/paper-26.md) — изменения 26.1 → 26.3, world clock / `setTime` / gamerules  
- [docs/async.md](docs/async.md) — главный поток vs async  
- [docs/commands.md](docs/commands.md) — classic vs Brigadier  
- [docs/purpur.md](docs/purpur.md) — API только Purpur  
- [docs/folia.md](docs/folia.md) — region schedulers  
- [docs/api-vs-nms.md](docs/api-vs-nms.md) — когда оправдан NMS  
- [docs/build-guidance.md](docs/build-guidance.md) — toolchain / пути Windows  
- [docs/nms.md](docs/nms.md) — workflow paperweight  
- [docs/velocity.md](docs/velocity.md) — proxy + LimboAPI / Adventure  

**По умолчанию:** Paper API (+ Adventure). На Velocity/LimboAPI — тоже Adventure (`mc_adventure_guide`), не `TextComponent`/`ChatColor`. Не блокируйте tick-поток HTTP/БД/диском (`mc_async_guide`).

## Типовые сценарии

**Paper API:** пин → `mc_resolve_dependency` / `mc_scaffold_project` → `mc_search_api`  

**Purpur:** пин `platform=purpur` → `mc_resolve_dependency` → `mc_purpur_guide`  

**NMS:** `mc_api_vs_nms` → `mc_resolve_dependency` `nms: true` → проверка членов в `paperDevBundle` / `compileJava`  

**Async:** `mc_async_guide` → `mc_template` (`async_io` / `async_cpu` / `async_secure`)

## Кэш

Ответы HTTP/Javadoc лежат в `~/.cache/mc-sdk` (не в проекте плагина). Авто TTL / ETag; при необходимости `mc_cache_stats` / `mc_cache_clear`.

Mappings Mojang и индекс server.jar 26.x — только для локальной разработки, дампы не распространяйте.

## Примеры

Опциональные демо в [`examples/`](examples/) (не входят в npm-пакет). См. [examples/README.md](examples/README.md).

## Разработка

```bash
npm install
npm run build
npm test
npm run check:docs
npm run smoke
npm pack --dry-run
```

См. [CONTRIBUTING.md](CONTRIBUTING.md).

## Публикация (maintainers)

1. `npm run build && npm test && npm run smoke`  
2. Тег `v3.0.0` (или текущая версия) и push.  
3. Опционально: `npm publish` (имя пакета `mc-sdk`).

## Лицензия

MIT — см. [LICENSE](LICENSE). Ассеты и mappings Mojang/Minecraft остаются под их условиями.
