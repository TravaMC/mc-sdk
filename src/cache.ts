import { mkdir, readFile, writeFile, readdir, unlink, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/** Fresh window — serve without network. */
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
/** After TTL, keep using disk while revalidating; drop file after this. */
const DEFAULT_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
/** Prune files older than this on write / stats. */
const DEFAULT_PRUNE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function cacheDir(): string {
  return path.join(os.homedir(), ".cache", "mc-sdk");
}

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function cacheFile(key: string): string {
  return path.join(cacheDir(), `${safeKey(key)}.json`);
}

interface CacheEntry<T> {
  fetchedAt: number;
  value: T;
  etag?: string;
  lastModified?: string;
  url?: string;
}

export type CacheHit<T> =
  | { status: "fresh"; value: T; ageMs: number }
  | { status: "stale"; value: T; ageMs: number; entry: CacheEntry<T> }
  | { status: "miss" };

export async function inspectCached<T>(
  key: string,
  ttlMs = DEFAULT_TTL_MS,
  maxStaleMs = DEFAULT_MAX_STALE_MS
): Promise<CacheHit<T>> {
  try {
    const raw = await readFile(cacheFile(key), "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    const ageMs = Date.now() - entry.fetchedAt;
    if (ageMs <= ttlMs) return { status: "fresh", value: entry.value, ageMs };
    if (ageMs <= maxStaleMs) return { status: "stale", value: entry.value, ageMs, entry };
    await unlink(cacheFile(key)).catch(() => undefined);
    return { status: "miss" };
  } catch {
    return { status: "miss" };
  }
}

export async function getCached<T>(
  key: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<T | null> {
  const hit = await inspectCached<T>(key, ttlMs);
  if (hit.status === "fresh") return hit.value;
  return null;
}

export async function setCached<T>(
  key: string,
  value: T,
  meta?: { etag?: string; lastModified?: string; url?: string }
): Promise<void> {
  await mkdir(cacheDir(), { recursive: true });
  const entry: CacheEntry<T> = {
    fetchedAt: Date.now(),
    value,
    etag: meta?.etag,
    lastModified: meta?.lastModified,
    url: meta?.url,
  };
  await writeFile(cacheFile(key), JSON.stringify(entry), "utf8");
  // Opportunistic prune (cheap; ignore errors)
  if (Math.random() < 0.05) {
    void pruneCache({ maxAgeMs: DEFAULT_PRUNE_MAX_AGE_MS }).catch(() => undefined);
  }
}

/** Touch fetchedAt without changing body (HTTP 304). */
async function touchCached<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  await mkdir(cacheDir(), { recursive: true });
  await writeFile(
    cacheFile(key),
    JSON.stringify({ ...entry, fetchedAt: Date.now() }),
    "utf8"
  );
}

/** Large text blobs (mappings) stored as raw files, not JSON-wrapped. */
export async function getCachedText(
  key: string,
  ttlMs = 7 * 24 * 60 * 60 * 1000
): Promise<string | null> {
  try {
    const metaPath = cacheFile(`${key}.meta`);
    const dataPath = path.join(cacheDir(), `${safeKey(key)}.txt`);
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
      fetchedAt: number;
    };
    if (Date.now() - meta.fetchedAt > ttlMs) return null;
    return await readFile(dataPath, "utf8");
  } catch {
    return null;
  }
}

export async function setCachedText(key: string, value: string): Promise<void> {
  await mkdir(cacheDir(), { recursive: true });
  const safe = safeKey(key);
  await writeFile(path.join(cacheDir(), `${safe}.txt`), value, "utf8");
  await writeFile(
    cacheFile(`${key}.meta`),
    JSON.stringify({ fetchedAt: Date.now() }),
    "utf8"
  );
}

export interface FetchTextOptions {
  cacheKey?: string;
  /** Fresh TTL (default 12h). */
  ttlMs?: number;
  /** Serve + revalidate until this age (default 7d). */
  maxStaleMs?: number;
  bypassCache?: boolean;
  retries?: number;
}

/**
 * HTTP GET with automatic cache:
 * - fresh → disk only (no network, no token bloat)
 * - stale → conditional revalidate (If-None-Match / If-Modified-Since); 304 keeps body
 * - network fail + stale → return stale (offline-friendly)
 * Never dumps cache files into tool output — callers parse summaries.
 */
export function formatFetchError(err: unknown, url?: string): string {
  const parts: string[] = [];
  if (url) parts.push(url);
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 4; depth++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      const code = (cur as NodeJS.ErrnoException).code;
      if (code) parts.push(`code=${code}`);
      cur = cur.cause;
      continue;
    }
    parts.push(String(cur));
    break;
  }
  return parts.join(" | ");
}

