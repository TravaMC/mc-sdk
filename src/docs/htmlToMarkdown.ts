/**
 * Small HTML → Markdown renderer for documentation pages (docs.papermc.io, purpurmc.org …).
 * Keeps what an agent needs: headings, paragraphs, lists, code blocks, inline code, tables, notes.
 * Not a general converter — unknown elements fall through to their text.
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

const BLOCK_SKIP = new Set(["script", "style", "noscript", "nav", "footer", "header", "svg", "button", "form", "iframe"]);

function collapse(s: string): string {
  return s.replace(/\s+/g, " ");
}

export function htmlToMarkdown(html: string, baseUrl?: string): { title: string; markdown: string } {
  const $ = cheerio.load(html);
  $(
    "script, style, noscript, nav, footer, .sidebar, aside.sidebar, .theme-doc-toc-desktop, .pagination-nav, .sl-sidebar, starlight-toc, .right-sidebar, .sr-only, .sl-anchor-link, .anchor-link, .hash-link"
  ).remove();
  const title = collapse($("h1").first().text()).trim() || collapse($("title").text()).trim();
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");

  const inline = (nodes: AnyNode[]): string => nodes.map(inlineNode).join("");

  function inlineNode(node: AnyNode): string {
    if (node.type === "text") return collapse((node as unknown as { data: string }).data);
    if (node.type !== "tag") return "";
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (BLOCK_SKIP.has(tag)) return "";
    const kids = inline(el.children as AnyNode[]);
    switch (tag) {
      case "code":
        return "`" + $(el).text().replace(/`/g, "\\`") + "`";
      case "strong":
      case "b":
        return kids.trim() ? `**${kids.trim()}**` : "";
      case "em":
      case "i":
        return kids.trim() ? `*${kids.trim()}*` : "";
      case "br":
        return "\n";
      case "a": {
        const href = $(el).attr("href");
        const text = kids.trim();
        if (!href || !text || href.startsWith("#")) return text;
        let url = href;
        try {
          url = baseUrl ? new URL(href, baseUrl).toString() : href;
        } catch {
          /* keep raw */
        }
        return `[${text}](${url})`;
      }
      case "img":
        return "";
      default:
        return kids;
    }
  }

  const out: string[] = [];
  const push = (block: string) => {
    const b = block.replace(/[ \t]+\n/g, "\n").trim();
    // Starlight heading anchors ("Section titled “Example”") carry no content.
    if (b && !/^Section titled\b/.test(b)) out.push(b);
  };

  /** Lines of a (possibly nested) list; indentation is kept because it is not pushed per level. */
  function listLines(list: Element, depth: number): string[] {
    const ordered = list.tagName.toLowerCase() === "ol";
    const lines: string[] = [];
    let n = 0;
    $(list)
      .children("li")
      .each((_, li) => {
        n++;
        const own: AnyNode[] = [];
        const nested: string[] = [];
        for (const c of (li as Element).children as AnyNode[]) {
          if (c.type === "tag" && /^(ul|ol)$/i.test((c as Element).tagName)) {
            nested.push(...listLines(c as Element, depth + 1));
          } else own.push(c);
        }
        lines.push(`${"  ".repeat(depth)}${ordered ? `${n}.` : "-"} ${inline(own).trim()}`);
        lines.push(...nested);
      });
    return lines;
  }

  function block(node: AnyNode, listDepth = 0): void {
    if (node.type === "text") {
      const t = collapse((node as unknown as { data: string }).data).trim();
      if (t) push(t);
      return;
    }
    if (node.type !== "tag") return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (BLOCK_SKIP.has(tag)) return;
    const $el = $(el);
    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      const text = inline(el.children as AnyNode[]).replace(/Section titled.*$/i, "").trim();
      if (text) push(`${"#".repeat(Number(h[1]))} ${text}`);
      return;
    }
    switch (tag) {
      case "p":
        push(inline(el.children as AnyNode[]));
        return;
      case "pre": {
        const lang =
          ($el.attr("data-language") ||
            $el.find("code").attr("class")?.match(/language-(\w+)/)?.[1] ||
            "") ?? "";
        // Expressive Code / Shiki render one .ec-line / .line per source line.
        const lines = $el.find(".ec-line, .line");
        const code = lines.length
          ? lines.map((_, l) => $(l).text()).get().join("\n")
          : $el.text();
        push("```" + lang + "\n" + code.replace(/\n+$/, "") + "\n```");
        return;
      }
      case "ul":
      case "ol":
        push(listLines(el, listDepth).join("\n"));
        return;
      case "table": {
        const rows = $el.find("tr").map((_, tr) =>
          "| " +
          $(tr)
            .children("th, td")
            .map((__, c) => inline((c as Element).children as AnyNode[]).trim().replace(/\|/g, "\\|"))
            .get()
            .join(" | ") +
          " |"
        ).get();
        if (rows.length) {
          const cols = (rows[0].match(/ \| /g)?.length ?? 0) + 1;
          rows.splice(1, 0, "|" + " --- |".repeat(cols));
          push(rows.join("\n"));
        }
        return;
      }
      case "blockquote":
      case "aside": {
        const save = out.length;
        for (const c of el.children as AnyNode[]) block(c, listDepth);
        const inner = out.splice(save).join("\n\n");
        if (inner) push(inner.split("\n").map((l) => `> ${l}`).join("\n"));
        return;
      }
      default:
        for (const c of el.children as AnyNode[]) block(c, listDepth);
    }
  }

  for (const c of root.get(0)?.children ?? []) block(c as AnyNode);
  return { title, markdown: out.join("\n\n").replace(/\n{3,}/g, "\n\n") };
}
