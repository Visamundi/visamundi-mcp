import { McpServer, type AuthInfo } from "@modelcontextprotocol/server";
import type { DatabaseApi } from "../db.js";
import { registerConnectTools } from "../tools/connect.js";
import { registerSupabaseTools } from "../tools/supabase.js";
import type { CredentialContext, ToolName } from "../types.js";
import { normalizeToolNames } from "../types.js";
import {
  buildPartnerServerInstructions,
  registerPartnerVisamundiDocs,
} from "./registerVisamundiDocs.js";

export interface PartnerMcpServerOptions {
  authInfo: AuthInfo;
  db: DatabaseApi;
  fallbackConnectToken?: string | null;
}

export function authInfoToCredentialContext(authInfo: AuthInfo): CredentialContext {
  const extra = authInfo.extra ?? {};

  return {
    credentialId: String(extra.credentialId ?? authInfo.clientId),
    companyId: String(extra.companyId ?? ""),
    allowedTools: normalizeToolNames(authInfo.scopes as ToolName[]),
    connectPartnerName:
      typeof extra.connectPartnerName === "string"
        ? extra.connectPartnerName
        : null,
    connectConfigured: Boolean(extra.connectConfigured),
    connectToken:
      typeof extra.connectToken === "string" ? extra.connectToken : null,
  };
}

export function createPartnerMcpServer({
  authInfo,
  db,
  fallbackConnectToken,
}: PartnerMcpServerOptions): McpServer {
  const context = authInfoToCredentialContext(authInfo);
  const allowedTools = new Set(context.allowedTools);
  const server = new McpServer(
    {
      name: "visamundi-partner-mcp",
      version: "2.0.0",
    },
    {
      instructions: buildPartnerServerInstructions(context.allowedTools),
    }
  );

  registerPartnerVisamundiDocs(server);
  registerConnectTools(server, context, allowedTools, {
    fallbackConnectToken: fallbackConnectToken ?? null,
    publicCountryGuard: false,
  });
  registerSupabaseTools(server, context, allowedTools, db);

  return server;
}
