# mc-sdk

MCP-сервер для разработки плагинов **Paper**, **Folia**, **Purpur** и **Velocity**: версионированные Javadoc, документация PaperMC, поиск Hangar, шаблоны и lookup **Mojang-mapped NMS**.

Агенты должны сначала **узнать у пользователя** платформу/версию (или подтвердить detect), закрепить её, затем смотреть API — а не угадывать версию и не выдумывать члены классов.

[![CI](https://github.com/TravaMC/mc-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/TravaMC/mc-sdk/actions/workflows/ci.yml)

## Платформы

| Платформа | Javadoc | Пин |
|-----------|---------|-----|
| Paper | https://jd.papermc.io/paper/{version}/ | `mc_set_version` `platform=paper` |
| Folia | https://jd.papermc.io/folia/{version}/ | `mc_set_version` `platform=folia` |
| Purpur | https://purpurmc.org/javadoc/ | `mc_set_version` `platform=purpur` |
| Velocity | https://jd.papermc.io/velocity/{version}/ | `mc_set_version` `platform=velocity` |

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
Проверка: `mc_cache_stats` → `sdkPackageVersion` (`3.0.2`+).

См. [`mcp.json.example`](mcp.json.example).

## Основные инструменты

| Область | Инструменты |
|---------|-------------|
| Версия | `mc_set_version`, `mc_get_config`, `mc_detect_version`, `mc_list_versions`, `mc_paper_builds`, **`mc_resolve_dependency`** |
| Paper / Folia API | `mc_search_api`, `mc_get_class`, `mc_lookup_*`, `mc_find_event`, `mc_diff_api` |
| Velocity | `mc_velocity_list_versions`, `mc_velocity_search_api`, `mc_velocity_get_class`, `mc_velocity_guide` |
| Документация | `mc_docs_search`, `mc_docs_get`, `mc_adventure_search`, `mc_folia_guide`, **`mc_async_guide`**, `mc_commands_guide`, `mc_purpur_guide` |
| **API vs NMS** | **`mc_api_vs_nms`**, `mc_build_guidance`, `mc_nms_guidance`, `mc_remapper_guidance` |
| Проект | **`mc_scaffold_project`**, **`mc_validate_build_gradle`**, `mc_validate_plugin_yml`, `mc_template`, `mc_hangar_search`, `mc_cache_stats`, `mc_cache_clear` |
| NMS lookup | `mc_nms_search`, `mc_nms_class` |

**Совет для 26.x:** не выдумывайте `1.26.2-R0.1-SNAPSHOT` — вызывайте `mc_resolve_dependency`. Алиас `1.26.2` → `26.2` срабатывает автоматически с предупреждением. NMS на 26.1+: `nms: true`, `MOJANG_PRODUCTION`, без `reobfJar`.

**Версия:** если пользователь не назвал Paper/MC версию и нет `.mc-sdk.json` — агент обязан спросить. `mc_set_version` / `mc_scaffold_project` требуют `versionSource=user_stated|user_confirmed_detection`; `mc_detect_version` с `pin=true` — только с `userConfirmedVersion`.

## Руководства

- [docs/async.md](docs/async.md) — главный поток vs async  
- [docs/commands.md](docs/commands.md) — classic vs Brigadier  
- [docs/purpur.md](docs/purpur.md) — API только Purpur  
- [docs/folia.md](docs/folia.md) — region schedulers  
- [docs/api-vs-nms.md](docs/api-vs-nms.md) — когда оправдан NMS  
- [docs/build-guidance.md](docs/build-guidance.md) — toolchain / пути Windows  
- [docs/nms.md](docs/nms.md) — workflow paperweight  
- [docs/velocity.md](docs/velocity.md) — proxy-плагины  

**По умолчанию:** Paper API (+ Adventure). Не блокируйте tick-поток HTTP/БД/диском (`mc_async_guide`).

## Типовые сценарии

**Paper API:** пин → `mc_resolve_dependency` / `mc_scaffold_project` → `mc_search_api`  

**Purpur:** пин `platform=purpur` → `mc_resolve_dependency` → `mc_purpur_guide`  

**NMS:** `mc_api_vs_nms` → `mc_resolve_dependency` `nms: true` → проверка членов в `paperDevBundle` / `compileJava`  

**Async:** `mc_async_guide` → `mc_template` (`async_io` / `async_cpu` / `async_secure`)

## Кэш

Ответы HTTP/Javadoc лежат в `~/.cache/mc-sdk` (не в проекте плагина). Авто TTL / ETag; при необходимости `mc_cache_stats` / `mc_cache_clear`.

Mappings Mojang — только для локальной разработки, дампы не распространяйте.

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
