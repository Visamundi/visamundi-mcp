import process from "node:process";
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server/createServer.js";
import { parseAllowedToolsEnv } from "./types.js";

async function main(): Promise<void> {
  const connectToken =
    process.env.CONNECT_API_MCP_KEY ?? process.env.VISAMUNDI_TOKEN ?? null;
  const server = createServer({
    credentialId: process.env.DEV_MCP_CREDENTIAL_ID ?? "local-dev",
    companyId: process.env.DEV_MCP_COMPANY_ID ?? "local-dev",
    allowedTools: parseAllowedToolsEnv(process.env.DEV_MCP_ALLOWED_TOOLS),
    connectPartnerName: process.env.CONNECT_PARTNER_NAME ?? null,
    connectConfigured: Boolean(connectToken),
    connectToken,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
