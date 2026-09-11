import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { CredentialContext } from "../types.js";
import { registerConnectTools } from "./connect.js";

const {
  ConnectApiError,
  getPublicCustoms,
  getPublicVaccines,
  getVisa,
  listVisas,
} = vi.hoisted(() => ({
  ConnectApiError: class ConnectApiError extends Error {
    constructor(status: number, clientMessage: string) {
      super(clientMessage);
      this.name = "ConnectApiError";
      Object.assign(this, { status, clientMessage });
    }
  },
  getPublicCustoms: vi.fn(),
  getPublicVaccines: vi.fn(),
  getVisa: vi.fn(),
  listVisas: vi.fn(),
}));

vi.mock("../api.js", () => ({
  ConnectApiError,
  sanitizePublicResponse: vi.fn((toolName: string, result: unknown) => ({
    sanitized: true,
    toolName,
    result,
  })),
  listVisas,
  getVisa,
  getVisaRequirements: vi.fn(),
  getPublicVaccines,
  getVaccines: vi.fn(),
  getPublicCustoms,
  getCustoms: vi.fn(),
  listCountries: vi.fn(),
}));

afterEach(() => {
  listVisas.mockReset();
  getVisa.mockReset();
  getPublicVaccines.mockReset();
  getPublicCustoms.mockReset();
});

function createServerHarness() {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>();
  const server = {
    registerTool(name: string, _config: unknown, handler: unknown) {
      handlers.set(name, handler as (...args: any[]) => Promise<unknown>);
      return undefined as never;
    },
  } as unknown as Pick<McpServer, "registerTool">;

  return { handlers, server };
}

function createContext(allowedTools: CredentialContext["allowedTools"]): CredentialContext {
  return {
    credentialId: "cred-1",
    companyId: "company-1",
    allowedTools,
    connectPartnerName: null,
    connectConfigured: false,
    connectToken: null,
  };
}

describe("connect tools", () => {
  it("falls back to the server token when the credential token is missing", async () => {
    listVisas.mockResolvedValueOnce([{ id: 123 }]);

    const { handlers, server } = createServerHarness();
    const context = createContext(["list_visas"]);
    registerConnectTools(server, context, new Set(context.allowedTools), {
      fallbackConnectToken: "server-token",
    });

    const listVisasHandler = handlers.get("list_visas");
    expect(listVisasHandler).toBeDefined();

    await listVisasHandler?.({ destination: "th" });

    expect(listVisas).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "server-token",
        destination: "th",
      })
    );
  });

  it("uses public wrappers for public vaccine and customs tools", async () => {
    getPublicVaccines.mockResolvedValueOnce({ country_code: "TH" });
    getPublicCustoms.mockResolvedValueOnce({ country_code: "TH" });

    const { handlers, server } = createServerHarness();
    const context = createContext(["get_vaccines", "get_customs"]);
    registerConnectTools(server, context, new Set(context.allowedTools), {
      fallbackConnectToken: "server-token",
      publicCountryGuard: true,
    });

    await handlers.get("get_vaccines")?.({ country_code: "TH" });
    await handlers.get("get_customs")?.({ country_code: "TH" });

    expect(getPublicVaccines).toHaveBeenCalledWith(
      expect.objectContaining({ country_code: "TH", token: "server-token" })
    );
    expect(getPublicCustoms).toHaveBeenCalledWith(
      expect.objectContaining({ country_code: "TH", token: "server-token" })
    );
  });

  it("sanitizes public responses and emits audit events", async () => {
    listVisas.mockResolvedValueOnce([{ id: 123 }]);
    const onPublicToolCall = vi.fn();
    const { handlers, server } = createServerHarness();
    const context = createContext(["list_visas"]);
    registerConnectTools(server, context, new Set(context.allowedTools), {
      fallbackConnectToken: "server-token",
      publicCountryGuard: true,
      onPublicToolCall,
    });

    const result = (await handlers.get("list_visas")?.({
      destination: "TH",
    })) as {
      content: Array<{ text: string }>;
    };

    expect(result.content[0]?.text).toContain('"sanitized": true');
    expect(onPublicToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "list_visas",
        success: true,
      })
    );
  });

  it("returns a generic upstream error for public tools", async () => {
    getVisa.mockRejectedValueOnce(
      new ConnectApiError(403, "Connect API unavailable.")
    );

    const { handlers, server } = createServerHarness();
    const context = createContext(["get_visa"]);
    registerConnectTools(server, context, new Set(context.allowedTools), {
      fallbackConnectToken: "server-token",
      publicCountryGuard: true,
    });

    const result = (await handlers.get("get_visa")?.({
      id: 42,
    })) as {
      content: Array<{ text: string }>;
      isError: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("Error: Connect API unavailable.");
  });
});
