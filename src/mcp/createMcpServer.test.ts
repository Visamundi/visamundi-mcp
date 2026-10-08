import { describe, expect, it, vi } from "vitest";
import type { DatabaseApi } from "../db.js";
import { createPartnerMcpServer } from "./createPartnerMcpServer.js";
import {
  createPublicMcpServer,
  PUBLIC_TOOL_NAMES,
} from "./createPublicMcpServer.js";

function getRegisteredToolNames(server: unknown): string[] {
  const registeredTools = (server as { _registeredTools?: Record<string, unknown> })
    ._registeredTools;

  return Object.keys(registeredTools ?? {}).sort();
}

function getRegisteredResourceNames(server: unknown): string[] {
  const registeredResources = (
    server as { _registeredResources?: Record<string, unknown> }
  )._registeredResources;

  return Object.keys(registeredResources ?? {}).sort();
}

function getRegisteredPromptNames(server: unknown): string[] {
  const registeredPrompts = (server as { _registeredPrompts?: Record<string, unknown> })
    ._registeredPrompts;

  return Object.keys(registeredPrompts ?? {}).sort();
}

function createDatabaseStub(): DatabaseApi {
  return {
    resolveCredentialByApiKey: vi.fn(),
    resolveCredentialByUserId: vi.fn(),
    getConnectToken: vi.fn(),
    getCompany: vi.fn(),
    listTravelGroups: vi.fn(),
    getTravelGroup: vi.fn(),
    listReferredApplications: vi.fn(),
    getReferredApplication: vi.fn(),
    listInvoices: vi.fn(),
    getProcessingLoad: vi.fn(),
    getDeliveryWindow: vi.fn(),
    getAffiliateStats: vi.fn(),
  };
}

describe("MCP server factories", () => {
  it("creates the public server with only the public tool set", () => {
    const server = createPublicMcpServer({ connectToken: "public-token" });

    expect(getRegisteredToolNames(server)).toEqual([...PUBLIC_TOOL_NAMES].sort());
    expect(getRegisteredResourceNames(server)).toEqual([
      "visamundi://docs/country-codes",
      "visamundi://docs/public-tool-guide",
      "visamundi://docs/public-workflows",
    ]);
    expect(getRegisteredPromptNames(server)).toEqual([
      "check-visa-requirements",
      "prepare-trip-briefing",
    ]);
  });

  it("creates the partner server with only credential-allowed tools", () => {
    const server = createPartnerMcpServer({
      authInfo: {
        token: "partner-token",
        clientId: "cred-1",
        scopes: ["list_visas", "get_company"],
        expiresAt: 4_102_444_800,
        extra: {
          credentialId: "cred-1",
          companyId: "company-1",
          connectConfigured: true,
          connectToken: "partner-connect-token",
        },
      },
      db: createDatabaseStub(),
      fallbackConnectToken: "fallback-token",
    });

    expect(getRegisteredToolNames(server)).toEqual(["get_company", "list_visas"]);
    expect(getRegisteredResourceNames(server)).toEqual([
      "visamundi://docs/country-codes",
      "visamundi://docs/partner-tool-guide",
      "visamundi://docs/partner-workflows",
    ]);
    expect(getRegisteredPromptNames(server)).toEqual(["review-travel-group"]);
  });

  it("labels partner records with the visa name and destination from Connect", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) =>
      Response.json({
        data: {
          visa: {
            id: 42617,
            name: "ETA Royaume-Uni",
            destination: { name: { common: "Royaume-Uni" } },
          },
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const db = createDatabaseStub();
    vi.mocked(db.listTravelGroups).mockResolvedValue([
      { travel_group_id: "group-1", document_id: "42617", destination_iso: "GB" },
    ] as never);
    const server = createPartnerMcpServer({
      authInfo: {
        token: "partner-token",
        clientId: "cred-1",
        scopes: ["list_travel_groups"],
        expiresAt: 4_102_444_800,
        extra: { credentialId: "cred-1", companyId: "company-1" },
      },
      db,
      fallbackConnectToken: "fallback-token",
    });
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools;

    const result = (await tools.list_travel_groups.handler({ language: "fr" }, {})) as {
      structuredContent: { items: unknown[] };
    };

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://connect.visamundi.io/v3/visa/42617?language=fr"
    );
    expect(result.structuredContent.items[0]).toMatchObject({
      visa_name: "ETA Royaume-Uni",
      destination_name: "Royaume-Uni",
    });
    vi.unstubAllGlobals();
  });

  it("reports each partner tool call through onToolCall", async () => {
    const db = createDatabaseStub();
    vi.mocked(db.getCompany).mockResolvedValue({ name: "Acme" });
    vi.mocked(db.listInvoices).mockRejectedValue(new Error("db down"));
    const onToolCall = vi.fn();
    const server = createPartnerMcpServer({
      authInfo: {
        token: "partner-token",
        clientId: "cred-1",
        scopes: ["get_company", "list_invoices"],
        expiresAt: 4_102_444_800,
        extra: { credentialId: "cred-1", companyId: "company-1" },
      },
      db,
      onToolCall,
    });
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools;

    await tools.get_company.handler({}, {});
    await tools.list_invoices.handler({}, {});

    expect(onToolCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolName: "get_company",
        credentialId: "cred-1",
        success: true,
        resultChars: JSON.stringify({ name: "Acme" }, null, 2).length,
      })
    );
    expect(onToolCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toolName: "list_invoices",
        success: false,
        errorMessage: "Error: db down",
      })
    );
  });

  it("asks for a search instead of looking a group up by name", async () => {
    const db = createDatabaseStub();
    const server = createPartnerMcpServer({
      authInfo: {
        token: "partner-token",
        clientId: "cred-1",
        scopes: ["list_travel_groups", "get_travel_group"],
        expiresAt: 4_102_444_800,
        extra: { credentialId: "cred-1", companyId: "company-1" },
      },
      db,
    });
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools;

    const result = (await tools.get_travel_group.handler(
      { travel_group_id: "TEST_CA-001" },
      {}
    )) as { isError: boolean; content: Array<{ text: string }> };
    await tools.list_travel_groups.handler({ search: "TEST_CA-001" }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("list_travel_groups with search");
    expect(db.getTravelGroup).not.toHaveBeenCalled();
    expect(db.listTravelGroups).toHaveBeenCalledWith("cred-1", 25, 0, "TEST_CA-001");
  });
});
