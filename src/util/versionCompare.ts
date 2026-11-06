/**
 * Version ordering shared by Paper (26.3, 1.21.11, 26.1.2-rc-1), Velocity (4.3.1, 4.3.2-SNAPSHOT)
 * and Gradle (9.7.1). Numeric dotted core first; a pre-release suffix sorts before its release.
 */
function coreParts(v: string): number[] {
  return v
    .split("-")[0]
    .split(".")
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

export function compareVersions(a: string, b: string): number {
  const pa = coreParts(a);
  const pb = coreParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  const preA = a.includes("-");
  const preB = b.includes("-");
  if (preA !== preB) return preA ? -1 : 1; // 26.3-rc-3 < 26.3
  return a.localeCompare(b);
}

/** Newest first. */
export function sortVersionsDesc(versions: Iterable<string>): string[] {
  return [...new Set(versions)].sort((a, b) => compareVersions(b, a));
}
