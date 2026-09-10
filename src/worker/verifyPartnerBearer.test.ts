import { describe, expect, it, vi } from "vitest";

const resolveCredentialByApiKey = vi.fn();

vi.mock("../db.js", () => ({
  createDatabaseApi: () => ({
    resolveCredentialByApiKey,
  }),
}));

describe("verifyPartnerBearer", () => {
  it("maps a verified bearer token into MCP auth info", async () => {
    resolveCredentialByApiKey.mockResolvedValueOnce({
      credentialId: "cred-1",
      companyId: "company-1",
      allowedTools: ["list_visas"],
      connectPartnerName: "Partner A",
      connectConfigured: true,
      connectToken: "secret",
    });

    const { verifyPartnerBearer } = await import("./verifyPartnerBearer.js");
    const authInfo = await verifyPartnerBearer(
      new Request("https://example.com/partners", {
        headers: {
          Authorization: "Bearer vm_mcp_test",
        },
      }),
      {
        CONNECT_API_MCP_KEY: "fallback-token",
        HYPERDRIVE: { connectionString: "postgres://worker" },
      }
    );

    expect(authInfo).not.toBeInstanceOf(Response);
    expect(authInfo).toMatchObject({
      clientId: "cred-1",
      scopes: ["list_visas"],
      extra: {
        credentialId: "cred-1",
        companyId: "company-1",
        connectPartnerName: "Partner A",
        connectConfigured: true,
        connectToken: "secret",
      },
    });
  });

  it("rejects requests without a bearer token", async () => {
    const { verifyPartnerBearer } = await import("./verifyPartnerBearer.js");
    const result = await verifyPartnerBearer(
      new Request("https://example.com/partners"),
      {
        CONNECT_API_MCP_KEY: "fallback-token",
        HYPERDRIVE: { connectionString: "postgres://worker" },
      }
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});
