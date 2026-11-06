import { readFileSync } from "node:fs";

/** package.json (one level above dist/ and src/). */
export const PKG = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { name: string; version: string };

/** Single User-Agent for every outbound request. */
export const USER_AGENT = `mc-sdk/${PKG.version} (+https://github.com/TravaMC/mc-sdk)`;
