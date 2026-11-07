/**
 * Scenario → event classes ("player swings arm", "block broken by explosion", …).
 *
 * Event names are CamelCase word lists (PlayerArmSwingEvent → player/arm/swing), so the scenario is
 * tokenized, lightly stemmed and expanded with synonyms, then matched against every *Event type in
 * the pinned Javadoc index. Curated hints put the right event first for common traps
 * (AsyncPlayerSpawnLocationEvent over the deprecated Spigot one).
 */
import type { Platform } from "./platform.js";
import { annotationWarnings, curatedAnnotation } from "./javadoc/deprecation.js";
import {
  enrichTypeAnnotations,
  flattenAnnotation,
  loadSearchIndexes,
  typeUrl,
  type TypeHit,
} from "./javadoc/search.js";

/** Scenario keywords → preferred event names (first = best). Matched as whole-word stems. */
const SCENARIO_HINTS: Array<{ keywords: string[]; events: string[] }> = [
  { keywords: ["spawn", "lobby", "first join"], events: ["AsyncPlayerSpawnLocationEvent", "PlayerSpawnLocationEvent", "PlayerJoinEvent"] },
  { keywords: ["join", "login", "connect"], events: ["PlayerJoinEvent", "AsyncPlayerPreLoginEvent", "PlayerLoginEvent"] },
  { keywords: ["quit", "leave", "disconnect"], events: ["PlayerQuitEvent"] },
  { keywords: ["respawn"], events: ["PlayerRespawnEvent", "PlayerPostRespawnEvent"] },
  { keywords: ["chat", "message"], events: ["AsyncChatEvent"] },
  { keywords: ["swing", "arm", "animation", "punch air"], events: ["PlayerArmSwingEvent"] },
  { keywords: ["click", "interact", "right click", "left click", "use item"], events: ["PlayerInteractEvent", "PlayerInteractEntityEvent", "PlayerInteractAtEntityEvent"] },
  { keywords: ["damage", "hurt", "attack", "hit"], events: ["EntityDamageEvent", "EntityDamageByEntityEvent"] },
  { keywords: ["death", "die", "kill"], events: ["PlayerDeathEvent", "EntityDeathEvent"] },
  { keywords: ["move", "walk"], events: ["PlayerMoveEvent"] },
  { keywords: ["teleport"], events: ["PlayerTeleportEvent", "EntityTeleportEvent"] },
  { keywords: ["break", "mine", "dig"], events: ["BlockBreakEvent", "BlockDamageEvent"] },
  { keywords: ["place", "build"], events: ["BlockPlaceEvent", "BlockMultiPlaceEvent"] },
  { keywords: ["inventory", "gui", "menu"], events: ["InventoryClickEvent", "InventoryOpenEvent", "InventoryCloseEvent", "InventoryDragEvent"] },
  { keywords: ["command"], events: ["PlayerCommandPreprocessEvent", "ServerCommandEvent", "AsyncPlayerSendCommandsEvent"] },
  { keywords: ["tab complete", "tabcomplete", "suggest"], events: ["AsyncTabCompleteEvent", "TabCompleteEvent"] },
  { keywords: ["drop"], events: ["PlayerDropItemEvent"] },
  { keywords: ["pickup", "pick up"], events: ["EntityPickupItemEvent", "PlayerAttemptPickupItemEvent"] },
  { keywords: ["sneak", "crouch", "shift"], events: ["PlayerToggleSneakEvent"] },
  { keywords: ["sprint"], events: ["PlayerToggleSprintEvent"] },
  { keywords: ["jump"], events: ["PlayerJumpEvent"] },
  { keywords: ["eat", "drink", "consume"], events: ["PlayerItemConsumeEvent"] },
  { keywords: ["craft"], events: ["CraftItemEvent", "PrepareItemCraftEvent"] },
  { keywords: ["explode", "explosion", "tnt"], events: ["EntityExplodeEvent", "BlockExplodeEvent"] },
  { keywords: ["cushion"], events: ["EntityBreakEvent", "EntityBreakByEntityEvent", "EntityPlaceEvent"] },
  { keywords: ["push", "collide", "collision"], events: ["EntityCollideWithEntityEvent"] },
  { keywords: ["golem", "wither", "construct"], events: ["EntityConstructEvent", "CreatureSpawnEvent"] },
];

/** Extra name-words a scenario word can match (event names use Mojang/Bukkit vocabulary). */
const SYNONYMS: Record<string, string[]> = {
  hit: ["damage"],
  attack: ["damage"],
  hurt: ["damage"],
  kill: ["death"],
  die: ["death"],
  dead: ["death"],
  mine: ["break"],
  dig: ["break"],
  build: ["place"],
  click: ["interact"],
  use: ["interact"],
  login: ["join", "login"],
  connect: ["join", "login"],
  leave: ["quit"],
  disconnect: ["quit"],
  crouch: ["sneak"],
  eat: ["consume"],
  drink: ["consume"],
  gui: ["inventory"],
  menu: ["inventory"],
  punch: ["swing", "damage"],
  explosion: ["explode"],
  tnt: ["explode", "prime"],
  message: ["chat"],
};

const STOP = new Set([
  "the", "and", "for", "when", "with", "into", "onto", "from", "that", "this", "his", "her",
  "their", "some", "any", "has", "have", "does", "event", "events", "listen", "listener", "want",
]);

const IRREGULAR: Record<string, string> = {
  broken: "break",
  broke: "break",
  died: "die",
  dies: "die",
  dying: "die",
  ate: "eat",
  fell: "fall",
  thrown: "throw",
  threw: "throw",
  built: "build",
};

