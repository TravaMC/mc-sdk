import * as cheerio from "cheerio";
import { fetchText } from "../cache.js";
import {
  curatedAnnotation,
  mergeAnnotations,
  parseDeprecationMeta,
  type TypeAnnotation,
} from "./deprecation.js";
import { findType } from "./search.js";
import { javadocBaseUrlFor, platformLabel, type Platform } from "../platform.js";

export interface ClassDoc {
  version: string;
  platform?: Platform;
  title: string;
  packageName?: string;
  kind?: string;
  url: string;
  description: string;
  signature?: string;
  /** Parsed + curated deprecation / experimental flags */
  annotation: TypeAnnotation;
  deprecationWarning?: string;
  enumConstants: string[];
  fields: DocMember[];
  methods: DocMember[];
  nestedTypes: string[];
}

export interface DocMember {
  name: string;
  signature: string;
  description: string;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function fetchClassDoc(
  version: string,
  className: string,
  packageName?: string,
  platform: Platform = "paper"
): Promise<ClassDoc> {
  const hit = await findType(version, className, packageName, platform);
  if (!hit) {
    throw new Error(
      `Class "${className}" not found in ${platform} ${version || "latest"} Javadocs. Try mc_search_api / mc_velocity_search_api.`
    );
  }

  const html = await fetchText(hit.url, {
    cacheKey: `jd:${platform}:${version || "root"}:page:${hit.package ?? ""}:${hit.name}`,
    ttlMs: 24 * 60 * 60 * 1000,
  });

  const doc = parseClassHtml(version, hit.url, html);
  doc.platform = platform;
  return doc;
}

export function parseClassHtml(version: string, url: string, html: string): ClassDoc {
  const $ = cheerio.load(html);

  const title =
    cleanText($("h1.title, h1").first().text()) ||
    cleanText($("title").text()).replace(/\s*\(.*/, "");

  const packageName =
    cleanText($(".sub-title .package-label-in-type + a, .sub-title a").first().text()) ||
    undefined;

  const kind =
    cleanText($(".type-signature .modifiers, .type-signature").first().text()).split(
      /\s+/
    )[0] || undefined;

  const signature = cleanText($(".type-signature").first().text()) || undefined;

  const deprecationWarning =
    cleanText(
      $(".deprecation-block, div.deprecation-comment, .deprecation-comment")
        .first()
        .text()
    ) || undefined;

  const description = cleanText(
    $(".description .block, .class-description .block, main .block")
      .first()
      .text()
  );

  const simpleName =
    title.replace(/^(Class|Interface|Enum|Record)\s+/i, "").split(/[< ]/)[0] ||
    "";
  const pkgGuess = packageName || hitPackageFromUrl(url);
  const annotation = mergeAnnotations(
    parseDeprecationMeta(signature, deprecationWarning),
    curatedAnnotation(simpleName, pkgGuess),
    /preview|@ApiStatus\.Experimental/i.test(
      cleanText($(".preview, .horizontal").first().text()) + (signature ?? "")
    )
      ? { experimental: true }
      : undefined
  );

  const enumConstants: string[] = [];
  $(
    "#enum-constant-summary .col-first a, .constants-summary .col-first a, section#enum-constant-summary a"
  ).each((_, el) => {
    const name = cleanText($(el).text());
    if (name) enumConstants.push(name);
  });

  // Fallback for older javadoc layouts
  if (enumConstants.length === 0) {
    $("a[href*='#']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const text = cleanText($(el).text());
      // Enum constants often appear as ALL_CAPS links in summary tables
      if (/^[A-Z][A-Z0-9_]*$/.test(text) && href.includes("#")) {
        if (!enumConstants.includes(text)) enumConstants.push(text);
      }
    });
  }

  const fields = extractFromDetails($, ["#field-detail", "section#field-detail"]);
  const methods = extractFromDetails($, [
    "#method-detail",
    "section#method-detail",
    "#constructor-detail",
    "section#constructor-detail",
  ]);

  // If detail sections are sparse, fall back to signatures only (no summary-table noise)
  if (methods.length === 0) {
    methods.push(
      ...extractSignatures($, [
        "#method-summary",
        "section#method-summary",
        "#method-detail",
      ])
    );
  }
  if (fields.length === 0) {
    fields.push(
      ...extractSignatures($, ["#field-summary", "section#field-summary", "#field-detail"])
    );
  }

  const nestedTypes: string[] = [];
  $(
    "#nested-class-summary .col-second a, section#nested-class-summary .col-second a"
  ).each((_, el) => {
    const name = cleanText($(el).text());
    if (name && !name.includes(" ") && /^[A-Z]/.test(name)) {
      if (!nestedTypes.includes(name) && !enumConstants.includes(name)) {
        nestedTypes.push(name);
      }
    }
  });

  return {
    version,
    title,
    packageName: packageName || hitPackageFromUrl(url),
    kind,
    url,
    description,
    signature,
    annotation,
    deprecationWarning,
    enumConstants: unique(enumConstants).slice(0, 5000),
    fields: fields.slice(0, 500),
    methods: methods.slice(0, 2500),
    nestedTypes: unique(nestedTypes).slice(0, 200),
  };
}

function hitPackageFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // .../paper/1.21.4/org/bukkit/Material.html
    const paperIdx = parts.indexOf("paper");
    if (paperIdx < 0) return undefined;
    const afterVersion = parts.slice(paperIdx + 2, -1);
    return afterVersion.join(".") || undefined;
  } catch {
    return undefined;
  }
}

