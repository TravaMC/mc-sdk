/**
 * Curated runtime / exception → API hints for Paper/Purpur (esp. 26.x).
 * Javadoc member indexes do not contain exception message text — this fills the gap.
 */

export interface RuntimeHint {
  id: string;
  /** Substrings / regexes matched against the error or free-text query */
  patterns: RegExp[];
  title: string;
  since?: string;
  platforms?: Array<"paper" | "folia" | "purpur">;
  summary: string;
  doInstead: string[];
  lookUp: string[];
  relatedTools: string[];
}

export const RUNTIME_HINTS: RuntimeHint[] = [
  {
    id: "world-clock-set-time",
    patterns: [
      /cannot set (the )?time/i,
      /without (a )?world clock/i,
      /no world clock/i,
      /world does not have a world clock/i,
    ],
    title: "Cannot set time without a world clock",
    since: "26.1+",
    platforms: ["paper", "folia", "purpur"],
    summary:
      "On Minecraft/Paper 26.x, relative world time is backed by a **world clock**. " +
      "Dimensions without a clock (or with fixed time) reject `setTime` / may no-op time APIs. " +
      "`getTime()` / `getFullTime()` return `0` when there is no world clock.",
    doInstead: [
      "Call `World.isFixedTime()` before changing time; skip or use another dimension if fixed.",
      "Prefer `setFullTime(long)` when you need absolute ticks (see JD notes on rewinding vs `setTime`).",
      "If the world has no clock, do not call `setTime` — gate on dimension/type or create/use a clock-bearing overworld.",
      "Read `mc_paper26_guide` for the 26.x world-clock / gamerule breakages.",
    ],
    lookUp: [
      "World.isFixedTime",
      "World.setTime",
      "World.setFullTime",
      "World.getTime",
      "World.getFullTime",
      "World.getGameTime",
    ],
    relatedTools: [
      "mc_paper26_guide",
      "mc_get_class (className=World, memberQuery=isFixedTime|setTime)",
      "mc_search_api query=isFixedTime",
    ],
  },
  {
    id: "world-clock-get-time-zero",
    patterns: [
      /getTime\(\).*0/i,
      /no(?:t)? have a world clock/i,
      /does not have a world clock/i,
    ],
    title: "getTime/getFullTime return 0 (no world clock)",
    since: "26.1+",
    platforms: ["paper", "folia", "purpur"],
    summary:
      "Javadoc: relative/full in-game time methods return `0` if the world has no world clock. " +
      "This is not always an exception — check before assuming daytime/night logic.",
    doInstead: [
      "Use `isFixedTime()` and dimension checks before day/night plugins.",
      "Use `getGameTime()` for time-since-generation when appropriate (not the same as day cycle).",
      "See `mc_paper26_guide`.",
    ],
    lookUp: ["World.getTime", "World.getFullTime", "World.isFixedTime", "World.getGameTime"],
    relatedTools: ["mc_paper26_guide", "mc_get_class (World, memberQuery=Time)"],
  },
  {
    id: "advance-time-gamerule",
    patterns: [/advance_time/i, /doDaylightCycle/i],
    title: "advance_time / daylight cycle gamerules (26.x)",
    since: "26.1+",
    platforms: ["paper", "folia", "purpur"],
    summary:
      "World clocks interact with time gamerules (e.g. `advance_time`). Daylight cycle behavior may differ from 1.21-era `doDaylightCycle`-only mental models.",
    doInstead: [
      "Look up current GameRule names for your pinned 26.x version via mc_search_api / mc_get_class.",
      "Do not assume 1.21 gamerule names still control everything.",
    ],
    lookUp: ["GameRule", "World.getGameRuleValue", "World.setGameRule"],
    relatedTools: ["mc_paper26_guide", "mc_search_api query=GameRule"],
  },
];

export function explainRuntimeError(
  query: string,
  limit = 5
): {
  query: string;
  matches: Array<{
    id: string;
    title: string;
    since?: string;
    summary: string;
    doInstead: string[];
    lookUp: string[];
    relatedTools: string[];
    score: number;
  }>;
  note: string;
} {
  const q = query.trim();
  const scored = RUNTIME_HINTS.map((hint) => {
    let score = 0;
    for (const re of hint.patterns) {
      if (re.test(q)) score += 50;
    }
    // soft token overlap
    const tokens = q.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 3);
    const hay = `${hint.title} ${hint.summary} ${hint.lookUp.join(" ")}`.toLowerCase();
    for (const t of tokens) if (hay.includes(t)) score += 3;
    return { hint, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    query: q,
    matches: scored.map(({ hint, score }) => ({
      id: hint.id,
      title: hint.title,
      since: hint.since,
      summary: hint.summary,
      doInstead: hint.doInstead,
      lookUp: hint.lookUp,
      relatedTools: hint.relatedTools,
      score,
    })),
    note:
      scored.length === 0
        ? "No curated hint matched. Paste the full exception message, or use mc_search_api / mc_get_class with memberQuery on the failing type."
        : "Curated hints (exception text is not in Javadoc search indexes). Follow lookUp with mc_get_class + memberQuery.",
  };
}
