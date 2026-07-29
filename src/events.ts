import { searchApi, type TypeHit } from "./javadoc/search.js";
import {
  annotationWarnings,
  curatedAnnotation,
} from "./javadoc/deprecation.js";

const SCENARIO_HINTS: Array<{ keywords: string[]; typeHints: string[] }> = [
  {
    keywords: ["click", "interact", "right", "left", "air"],
    typeHints: [
      "PlayerInteractEvent",
      "PlayerInteractEntityEvent",
      "PlayerInteractAtEntityEvent",
    ],
  },
  {
    keywords: ["chat", "message", "say"],
    typeHints: ["AsyncChatEvent", "AsyncPlayerChatEvent", "PlayerChatEvent"],
  },
  {
    keywords: ["spawn", "join spawn", "spawn location", "first join"],
    typeHints: [
      "AsyncPlayerSpawnLocationEvent",
      "PlayerSpawnLocationEvent",
      "PlayerJoinEvent",
    ],
  },
  {
    keywords: ["join", "quit", "leave", "login"],
    typeHints: ["PlayerJoinEvent", "PlayerQuitEvent", "PlayerLoginEvent"],
  },
  {
    keywords: ["damage", "hurt", "attack"],
    typeHints: ["EntityDamageEvent", "EntityDamageByEntityEvent"],
  },
  {
    keywords: ["death", "kill", "die"],
    typeHints: ["PlayerDeathEvent", "EntityDeathEvent"],
  },
  {
    keywords: ["move", "teleport", "walk"],
    typeHints: ["PlayerMoveEvent", "PlayerTeleportEvent"],
  },
  {
    keywords: ["break", "place", "block"],
    typeHints: ["BlockBreakEvent", "BlockPlaceEvent", "BlockDamageEvent"],
  },
  {
    keywords: ["inventory", "click inv", "gui", "menu"],
    typeHints: ["InventoryClickEvent", "InventoryOpenEvent", "InventoryCloseEvent"],
  },
  {
    keywords: ["command", "tab"],
    typeHints: ["PlayerCommandPreprocessEvent", "ServerCommandEvent"],
  },
  {
    keywords: ["drop", "pickup", "item"],
    typeHints: ["PlayerDropItemEvent", "EntityPickupItemEvent", "ItemSpawnEvent"],
  },
];

function annotateEventHit(hit: TypeHit): TypeHit {
  const curated = curatedAnnotation(hit.name, hit.package);
  if (!curated) return hit;
  return {
    ...hit,
    deprecated: hit.deprecated ?? curated.deprecated,
    experimental: hit.experimental ?? curated.experimental,
    forRemoval: hit.forRemoval ?? curated.forRemoval,
    since: hit.since ?? curated.since,
    prefer: hit.prefer ?? curated.prefer,
    replacement: hit.replacement ?? curated.replacement,
    usageNote: hit.usageNote ?? curated.usageNote,
    warning: hit.warning ?? curated.warning,
  };
}

export async function findEventsByScenario(
  version: string,
  scenario: string,
  limit = 15
) {
  const q = scenario.toLowerCase();
  const hinted: string[] = [];
  for (const row of SCENARIO_HINTS) {
    if (row.keywords.some((k) => q.includes(k))) {
      hinted.push(...row.typeHints);
    }
  }

  const searchQuery = hinted[0] ?? scenario;
  const results = await searchApi(version, searchQuery, {
    scope: "types",
    limit: 40,
    enrichAnnotations: true,
  });

  const eventTypes = results.types.filter(
    (t) =>
      t.name.endsWith("Event") &&
      (t.package?.includes(".event") || t.name.includes("Event"))
  );

  // Merge hints that appear in index (prefer Paper/async names listed first in hints)
  const extra = await searchApi(version, "Event", {
    scope: "types",
    limit: 80,
    enrichAnnotations: false,
  });
  for (const hint of [...hinted].reverse()) {
    const hit = extra.types.find((t) => t.name === hint);
    if (hit && !eventTypes.some((e) => e.name === hit.name)) {
      eventTypes.unshift(annotateEventHit(hit));
    }
  }

  const events = eventTypes
    .map(annotateEventHit)
    .sort(
      (a, b) =>
        Number(Boolean(a.deprecated)) - Number(Boolean(b.deprecated)) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit);

  const warnings = [
    ...results.warnings,
    ...events.flatMap((e) => annotationWarnings(e, e.name)),
  ];

  return {
    version,
    scenario,
    hints: hinted,
    events,
    warnings: [...new Set(warnings)],
    tip: events.some((e) => e.deprecated)
      ? "One or more matching events are @Deprecated — prefer the Paper/async replacement (see prefer / warnings)."
      : undefined,
  };
}