function extractFromDetails(
  $: cheerio.CheerioAPI,
  sectionSelectors: string[]
): DocMember[] {
  const out: DocMember[] = [];
  const seen = new Set<string>();

  for (const sel of sectionSelectors) {
    const section = $(sel).first();
    if (!section.length) continue;

    section.find("section.detail, li.detail, .detail").each((_, el) => {
      const node = $(el);
      const signature = cleanText(
        node.find(".member-signature, .memberSignature").first().text()
      );
      const name =
        cleanText(node.find("h3, .element-name, .member-name").first().text()) ||
        signature.split("(")[0]?.split(/\s+/).pop() ||
        "";
      if (!signature && !name) return;
      const description = cleanText(node.find(".block").first().text());
      const key = signature || name;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        name,
        signature: signature || name,
        description: description.slice(0, 800),
      });
    });
  }

  return out;
}

function extractSignatures(
  $: cheerio.CheerioAPI,
  sectionSelectors: string[]
): DocMember[] {
  const out: DocMember[] = [];
  const seen = new Set<string>();

  for (const sel of sectionSelectors) {
    const section = $(sel).first();
    if (!section.length) continue;
    section.find(".member-signature, .memberSignature").each((_, el) => {
      const signature = cleanText($(el).text());
      if (!signature || seen.has(signature)) return;
      const name =
        cleanText($(el).find(".element-name, .member-name").text()) ||
        signature.split("(")[0]?.split(/\s+/).pop() ||
        "";
      seen.add(signature);
      out.push({ name, signature, description: "" });
    });
  }

  return out;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export function formatClassDoc(
  doc: ClassDoc,
  options?: {
    includeEnumConstants?: boolean;
    maxMethods?: number;
    /** Filter methods/fields by name, signature, or description (e.g. isFixedTime, setTime) */
    memberQuery?: string;
  }
): string {
  const includeEnums = options?.includeEnumConstants ?? doc.enumConstants.length <= 80;
  const memberQuery = options?.memberQuery?.trim();
  const qParts = memberQuery
    ? memberQuery.toLowerCase().split(/[\s_|]+/).filter(Boolean)
    : [];

  const matchMember = (m: DocMember) => {
    if (!qParts.length) return true;
    const hay = `${m.name} ${m.signature} ${m.description}`.toLowerCase();
    return qParts.every((p) => hay.includes(p));
  };

  const fields = doc.fields.filter(matchMember);
  const methods = doc.methods.filter(matchMember);
  const maxMethods =
    options?.maxMethods ?? (memberQuery ? Math.min(200, Math.max(methods.length, 40)) : 120);

  const lines: string[] = [];

  lines.push(`# ${doc.title}`);
  if (doc.annotation.deprecated || doc.deprecationWarning || doc.annotation.prefer) {
    const bits: string[] = ["DEPRECATED"];
    if (doc.annotation.forRemoval) bits.push("forRemoval");
    if (doc.annotation.since) bits.push(`since ${doc.annotation.since}`);
    if (doc.annotation.prefer) bits.push(`prefer ${doc.annotation.prefer}`);
    lines.push(`\n⚠️ ${bits.join(" — ")}`);
    const warn = doc.deprecationWarning || doc.annotation.warning;
    if (warn) lines.push(warn);
    if (doc.annotation.usageNote) lines.push(`Usage: ${doc.annotation.usageNote}`);
  } else if (doc.annotation.experimental) {
    lines.push(`\n⚠️ EXPERIMENTAL / preview API`);
  } else if (doc.annotation.usageNote) {
    lines.push(`\nUsage: ${doc.annotation.usageNote}`);
  }

  lines.push(`Version: ${platformLabel(doc.platform ?? "paper")} ${doc.version || "latest"}`);
  if (doc.packageName) lines.push(`Package: ${doc.packageName}`);
  lines.push(`URL: ${doc.url}`);
  if (doc.signature) lines.push(`\nSignature: \`${doc.signature}\``);
  if (doc.description) lines.push(`\n${doc.description}`);
  if (memberQuery) {
    lines.push(
      `\nMember filter: \`${memberQuery}\` → ${fields.length} fields, ${methods.length} methods`
    );
  }

  if (includeEnums && doc.enumConstants.length) {
    lines.push(`\n## Enum constants (${doc.enumConstants.length})`);
    lines.push(doc.enumConstants.join(", "));
  } else if (doc.enumConstants.length) {
    lines.push(
      `\n## Enum constants: ${doc.enumConstants.length} values (truncated). Use mc_lookup_enum / mc_lookup_material to search.`
    );
    lines.push(doc.enumConstants.slice(0, 40).join(", ") + ", …");
  }

  if (fields.length) {
    lines.push(`\n## Fields (${fields.length}${memberQuery ? " matched" : ` / ${doc.fields.length}`})`);
    for (const f of fields.slice(0, 80)) {
      lines.push(`- \`${f.signature}\`${f.description ? ` — ${f.description}` : ""}`);
    }
  }

  if (methods.length) {
    const shown = Math.min(maxMethods, methods.length);
    lines.push(
      `\n## Methods (showing ${shown} of ${methods.length}${memberQuery ? " matched" : `; class has ${doc.methods.length}`})`
    );
    for (const m of methods.slice(0, maxMethods)) {
      lines.push(`- \`${m.signature}\`${m.description ? ` — ${m.description}` : ""}`);
    }
    if (!memberQuery && doc.methods.length > maxMethods) {
      lines.push(
        `\n… ${doc.methods.length - maxMethods} more methods omitted. ` +
          `Pass memberQuery (e.g. \`isFixedTime\`, \`setTime\`) or raise maxMethods — large types like World hide late members at the default limit.`
      );
    }
    if (memberQuery && methods.length === 0) {
      lines.push(
        `\nNo members matched \`${memberQuery}\`. Try mc_search_api on the same string, or mc_explain_error if this came from an exception message.`
      );
    }
  } else if (memberQuery) {
    lines.push(
      `\n## Methods\nNo members matched \`${memberQuery}\`. Try mc_search_api or a shorter memberQuery.`
    );
  }

  if (doc.nestedTypes.length) {
    lines.push(`\n## Nested types`);
    lines.push(doc.nestedTypes.join(", "));
  }

  return lines.join("\n");
}

export async function fetchRawPage(
  version: string,
  relativeOrAbsolute: string,
  platform: Platform = "paper"
): Promise<string> {
  const url = relativeOrAbsolute.startsWith("http")
    ? relativeOrAbsolute
    : new URL(
        relativeOrAbsolute.replace(/^\//, ""),
        javadocBaseUrlFor(platform, version)
      ).toString();
  const html = await fetchText(url, {
    cacheKey: `jd:${platform}:${version || "root"}:raw:${url}`,
  });
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const main = $("main").text() || $("body").text();
  return cleanText(main).slice(0, 30000);
}
