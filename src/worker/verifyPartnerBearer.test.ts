import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCredentialByApiKey = vi.fn();
const resolveCredentialByUserId = vi.fn();
const verifySupabaseJwt = vi.fn();

vi.mock("../db.js", () => ({
  createDatabaseApi: () => ({
    resolveCredentialByApiKey,
    resolveCredentialByUserId,
  }),
}));

vi.mock("./verifySupabaseJwt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./verifySupabaseJwt.js")>()),
  verifySupabaseJwt,
}));

const JWT = "aaa.bbb.ccc";
const jwtEnv = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_test",
  HYPERDRIVE: { connectionString: "postgres://worker" },
};

function jwtRequest() {
  return new Request("https://example.com/partners", {
    headers: { Authorization: `Bearer ${JWT}` },
  });
}

describe("verifyPartnerBearer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("maps a verified Supabase JWT to the user's credential", async () => {
    verifySupabaseJwt.mockResolvedValueOnce({ sub: "user-1", exp: 2_000_000_000 });
    resolveCredentialByUserId.mockResolvedValueOnce({
      credentialId: "cred-1",
      companyId: "company-1",
      allowedTools: ["list_visas", "get_company"],
      connectPartnerName: null,
      connectConfigured: false,
      connectToken: null,
    });

    const { verifyPartnerBearer } = await import("./verifyPartnerBearer.js");
    const authInfo = await verifyPartnerBearer(jwtRequest(), jwtEnv);

    expect(resolveCredentialByUserId).toHaveBeenCalledWith("user-1");
    expect(authInfo).toMatchObject({
      clientId: "cred-1",
      scopes: ["list_visas", "get_company"],
      expiresAt: 2_000_000_000,
    });
  });

  it("rejects a JWT that fails verification", async () => {
    verifySupabaseJwt.mockResolvedValueOnce(null);

    const { verifyPartnerBearer } = await import("./verifyPartnerBearer.js");
    const result = await verifyPartnerBearer(jwtRequest(), jwtEnv);

    expect((result as Response).status).toBe(401);
  });

  it("rejects a valid JWT whose user has no eligible partner account", async () => {
    verifySupabaseJwt.mockResolvedValueOnce({ sub: "user-2", exp: 2_000_000_000 });
    resolveCredentialByUserId.mockResolvedValueOnce(null);

    const { verifyPartnerBearer } = await import("./verifyPartnerBearer.js");
    const result = await verifyPartnerBearer(jwtRequest(), jwtEnv);

    expect((result as Response).status).toBe(401);
  });

  it("rejects JWTs when SUPABASE_URL is not configured", async () => {
    const { verifyPartnerBearer } = await import("./verifyPartnerBearer.js");
    const result = await verifyPartnerBearer(jwtRequest(), {
      HYPERDRIVE: { connectionString: "postgres://worker" },
    });

    expect((result as Response).status).toBe(401);
    expect(verifySupabaseJwt).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase Auth is unavailable", async () => {
    const { AuthServiceUnavailableError } = await import("./verifySupabaseJwt.js");
    verifySupabaseJwt.mockRejectedValueOnce(new AuthServiceUnavailableError("down"));

    const { verifyPartnerBearer } = await import("./verifyPartnerBearer.js");
    const result = await verifyPartnerBearer(jwtRequest(), jwtEnv);

    expect((result as Response).status).toBe(503);
  });
});
