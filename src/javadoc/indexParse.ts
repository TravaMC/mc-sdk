import { USER_AGENT } from "../meta.js";

/**
 * Javadoc `*-search-index.js` files are `varName = [ {...}, ... ];updateSearchResults();`.
 * Extract the JSON array without eval.
 */
export function parseJsIndexArray<T>(source: string, varName: string): T[] {
  const marker = `${varName} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${varName} in search index`);
  let i = start + marker.length;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] !== "[") throw new Error(`Expected array for ${varName}`);

  let depth = 0;
  let inString = false;
  let escape = false;
  const begin = i;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return JSON.parse(source.slice(begin, i + 1)) as T[];
    }
  }
  throw new Error(`Unterminated array for ${varName}`);
}

/** HEAD `${base}type-search-index.js` — true when a Javadoc tree exists at that base URL. */
export async function javadocTreeExists(base: string, timeoutMs = 8_000): Promise<boolean> {
  try {
    const res = await fetch(`${base}type-search-index.js`, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}
