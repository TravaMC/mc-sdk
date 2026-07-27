#!/usr/bin/env node
import dns from "node:dns";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// Cloudflare / dual-stack hosts often break Node fetch on Windows via IPv6 ("fetch failed").
dns.setDefaultResultOrder("ipv4first");

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("mc-sdk failed:", err);
  process.exit(1);
});
