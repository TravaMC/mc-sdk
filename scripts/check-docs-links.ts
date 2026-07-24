#!/usr/bin/env node
/**
 * HEAD-check curated docs catalog URLs (PaperMC + external Purpur).
 */
import { DOCS_CATALOG, DOCS_CATALOG_EXTERNAL } from "../src/docs/papermc.js";

const BASE = "https://docs.papermc.io";

async function headOk(url: string): Promise<{ url: string; ok: boolean; status: number }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "mc-sdk-docs-check/3.0" },
    });
    return { url, ok: res.ok, status: res.status };
  } catch {
    return { url, ok: false, status: 0 };
  }
}

async function main() {
  const failures = [];
  const all = [
    ...DOCS_CATALOG.map((p) => `${BASE}${p.path}`),
    ...DOCS_CATALOG_EXTERNAL.map((p) => p.url),
  ];
  const batch = 6;
  for (let i = 0; i < all.length; i += batch) {
    const slice = all.slice(i, i + batch);
    const results = await Promise.all(slice.map(headOk));
    for (const r of results) {
      console.log(`${r.ok ? "OK" : "FAIL"} ${r.status} ${r.url}`);
      if (!r.ok) failures.push(r);
    }
  }
  if (failures.length) {
    console.error(`\n${failures.length} broken doc link(s)`);
    process.exit(1);
  }
  console.log(`\nAll ${all.length} docs catalog URLs OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
