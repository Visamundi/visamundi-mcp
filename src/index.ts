import process from "node:process";
import "dotenv/config";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import type { DatabaseApi } from "./db.js";
import { createDatabaseApi } from "./db.js";
import { createPartnerMcpServer } from "./mcp/createPartnerMcpServer.js";
import { parseAllowedToolsEnv } from "./types.js";

function createUnavailableDatabaseApi(): DatabaseApi {
  const unavailable = async (): Promise<never> => {
    throw new Error("Missing MCP_SUPABASE_DB_URL");
  };

  return {
    resolveCredentialByApiKey: unavailable,
    resolveCredentialByUserId: unavailable,
    getConnectToken: unavailable,
    getCompany: unavailable,
    listTravelGroups: unavailable,
    getTravelGroup: unavailable,
    listReferredApplications: unavailable,
    getReferredApplication: unavailable,
    listInvoices: unavailable,
    getProcessingLoad: unavailable,
    getDeliveryWindow: unavailable,
    getAffiliateStats: unavailable,
  };
}

function createLocalServer() {
  const connectToken =
    process.env.CONNECT_API_MCP_KEY ?? process.env.VISAMUNDI_TOKEN ?? null;
  const allowedTools = parseAllowedToolsEnv(process.env.DEV_MCP_ALLOWED_TOOLS);
  const db = process.env.MCP_SUPABASE_DB_URL
    ? createDatabaseApi(process.env.MCP_SUPABASE_DB_URL)
    : createUnavailableDatabaseApi();

  return createPartnerMcpServer({
    authInfo: {
      token: "local-dev",
      clientId: process.env.DEV_MCP_CREDENTIAL_ID ?? "local-dev",
      scopes: allowedTools,
      expiresAt: 4_102_444_800,
      extra: {
        credentialId: process.env.DEV_MCP_CREDENTIAL_ID ?? "local-dev",
        companyId: process.env.DEV_MCP_COMPANY_ID ?? "local-dev",
        connectPartnerName: process.env.CONNECT_PARTNER_NAME ?? null,
        connectConfigured: Boolean(connectToken),
        connectToken,
      },
    },
    db,
    fallbackConnectToken: connectToken,
  });
}

try {
  serveStdio(() => createLocalServer());
} catch (error) {
  console.error("Fatal error:", error);
  process.exit(1);
}
