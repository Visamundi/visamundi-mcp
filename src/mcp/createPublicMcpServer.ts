import { McpServer } from "@modelcontextprotocol/server";
import type { ConnectCache } from "../api.js";
import {
  registerConnectTools,
  type PublicToolCallEvent,
} from "../tools/connect.js";
import type { CredentialContext } from "../types.js";
import {
  registerApplicationTools,
  type ApplicationToolCallEvent,
  type FormAgentApiConfig,
} from "../tools/applications.js";
import {
  APPLICATION_SERVER_INSTRUCTIONS,
  PUBLIC_SERVER_INSTRUCTIONS,
  registerApplicationDocs,
  registerPublicVisamundiDocs,
} from "./registerVisamundiDocs.js";

export const PUBLIC_TOOL_NAMES = [
  "list_visas",
  "get_visa",
  "get_visa_requirements",
  "get_vaccines",
  "get_customs",
] as const;

export interface PublicMcpServerOptions {
  connectToken?: string | null;
  cache?: ConnectCache;
  onPublicToolCall?: (event: PublicToolCallEvent | ApplicationToolCallEvent) => void;
  /** form-visamundi-next agent API; the application tools are registered only when set. */
  formAgentApi?: FormAgentApiConfig | null;
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
  const server = new McpServer(
    {
      name: "visamundi-public-mcp",
      version: "2.0.0",
    },
    {
      instructions: options.formAgentApi
        ? `${PUBLIC_SERVER_INSTRUCTIONS}\n\n${APPLICATION_SERVER_INSTRUCTIONS}`
        : PUBLIC_SERVER_INSTRUCTIONS,
    }
  );

  registerPublicVisamundiDocs(server);
  registerConnectTools(server, context, new Set(context.allowedTools), {
    fallbackConnectToken: options.connectToken ?? null,
    publicCountryGuard: true,
    cache: options.cache,
    onPublicToolCall: options.onPublicToolCall,
  });

  if (options.formAgentApi) {
    registerApplicationDocs(server);
    registerApplicationTools(server, options.formAgentApi, {
      onToolCall: options.onPublicToolCall,
    });
  }

  return server;
}
