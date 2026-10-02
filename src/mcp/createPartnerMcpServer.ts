import { McpServer, type AuthInfo } from "@modelcontextprotocol/server";
import { type ConnectCache, getVisa } from "../api.js";
import type { DatabaseApi } from "../db.js";
import { registerConnectTools } from "../tools/connect.js";
import { registerSupabaseTools } from "../tools/supabase.js";
import type { CredentialContext, ToolName } from "../types.js";
import { normalizeToolNames } from "../types.js";
import { createVisaLabeler } from "../visaLabels.js";
import {
  buildPartnerServerInstructions,
  registerPartnerVisamundiDocs,
} from "./registerVisamundiDocs.js";

export interface PartnerToolCallEvent {
  toolName: string;
  credentialId: string;
  durationMs: number;
  success: boolean;
  resultChars: number;
  errorMessage?: string;
}

export interface PartnerMcpServerOptions {
  authInfo: AuthInfo;
  db: DatabaseApi;
  fallbackConnectToken?: string | null;
  cache?: ConnectCache;
  onToolCall?: (event: PartnerToolCallEvent) => void;
}

type ToolRegistrar = Pick<McpServer, "registerTool">;
type ToolHandlerResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

function resultText(result: ToolHandlerResult | undefined): string {
  return (result?.content ?? [])
    .map((block) => (block.type === "text" ? block.text ?? "" : ""))
    .join("\n");
}

// Times every partner tool call so agent loops (e.g. bo-partners chat) can be
// traced from the Worker logs without touching each handler.
function withToolCallLogging(
  server: McpServer,
  credentialId: string,
  onToolCall: (event: PartnerToolCallEvent) => void
): ToolRegistrar {
  return {
    registerTool: ((name: string, config: unknown, handler: (...args: unknown[]) => unknown) =>
      server.registerTool(name, config as never, (async (...args: unknown[]) => {
        const startedAt = Date.now();
        try {
          const result = (await handler(...args)) as ToolHandlerResult;
          const text = resultText(result);
          onToolCall({
            toolName: name,
            credentialId,
            durationMs: Date.now() - startedAt,
            success: !result?.isError,
            resultChars: text.length,
            errorMessage: result?.isError ? text.slice(0, 300) : undefined,
          });
          return result;
        } catch (error) {
          onToolCall({
            toolName: name,
            credentialId,
            durationMs: Date.now() - startedAt,
            success: false,
            resultChars: 0,
            errorMessage: error instanceof Error ? error.message : "Unknown error occurred",
          });
          throw error;
        }
      }) as never)) as ToolRegistrar["registerTool"],
  };
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
  cache,
  onToolCall,
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

  const registrar = onToolCall
    ? withToolCallLogging(server, context.credentialId, onToolCall)
    : server;

  registerPartnerVisamundiDocs(server);
  registerConnectTools(registrar, context, allowedTools, {
    fallbackConnectToken: fallbackConnectToken ?? null,
    publicCountryGuard: false,
  });
  const connectToken = context.connectToken ?? fallbackConnectToken ?? null;
  const addVisaLabels = createVisaLabeler(
    connectToken
      ? (id, language) => getVisa({ token: connectToken, id, language, cache })
      : null
  );
  registerSupabaseTools(registrar, context, allowedTools, db, addVisaLabels);

  return server;
}
