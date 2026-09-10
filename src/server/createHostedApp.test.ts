import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { createHostedApp } from "./createHostedApp.js";

const FAR_FUTURE_EXPIRY = 4_102_444_800;
const listeners: Server[] = [];
const hostedApps: Array<ReturnType<typeof createHostedApp>> = [];

afterEach(async () => {
  while (hostedApps.length > 0) {
    const hostedApp = hostedApps.pop();
    await hostedApp?.closeSessions();
  }

  while (listeners.length > 0) {
    const listener = listeners.pop();
    await new Promise<void>((resolve, reject) => {
      listener?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

async function startTestServer() {
  const hostedApp = createHostedApp({
    host: "127.0.0.1",
    publicContext: {
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
      connectToken: "public-token",
    },
    verifier: {
      async verifyAccessToken(token) {
        if (token !== "vm_mcp_valid") {
          throw new InvalidTokenError("Invalid or revoked MCP API key");
        }

        return {
          token,
          clientId: "cred-1",
          scopes: ["connect.list_visas", "supabase.get_company"],
          expiresAt: FAR_FUTURE_EXPIRY,
          extra: {
            credentialId: "cred-1",
            companyId: "company-1",
            connectPartnerName: "Partner A",
            connectConfigured: true,
            connectToken: "token",
          },
        };
      },
    },
  });

  hostedApps.push(hostedApp);

  const listener = hostedApp.app.listen(0, "127.0.0.1");
  listeners.push(listener);
  await new Promise<void>((resolve) => listener.once("listening", () => resolve()));

  const address = listener.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    publicUrl: new URL(`${origin}/`),
    privateUrl: new URL(`${origin}/partners`),
  };
}

describe("createHostedApp", () => {
  it("serves the public route without bearer auth", async () => {
    const { publicUrl } = await startTestServer();
    const client = new Client({
      name: "hosted-public-test",
      version: "1.0.0",
    });
    const transport = new StreamableHTTPClientTransport(publicUrl);

    await client.connect(transport);
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "list_visas",
      "get_visa",
      "get_visa_requirements",
      "get_vaccines",
      "get_customs",
    ]);

    await client.close();
    await transport.close();
  });

  it("serves the private route with bearer auth", async () => {
    const { privateUrl } = await startTestServer();
    const client = new Client({
      name: "hosted-private-test",
      version: "1.0.0",
    });
    const transport = new StreamableHTTPClientTransport(privateUrl, {
      requestInit: {
        headers: {
          Authorization: "Bearer vm_mcp_valid",
        },
      },
    });

    await client.connect(transport);
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "get_company",
      "list_visas",
    ]);

    await client.close();
    await transport.close();
  });

  it("keeps sessions scoped to each route", async () => {
    const { publicUrl, privateUrl } = await startTestServer();
    const publicClient = new Client({
      name: "hosted-public-session-test",
      version: "1.0.0",
    });
    const publicTransport = new StreamableHTTPClientTransport(publicUrl);

    await publicClient.connect(publicTransport);
    const response = await fetch(privateUrl, {
      method: "GET",
      headers: {
        Authorization: "Bearer vm_mcp_valid",
        "mcp-session-id": publicTransport.sessionId ?? "",
      },
    });

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("Invalid or expired session");

    await publicClient.close();
    await publicTransport.close();
  });

  it("rejects invalid bearer tokens", async () => {
    const { privateUrl } = await startTestServer();
    const client = new Client({
      name: "hosted-invalid-test",
      version: "1.0.0",
    });
    const transport = new StreamableHTTPClientTransport(privateUrl, {
      requestInit: {
        headers: {
          Authorization: "Bearer vm_mcp_invalid",
        },
      },
    });

    await expect(client.connect(transport)).rejects.toThrow(/Unauthorized|invalid_token/i);
  });
});
