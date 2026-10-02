import type { AuthInfo } from "@modelcontextprotocol/server";
import { createDatabaseApi } from "../db.js";
import type { WorkerEnv } from "./env.js";
import {
  AuthServiceUnavailableError,
  looksLikeJwt,
  verifySupabaseJwt,
} from "./verifySupabaseJwt.js";

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

  const db = createDatabaseApi(env.HYPERDRIVE.connectionString);
  let expiresAt = FAR_FUTURE_EXPIRY;
  let credential;

  if (looksLikeJwt(token)) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return unauthorized("JWT authentication is not configured");
    }

    let claims;
    try {
      claims = await verifySupabaseJwt(token, {
        supabaseUrl: env.SUPABASE_URL,
        anonKey: env.SUPABASE_ANON_KEY,
      });
    } catch (error) {
      if (error instanceof AuthServiceUnavailableError) {
        return new Response(
          JSON.stringify({
            error: "temporarily_unavailable",
            error_description: "Authentication service unavailable",
          }),
          { status: 503, headers: { "content-type": "application/json" } }
        );
      }
      throw error;
    }

    if (!claims) {
      return unauthorized("Invalid or expired access token");
    }

    credential = await db.resolveCredentialByUserId(claims.sub);
    if (!credential) {
      return unauthorized("No active partner account for this user");
    }
    expiresAt = claims.exp;
  } else {
    credential = await db.resolveCredentialByApiKey(token);
    if (!credential) {
      return unauthorized("Invalid or revoked MCP API key");
    }
  }

  return {
    token,
    clientId: credential.credentialId,
    scopes: credential.allowedTools,
    expiresAt,
    extra: {
      credentialId: credential.credentialId,
      companyId: credential.companyId,
      connectPartnerName: credential.connectPartnerName,
      connectConfigured: credential.connectConfigured,
      connectToken: credential.connectToken,
    },
  };
}
