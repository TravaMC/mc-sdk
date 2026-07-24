export type Platform = "paper" | "velocity" | "folia" | "purpur";

export function javadocBaseUrlFor(
  platform: Platform,
  version: string
): string {
  if (platform === "velocity") {
    if (!version || version === "latest" || version === "root") {
      return "https://jd.papermc.io/velocity/";
    }
    return `https://jd.papermc.io/velocity/${version}/`;
  }
  if (platform === "folia") {
    if (!version || version === "latest" || version === "root") {
      return "https://jd.papermc.io/folia/";
    }
    return `https://jd.papermc.io/folia/${version}/`;
  }
  if (platform === "purpur") {
    // Purpur publishes a single JD tree (not versioned by path)
    return "https://purpurmc.org/javadoc/";
  }
  return `https://jd.papermc.io/paper/${version}/`;
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "velocity":
      return "Velocity";
    case "folia":
      return "Folia";
    case "purpur":
      return "Purpur";
    default:
      return "Paper";
  }
}

/** Normalize a detected dependency version string to a JD-friendly id. */
export function stripSnapshotSuffix(raw: string): string {
  return raw
    .replace(/-R0\.1-SNAPSHOT$/i, "")
    .replace(/\.build\.\d+.*$/i, "")
    .replace(/\.build\.\+$/i, "")
    .replace(/-SNAPSHOT$/i, "")
    .trim();
}

/** For Purpur JD searches, ignore path version (always root). */
export function javadocSearchVersion(
  platform: Platform,
  version: string
): string {
  if (platform === "purpur") return "";
  if (version === "latest" || version === "root") return "";
  return version;
}
