import { searchApi } from "./javadoc/search.js";

const SCENARIO_HINTS: Array<{ keywords: string[]; typeHints: string[] }> = [
  {
    keywords: ["click", "interact", "right", "left", "air"],
    typeHints: ["PlayerInteractEvent", "PlayerInteractEntityEvent", "PlayerInteractAtEntityEvent"],
  },
  {
    keywords: ["chat", "message", "say"],
    typeHints: ["AsyncPlayerChatEvent", "AsyncChatEvent", "PlayerChatEvent"],
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
  });

  const eventTypes = results.types.filter(
    (t) =>
      t.name.endsWith("Event") &&
      (t.package?.includes(".event") || t.name.includes("Event"))
  );

  // Merge hints that appear in index
  const extra = await searchApi(version, "Event", { scope: "types", limit: 80 });
  for (const hint of hinted) {
    const hit = extra.types.find((t) => t.name === hint);
    if (hit && !eventTypes.some((e) => e.name === hit.name)) {
      eventTypes.unshift(hit);
    }
  }

  return {
    version,
    scenario,
    hints: hinted,
    events: eventTypes.slice(0, limit),
  };
}
