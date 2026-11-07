/**
 * MCP server assembly. Tools live in src/tools/* (one module per area), resources in
 * src/resources.ts, prompts in src/prompts.ts.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PKG } from "./meta.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerApiTools } from "./tools/api.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerNmsTools } from "./tools/nms.js";
import { registerProjectTools } from "./tools/project.js";
import { registerVelocityTools } from "./tools/velocity.js";
import { registerVersionTools } from "./tools/version.js";
import { SERVER_INSTRUCTIONS } from "./versionGate.js";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: PKG.name, version: PKG.version },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerVersionTools(server);
  registerApiTools(server);
  registerDocsTools(server);
  registerVelocityTools(server);
  registerProjectTools(server);
  registerNmsTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
