import { McpServer } from "@modelcontextprotocol/server";
import { registerConnectTools } from "../tools/connect.js";
import type { CredentialContext } from "../types.js";

export const PUBLIC_TOOL_NAMES = [
  "list_visas",
  "get_visa",
  "get_visa_requirements",
  "get_vaccines",
  "get_customs",
] as const;

export interface PublicMcpServerOptions {
  connectToken?: string | null;
}

export function createPublicCredentialContext(
  connectToken?: string | null
): CredentialContext {
  return {
    credentialId: "public",
    companyId: "public",
    allowedTools: [...PUBLIC_TOOL_NAMES],
    connectPartnerName: null,
    connectConfigured: Boolean(connectToken),
    connectToken: connectToken ?? null,
  };
}

export function createPublicMcpServer(
  options: PublicMcpServerOptions = {}
): McpServer {
  const context = createPublicCredentialContext(options.connectToken);
  const server = new McpServer({
    name: "visamundi-partner-mcp",
    version: "2.0.0",
  });

  registerConnectTools(server, context, new Set(context.allowedTools), {
    fallbackConnectToken: options.connectToken ?? null,
    publicCountryGuard: true,
  });

  return server;
}
