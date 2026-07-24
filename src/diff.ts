import { loadSearchIndexes } from "./javadoc/search.js";

export async function diffApiVersions(
  fromVersion: string,
  toVersion: string,
  options?: { limit?: number; packagePrefix?: string }
) {
  const limit = options?.limit ?? 80;
  const prefix = options?.packagePrefix;

  const [fromIdx, toIdx] = await Promise.all([
    loadSearchIndexes(fromVersion),
    loadSearchIndexes(toVersion),
  ]);

  const keyOf = (p?: string, l?: string) => `${p ?? ""}.${l ?? ""}`;

  const fromTypes = new Map(
    fromIdx.types
      .filter((t) => !prefix || (t.p ?? "").startsWith(prefix))
      .map((t) => [keyOf(t.p, t.l), t])
  );
  const toTypes = new Map(
    toIdx.types
      .filter((t) => !prefix || (t.p ?? "").startsWith(prefix))
      .map((t) => [keyOf(t.p, t.l), t])
  );

  const added: string[] = [];
  const removed: string[] = [];

  for (const k of toTypes.keys()) {
    if (!fromTypes.has(k)) added.push(k);
  }
  for (const k of fromTypes.keys()) {
    if (!toTypes.has(k)) removed.push(k);
  }

  added.sort();
  removed.sort();

  return {
    fromVersion,
    toVersion,
    addedCount: added.length,
    removedCount: removed.length,
    added: added.slice(0, limit),
    removed: removed.slice(0, limit),
    truncated: added.length > limit || removed.length > limit,
  };
}
