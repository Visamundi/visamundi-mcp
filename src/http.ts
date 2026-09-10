import process from "node:process";
import "dotenv/config";
import { apiKeyVerifier } from "./auth/apiKeyVerifier.js";
import { closeDbPool } from "./db.js";
import { createHostedApp } from "./server/createHostedApp.js";
import type { CredentialContext } from "./types.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const allowedHosts = process.env.MCP_ALLOWED_HOSTS
  ? process.env.MCP_ALLOWED_HOSTS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  : undefined;
const publicConnectToken =
  process.env.CONNECT_API_MCP_KEY ?? process.env.VISAMUNDI_TOKEN ?? null;

if (!publicConnectToken) {
  throw new Error("Missing public Connect API token");
}

const publicContext: CredentialContext = {
  credentialId: "public",
  companyId: "public",
  allowedTools: [
    "list_visas",
    "get_visa",
    "get_visa_requirements",
    "get_vaccines",
    "get_customs",
  ],
  connectPartnerName: null,
  connectConfigured: true,
  connectToken: publicConnectToken,
};

const hostedApp = createHostedApp({
  host,
  allowedHosts,
  verifier: apiKeyVerifier,
  publicContext,
});

const listener = hostedApp.app.listen(port, host, () => {
  console.log(`Public MCP server listening on http://${host}:${port}/`);
  console.log(`Private MCP server listening on http://${host}:${port}/partners`);
});

async function shutdown() {
  await hostedApp.closeSessions();
  await closeDbPool().catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    listener.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

process.on("SIGINT", () => {
  void shutdown()
    .catch((error) => {
      console.error("Error during shutdown:", error);
    })
    .finally(() => process.exit(0));
});
