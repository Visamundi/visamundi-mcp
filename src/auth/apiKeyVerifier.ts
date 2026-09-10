import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { resolveCredentialByApiKey } from "../db.js";

const FAR_FUTURE_EXPIRY = 4_102_444_800;

export const apiKeyVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const credential = await resolveCredentialByApiKey(token);

    if (!credential) {
      throw new InvalidTokenError("Invalid or revoked MCP API key");
    }

    return {
      token,
      clientId: credential.credentialId,
      scopes: credential.allowedTools,
      expiresAt: FAR_FUTURE_EXPIRY,
      extra: {
        credentialId: credential.credentialId,
        companyId: credential.companyId,
        connectPartnerName: credential.connectPartnerName,
        connectConfigured: credential.connectConfigured,
        connectToken: credential.connectToken,
      },
    };
  },
};