/**
 * Candidate stems, best first. A suffix strip can lose a silent "e"
 * (moved/moving → mov), so the "+e" form is offered too: moves→move, moved→[move, mov],
 * mined→[mine, min], damaged→[damage, damag], jumped→[jump, jumpe], pushes→push.
 */
export function stems(word: string): string[] {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return [IRREGULAR[w]];
  if (w.length > 5 && w.endsWith("ing")) {
    const base = w.slice(0, -3);
    return [base, `${base}e`];
  }
  if (w.length > 4 && w.endsWith("ed")) {
    const base = w.slice(0, -2);
    return [`${base}e`, base];
  }
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return [w.slice(0, -2)];
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return [w.slice(0, -1)];
  return [w];
}

/** Primary stem (first candidate). */
export function stem(word: string): string {
  return stems(word)[0];
}

/** One group per scenario word: its stem candidates + synonyms (a group scores at most once). */
export function scenarioTokenGroups(scenario: string): string[][] {
  const groups: string[][] = [];
  for (const raw of scenario.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    const g = new Set<string>();
    for (const s of stems(raw)) {
      g.add(s);
      for (const syn of SYNONYMS[s] ?? []) g.add(syn);
    }
    for (const syn of SYNONYMS[raw] ?? []) g.add(syn);
    groups.push([...g]);
  }
  return groups;
}

export function scenarioTokens(scenario: string): string[] {
  return [...new Set(scenarioTokenGroups(scenario).flat())];
}

/** PlayerArmSwingEvent → ["player","arm","swing"] */
export function eventNameWords(name: string): string[] {
  return name
    .replace(/Event$/, "")
    .split(/(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/** Stems match when equal, or one is a ≥4-char prefix of the other (damaged→"damag" vs "damage"). */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

function matchesKeyword(scenario: string, keyword: string): boolean {
  const words = scenario.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stems);
  const kw = keyword.split(/\s+/).map(stem);
  for (let i = 0; i + kw.length <= words.length; i++) {
    if (kw.every((k, j) => words[i + j].some((w) => sameStem(w, k)))) return true;
  }
  return false;
}

const GENERIC = new Set(["player", "entity", "block", "item", "async"]);

/**
 * @param version Javadoc tree to search (may lag the pin, e.g. Folia 26.3 → 26.2 JD)
 * @param pinVersion pinned version used for version-gated curated deprecations (defaults to `version`)
 */
export async function findEventsByScenario(
  version: string,
  scenario: string,
  limit = 15,
  platform: Platform = "paper",
  pinVersion?: string
) {
  const gateVersion = pinVersion ?? version;
  const hinted: string[] = [];
  for (const row of SCENARIO_HINTS) {
    if (row.keywords.some((k) => matchesKeyword(scenario, k))) {
      for (const e of row.events) if (!hinted.includes(e)) hinted.push(e);
    }
  }
  const tokens = scenarioTokens(scenario);
  const groups = scenarioTokenGroups(scenario).map((g) => ({
    tokens: g,
    generic: g.every((t) => GENERIC.has(t)),
  }));
  const specificGroups = groups.filter((g) => !g.generic).length;

  const indexes = await loadSearchIndexes(version, platform);
  const scored: Array<TypeHit & { score: number }> = [];
  for (const t of indexes.types) {
    if (!t.l.endsWith("Event") || t.l.includes(".")) continue;
    const words = eventNameWords(t.l);
    let score = 0;
    let specificHits = 0;
    for (const g of groups) {
      if (g.tokens.some((tok) => words.some((w) => sameStem(w, tok)))) {
        score += g.generic ? 3 : 20;
        if (!g.generic) specificHits++;
      }
    }
    const hintRank = hinted.indexOf(t.l);
    if (hintRank >= 0) score += 200 - hintRank * 5;
    else if (specificGroups && specificHits === 0) continue;
    if (score <= 0) continue;
    score -= words.length; // prefer the shortest, most direct name
    const curated = curatedAnnotation(t.l, t.p, gateVersion);
    scored.push({
      package: t.p,
      name: t.l,
      kind: t.k,
      url: typeUrl(version, t, platform),
      ...flattenAnnotation(curated),
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  // Same simple name in two packages (Spigot + Paper): keep both, they differ in deprecation.
  let top = scored.slice(0, Math.max(limit, 8));
  // Read @Deprecated from the Javadoc pages of the best few (cached, parallel, capped).
  // Keep our relevance score: enrichment's generic Paper-package boost would reorder matches.
  const relevance = new Map(top.map((h) => [`${h.package}.${h.name}`, h.score]));
  top = [
    ...(await enrichTypeAnnotations(version, platform, top.slice(0, 8), gateVersion)),
    ...top.slice(8),
  ].map((h) => ({ ...h, score: relevance.get(`${h.package}.${h.name}`) ?? h.score }));
  const events = top
    .sort(
      (a, b) =>
        Number(Boolean(a.deprecated)) - Number(Boolean(b.deprecated)) ||
        b.score - a.score ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit)
    .map(({ score: _s, ...rest }) => rest);

  const warnings = events.flatMap((e) => annotationWarnings(e, e.name));
  return {
    version,
    scenario,
    hints: hinted,
    tokens,
    events,
    warnings: [...new Set(warnings)],
    tip: events.length
      ? events.some((e) => e.deprecated)
        ? "One or more matching events are @Deprecated — prefer the replacement in prefer / warnings."
        : undefined
      : "No event matched. Try other words (e.g. 'break block', 'damage entity') or mc_search_api with a class-name fragment.",
  };
}
