import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { CredentialContext } from "../types.js";
import { registerConnectTools } from "./connect.js";

const { listVisas } = vi.hoisted(() => ({
  listVisas: vi.fn(),
}));

vi.mock("../api.js", () => ({
  listVisas,
  getVisa: vi.fn(),
  getVisaRequirements: vi.fn(),
  getPublicVaccines: vi.fn(),
  getVaccines: vi.fn(),
  getPublicCustoms: vi.fn(),
  getCustoms: vi.fn(),
  listCountries: vi.fn(),
}));

afterEach(() => {
  listVisas.mockReset();
});

describe("connect tools", () => {
  it("falls back to the server token when the credential token is missing", async () => {
    listVisas.mockResolvedValueOnce([{ id: 123 }]);

    const handlers = new Map<string, (...args: any[]) => Promise<unknown>>();
    const server = {
      registerTool(
        name: string,
        _config: unknown,
        handler: unknown
      ) {
        handlers.set(name, handler as (...args: any[]) => Promise<unknown>);
        return undefined as never;
      },
    } as unknown as Pick<McpServer, "registerTool">;
    const context: CredentialContext = {
      credentialId: "cred-1",
      companyId: "company-1",
      allowedTools: ["list_visas"],
      connectPartnerName: null,
      connectConfigured: false,
      connectToken: null,
    };
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
});
