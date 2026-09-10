import { describe, expect, it, vi } from "vitest";

const resolveCredentialByApiKey = vi.fn();

vi.mock("../db.js", () => ({
  resolveCredentialByApiKey,
}));

describe("apiKeyVerifier", () => {
  it("maps a resolved credential into MCP auth info", async () => {
    resolveCredentialByApiKey.mockResolvedValueOnce({
      credentialId: "cred-1",
      companyId: "company-1",
      allowedTools: ["list_visas"],
      connectPartnerName: "Partner A",
      connectConfigured: true,
      connectToken: "secret",
    });

    const { apiKeyVerifier } = await import("./apiKeyVerifier.js");
    const authInfo = await apiKeyVerifier.verifyAccessToken("vm_mcp_test");

    expect(authInfo.clientId).toBe("cred-1");
    expect(authInfo.scopes).toEqual(["list_visas"]);
    expect(authInfo.extra).toMatchObject({
      credentialId: "cred-1",
      companyId: "company-1",
      connectPartnerName: "Partner A",
      connectConfigured: true,
      connectToken: "secret",
    });
  });

  it("rejects missing or revoked keys", async () => {
    resolveCredentialByApiKey.mockResolvedValueOnce(null);

    const { apiKeyVerifier } = await import("./apiKeyVerifier.js");

    await expect(
      apiKeyVerifier.verifyAccessToken("vm_mcp_invalid")
    ).rejects.toThrow("Invalid or revoked MCP API key");
  });
});