export async function fetchText(
  url: string,
  options?: FetchTextOptions
): Promise<string> {
  const cacheKey = options?.cacheKey ?? `url:${url}`;
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const maxStaleMs = options?.maxStaleMs ?? DEFAULT_MAX_STALE_MS;

  let staleEntry: CacheEntry<string> | undefined;
  let staleValue: string | undefined;

  if (!options?.bypassCache) {
    const hit = await inspectCached<string>(cacheKey, ttlMs, maxStaleMs);
    if (hit.status === "fresh") return hit.value;
    if (hit.status === "stale") {
      staleEntry = hit.entry;
      staleValue = hit.value;
    }
  }

  const retries = options?.retries ?? 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": "mc-sdk/3.0 (+Paper/Purpur/Velocity MCP)",
        Accept: "*/*",
      };
      if (staleEntry?.etag) headers["If-None-Match"] = staleEntry.etag;
      if (staleEntry?.lastModified) {
        headers["If-Modified-Since"] = staleEntry.lastModified;
      }

      const res = await fetch(url, { headers });

      if (res.status === 304 && staleValue != null && staleEntry) {
        await touchCached(cacheKey, staleEntry);
        return staleValue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      const text = await res.text();
      await setCached(cacheKey, text, {
        etag: res.headers.get("etag") ?? undefined,
        lastModified: res.headers.get("last-modified") ?? undefined,
        url,
      });
      return text;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  // Offline / flaky network: prefer stale over failing the agent turn
  if (staleValue != null) return staleValue;

  throw new Error(formatFetchError(lastError, url));
}

export interface CacheStats {
  dir: string;
  files: number;
  bytes: number;
  oldestAgeMs: number | null;
  newestAgeMs: number | null;
}

export async function getCacheStats(): Promise<CacheStats> {
  const dir = cacheDir();
  let files = 0;
  let bytes = 0;
  let oldest: number | null = null;
  let newest: number | null = null;
  const now = Date.now();
  try {
    const names = await readdir(dir);
    for (const name of names) {
      try {
        const st = await stat(path.join(dir, name));
        if (!st.isFile()) continue;
        files += 1;
        bytes += st.size;
        const age = now - st.mtimeMs;
        if (oldest == null || age > oldest) oldest = age;
        if (newest == null || age < newest) newest = age;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* empty */
  }
  return { dir, files, bytes, oldestAgeMs: oldest, newestAgeMs: newest };
}

export async function pruneCache(options?: {
  maxAgeMs?: number;
}): Promise<{ removed: number; freedBytes: number }> {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_PRUNE_MAX_AGE_MS;
  const dir = cacheDir();
  let removed = 0;
  let freedBytes = 0;
  const now = Date.now();
  try {
    const names = await readdir(dir);
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        const st = await stat(full);
        if (!st.isFile()) continue;
        if (now - st.mtimeMs > maxAgeMs) {
          freedBytes += st.size;
          await unlink(full);
          removed += 1;
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* empty */
  }
  return { removed, freedBytes };
}

export async function clearCache(options?: {
  prefix?: string;
}): Promise<{ removed: number }> {
  const dir = cacheDir();
  let removed = 0;
  const needle = options?.prefix ? safeKey(options.prefix) : null;
  try {
    const names = await readdir(dir);
    for (const name of names) {
      if (needle && !name.includes(needle)) continue;
      try {
        await unlink(path.join(dir, name));
        removed += 1;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* empty */
  }
  return { removed };
}
