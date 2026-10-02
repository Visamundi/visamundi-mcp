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
});
