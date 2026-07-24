import { loadSearchIndexes, type MemberHit } from "./search.js";
import { javadocBaseUrlFor } from "../platform.js";

export type BuiltinEnumKind =
  | "material"
  | "entity"
  | "enchantment"
  | "potion"
  | "sound"
  | "particle"
  | "game_event"
  | "statistic"
  | "item_type"
  | "block_type"
  | "custom";

const ENUM_TARGETS: Record<
  Exclude<BuiltinEnumKind, "custom">,
  { package: string; className: string; aliases?: string[] }
> = {
  material: { package: "org.bukkit", className: "Material", aliases: ["item", "block", "items", "blocks"] },
  entity: {
    package: "org.bukkit.entity",
    className: "EntityType",
    aliases: ["entities", "mob", "mobs"],
  },
  enchantment: {
    package: "org.bukkit.enchantments",
    className: "Enchantment",
    aliases: ["enchant", "enchants"],
  },
  potion: {
    package: "org.bukkit.potion",
    className: "PotionEffectType",
    aliases: ["effect", "effects", "potion_effect"],
  },
  sound: { package: "org.bukkit", className: "Sound", aliases: ["sounds"] },
  particle: { package: "org.bukkit", className: "Particle", aliases: ["particles"] },
  game_event: {
    package: "org.bukkit",
    className: "GameEvent",
    aliases: ["gameevent"],
  },
  statistic: {
    package: "org.bukkit",
    className: "Statistic",
    aliases: ["stats"],
  },
  item_type: {
    package: "org.bukkit.inventory",
    className: "ItemType",
    aliases: ["itemtype", "registry_item"],
  },
  block_type: {
    package: "org.bukkit.block",
    className: "BlockType",
    aliases: ["blocktype", "registry_block"],
  },
};

function memberUrl(
  version: string,
  pkg: string,
  className: string,
  name: string,
  urlPath?: string
): string {
  const base = javadocBaseUrlFor("paper", version);
  const pkgPath = pkg.replaceAll(".", "/") + "/";
  return `${base}${pkgPath}${className}.html#${urlPath ?? name}`;
}

function isEnumConstantName(name: string): boolean {
  // Material-style constants and methods filter
  if (name.includes("(") || name.includes(")")) return false;
  if (name.includes("<") || name.includes(">")) return false;
  // Allow BOTH ALL_CAPS and mixed (some registries use camel)
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
}

export async function listEnumConstants(
  version: string,
  packageName: string,
  className: string
): Promise<string[]> {
  const indexes = await loadSearchIndexes(version);
  const names = indexes.members
    .filter(
      (m) =>
        m.p === packageName &&
        m.c === className &&
        isEnumConstantName(m.l) &&
        // Prefer field-like entries: exclude obvious getters if any slipped through
        !/^(get|is|has|set|valueOf|values|equals|toString|hashCode|name|ordinal|compareTo)/.test(
          m.l
        )
    )
    .map((m) => m.l);

  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export async function searchEnumConstants(
  version: string,
  packageName: string,
  className: string,
  query: string,
  limit = 50
): Promise<MemberHit[]> {
  const all = await listEnumConstants(version, packageName, className);
  const q = query.trim().toLowerCase().replace(/\s+/g, "_");
  if (!q) {
    return all.slice(0, limit).map((name) => ({
      package: packageName,
      className,
      name,
      url: memberUrl(version, packageName, className, name),
    }));
  }

  const scored = all
    .map((name) => {
      const n = name.toLowerCase();
      let score = 0;
      if (n === q) score = 1000;
      else if (n.startsWith(q)) score = 800;
      else if (n.includes(q)) score = 500;
      else if (q.split(/[_\s-]+/).every((p) => p && n.includes(p))) score = 300;
      return { name, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);

  return scored.map(({ name }) => ({
    package: packageName,
    className,
    name,
    url: memberUrl(version, packageName, className, name),
  }));
}

export function resolveEnumTarget(
  kind: BuiltinEnumKind,
  customPackage?: string,
  customClass?: string
): { package: string; className: string } {
  if (kind === "custom") {
    if (!customPackage || !customClass) {
      throw new Error("custom enum requires packageName and className");
    }
    return { package: customPackage, className: customClass };
  }
  const t = ENUM_TARGETS[kind];
  return { package: t.package, className: t.className };
}

export function describeBuiltinEnums(): string {
  return Object.entries(ENUM_TARGETS)
    .map(
      ([kind, t]) =>
        `- ${kind}: ${t.package}.${t.className}` +
        (t.aliases?.length ? ` (aliases: ${t.aliases.join(", ")})` : "")
    )
    .join("\n");
}
