/**
 * Deprecation / experimental metadata for API types (search + get_class).
 */

export interface TypeAnnotation {
  deprecated?: boolean;
  experimental?: boolean;
  forRemoval?: boolean;
  since?: string;
  /** Short preferred type name (e.g. AsyncPlayerSpawnLocationEvent) */
  prefer?: string;
  /** FQCN or simple replacement when known */
  replacement?: string;
  /** Human warning from Javadoc deprecation block (or curated) */
  warning?: string;
  /** Agent-oriented usage note */
  usageNote?: string;
}

/** High-traffic Paper/Spigot traps — agents often pick the legacy name from memory. */
export const CURATED_TYPE_ANNOTATIONS: Record<string, TypeAnnotation> = {
  "org.spigotmc.event.player.PlayerSpawnLocationEvent": {
    deprecated: true,
    forRemoval: true,
    since: "1.21.9",
    prefer: "AsyncPlayerSpawnLocationEvent",
    replacement: "io.papermc.paper.event.player.AsyncPlayerSpawnLocationEvent",
    warning:
      "Deprecated for removal. Spawn is selected in the configuration phase before a normal player entity exists; PlayerEvent.getPlayer() is unreliable (UUID/name OK). Prefer AsyncPlayerSpawnLocationEvent.",
    usageNote:
      "Do not use for lobby/spawn logic. Prefer AsyncPlayerSpawnLocationEvent (Paper) — runs while the player is still in configuration phase.",
  },
  PlayerSpawnLocationEvent: {
    deprecated: true,
    forRemoval: true,
    since: "1.21.9",
    prefer: "AsyncPlayerSpawnLocationEvent",
    replacement: "io.papermc.paper.event.player.AsyncPlayerSpawnLocationEvent",
    warning:
      "Deprecated for removal. Prefer AsyncPlayerSpawnLocationEvent — creates/uses player too early in the Spigot event.",
    usageNote:
      "Spigot PlayerSpawnLocationEvent is deprecated; use Paper AsyncPlayerSpawnLocationEvent.",
  },
  "io.papermc.paper.event.player.AsyncPlayerSpawnLocationEvent": {
    usageNote:
      "Preferred spawn-location event on Paper: fires while the player is in the configuration phase; handlers finish before spawn location is loaded.",
  },
  AsyncPlayerSpawnLocationEvent: {
    usageNote:
      "Preferred spawn-location event on Paper (over deprecated PlayerSpawnLocationEvent).",
  },
};

export function curatedAnnotation(
  name: string,
  packageName?: string
): TypeAnnotation | undefined {
  if (packageName) {
    const fq = `${packageName}.${name}`;
    if (CURATED_TYPE_ANNOTATIONS[fq]) return { ...CURATED_TYPE_ANNOTATIONS[fq] };
  }
  if (CURATED_TYPE_ANNOTATIONS[name]) return { ...CURATED_TYPE_ANNOTATIONS[name] };
  return undefined;
}

export function parseDeprecationMeta(
  signature?: string,
  deprecationBlock?: string
): TypeAnnotation {
  const sig = signature ?? "";
  const block = deprecationBlock ?? "";
  const hay = `${sig}\n${block}`;

  const deprecated =
    /@Deprecated\b/.test(sig) ||
    /\bDeprecated,\s*for removal\b/i.test(block) ||
    /\bdeprecated-label\b/i.test(block) ||
    (/^Deprecated\b/i.test(block.trim()) && block.length > 0);

  const forRemoval =
    /forRemoval\s*=\s*true/.test(sig) || /\bfor removal\b/i.test(block);

  const since =
    sig.match(/since\s*=\s*"([^"]+)"/)?.[1] ||
    block.match(/since\s+([\d.]+[^\s)]*)/i)?.[1];

  const prefer =
    block.match(/Prefer using\s+([A-Za-z][A-Za-z0-9_]*)/i)?.[1] ||
    block.match(/\buse\s+([A-Za-z][A-Za-z0-9_]*)\s+instead\b/i)?.[1] ||
    block.match(/replaced by\s+([A-Za-z][A-Za-z0-9_.]*)/i)?.[1];

  const experimental =
    /@ApiStatus\.Experimental\b/.test(hay) ||
    /@Experimental\b/.test(hay) ||
    /\bpreview feature\b/i.test(block);

  const out: TypeAnnotation = {};
  if (deprecated) out.deprecated = true;
  if (forRemoval) out.forRemoval = true;
  if (since) out.since = since;
  if (prefer) {
    out.prefer = prefer.includes(".") ? prefer.split(".").pop() : prefer;
    out.replacement = prefer;
  }
  if (experimental) out.experimental = true;
  if (block) out.warning = block.slice(0, 600);
  return out;
}

export function mergeAnnotations(
  ...parts: Array<TypeAnnotation | undefined>
): TypeAnnotation {
  const out: TypeAnnotation = {};
  for (const p of parts) {
    if (!p) continue;
    if (p.deprecated) out.deprecated = true;
    if (p.experimental) out.experimental = true;
    if (p.forRemoval) out.forRemoval = true;
    if (p.since) out.since = p.since;
    if (p.prefer) out.prefer = p.prefer;
    if (p.replacement) out.replacement = p.replacement;
    if (p.warning) out.warning = p.warning;
    if (p.usageNote) out.usageNote = p.usageNote;
  }
  return out;
}

export function annotationWarnings(ann: TypeAnnotation, typeName: string): string[] {
  const warnings: string[] = [];
  if (ann.deprecated) {
    const bits = [`${typeName} is @Deprecated`];
    if (ann.forRemoval) bits.push("forRemoval");
    if (ann.since) bits.push(`since ${ann.since}`);
    if (ann.prefer) bits.push(`prefer ${ann.prefer}`);
    warnings.push(bits.join(" — "));
  }
  if (ann.experimental) {
    warnings.push(`${typeName} is experimental / preview API`);
  }
  if (ann.warning && !warnings.some((w) => w.includes(ann.prefer ?? "\0"))) {
    warnings.push(ann.warning);
  }
  if (ann.usageNote) warnings.push(ann.usageNote);
  return warnings;
}
