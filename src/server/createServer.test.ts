import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./createServer.js";

async function connectClientToServer(
  server = createServer({
    credentialId: "cred-1",
    companyId: "company-1",
    allowedTools: ["list_visas"],
    connectPartnerName: "Partner A",
    connectConfigured: true,
    connectToken: "token",
  })
) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

describe("createServer", () => {
  it("registers only the tools allowed by the credential", async () => {
    const server = createServer({
      credentialId: "cred-1",
      companyId: "company-1",
      allowedTools: ["list_visas", "get_company"],
      connectPartnerName: "Partner A",
      connectConfigured: true,
      connectToken: "token",
    });
    const { client } = await connectClientToServer(server);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();

    expect(toolNames).toEqual(["get_company", "list_visas"]);
    await client.close();
    await server.close();
  });

  it("never exposes company_id as a tool input", async () => {
    const server = createServer({
      credentialId: "cred-1",
      companyId: "company-1",
      allowedTools: ["get_travel_group"],
      connectPartnerName: null,
      connectConfigured: false,
      connectToken: null,
    });
    const { client } = await connectClientToServer(server);

    const tools = await client.listTools();
    const getTravelGroup = tools.tools.find(
      (tool) => tool.name === "get_travel_group"
    );

    expect(getTravelGroup?.inputSchema.properties).toBeDefined();
    expect(getTravelGroup?.inputSchema.properties).not.toHaveProperty("company_id");
    expect(getTravelGroup?.inputSchema.properties).toHaveProperty("travel_group_id");

    await client.close();
    await server.close();
  });
});
