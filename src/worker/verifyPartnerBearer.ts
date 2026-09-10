import type { AuthInfo } from "@modelcontextprotocol/server";
import { createDatabaseApi } from "../db.js";
import type { WorkerEnv } from "./env.js";

const FAR_FUTURE_EXPIRY = 4_102_444_800;

function unauthorized(message: string): Response {
  return new Response(
    JSON.stringify({
      error: "invalid_token",
      error_description: message,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'Bearer error="invalid_token"',
      },
    }
  );
}

export async function verifyPartnerBearer(
  request: Request,
  env: WorkerEnv
): Promise<AuthInfo | Response> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return unauthorized("Missing bearer token");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return unauthorized("Missing bearer token");
  }

  const credential = await createDatabaseApi(
    env.HYPERDRIVE.connectionString
  ).resolveCredentialByApiKey(token);

  if (!credential) {
    return unauthorized("Invalid or revoked MCP API key");
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
}
