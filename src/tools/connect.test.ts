import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const { listVisas } = vi.hoisted(() => ({
  listVisas: vi.fn(),
}));

vi.mock("../api.js", () => ({
  listVisas,
  getVisa: vi.fn(),
  getVisaRequirements: vi.fn(),
  getVaccines: vi.fn(),
  getCustoms: vi.fn(),
  listCountries: vi.fn(),
}));

import { createServer } from "../server/createServer.js";

afterEach(() => {
  listVisas.mockReset();
  delete process.env.CONNECT_API_MCP_KEY;
  delete process.env.VISAMUNDI_TOKEN;
});

describe("connect tools", () => {
  it("falls back to the server token when the credential token is missing", async () => {
    process.env.CONNECT_API_MCP_KEY = "server-token";
    listVisas.mockResolvedValueOnce([{ id: 123 }]);

    const server = createServer({
      credentialId: "cred-1",
      companyId: "company-1",
      allowedTools: ["list_visas"],
      connectPartnerName: null,
      connectConfigured: false,
      connectToken: null,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({
      name: "connect-tools-test",
      version: "1.0.0",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    await client.callTool({
      name: "list_visas",
      arguments: { destination: "th" },
    });

    expect(listVisas).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "server-token",
        destination: "th",
      })
    );

    await client.close();
    await server.close();
  });
});
