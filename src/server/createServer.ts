import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConnectTools } from "../tools/connect.js";
import { registerSupabaseTools } from "../tools/supabase.js";
import type { CredentialContext } from "../types.js";

export function createServer(context: CredentialContext): McpServer {
  const server = new McpServer({
    name: "visamundi-partner-mcp",
    version: "2.0.0",
  });

  const allowedTools = new Set(context.allowedTools);

  registerConnectTools(server, context, allowedTools);
  registerSupabaseTools(server, context, allowedTools);

  return server;
}
