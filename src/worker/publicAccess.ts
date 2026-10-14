import { hashApiKey } from "../db.js";
import type { PublicToolName } from "../api.js";
import {
  APPLICATION_TOOL_NAMES,
  type ApplicationToolName,
} from "../tools/applications.js";
import { parseBooleanEnv, type WorkerEnv } from "./env.js";

export interface PublicActor {
  id: string;
  authMode: "anonymous" | "public_key";
  apiKeyId?: string;
}

export type PublicRouteToolName = PublicToolName | ApplicationToolName;

const PUBLIC_ROUTE_TOOL_NAMES: readonly string[] = [
  "list_visas",
  "get_visa",
  "get_visa_requirements",
  "get_vaccines",
  "get_customs",
  ...APPLICATION_TOOL_NAMES,
];

const APPLICATION_WRITE_TOOLS: readonly string[] = ["save_application", "get_payment_link"];

export interface ParsedMcpRequest {
  method?: string;
  toolName?: PublicRouteToolName;
  arguments: Record<string, unknown>;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, error_description: message }), {
    status,
    headers: {
      "content-type": "application/json",
      // The WebMCP bridge calls this route from the browser: errors must stay readable.
      "access-control-allow-origin": "*",
    },
  });
}

function getPresentedApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token) {
      return token;
    }
  }

  const headerKey = request.headers.get("x-mcp-key")?.trim();
  return headerKey || null;
}

function parseStoredPublicKey(
  stored: string,
  fallbackId: string
): { id: string } {
  try {
    const parsed = JSON.parse(stored) as { id?: string };
    return {
      id: parsed.id?.trim() || fallbackId,
    };
  } catch {
    return {
      id: stored.trim() || fallbackId,
    };
  }
}

export async function authorizePublicRequest(
  request: Request,
  env: WorkerEnv
): Promise<PublicActor | Response> {
  const presentedKey = getPresentedApiKey(request);
  const requireApiKey = parseBooleanEnv(env.PUBLIC_MCP_REQUIRE_API_KEY, false);
  const allowAnonymous = parseBooleanEnv(
    env.ALLOW_ANONYMOUS_PUBLIC,
    !requireApiKey
  );

  if (!presentedKey) {
    if (allowAnonymous) {
      return {
        id: `anonymous:${request.headers.get("cf-connecting-ip") ?? "unknown"}`,
        authMode: "anonymous",
      };
    }

    return jsonError(401, "invalid_token", "Missing public API key");
  }

  if (!env.PUBLIC_MCP_KEYS) {
    return jsonError(503, "server_error", "Public API key store is not configured");
  }

  const hashedKey = hashApiKey(presentedKey);
  const stored = await env.PUBLIC_MCP_KEYS.get(hashedKey);
  if (!stored) {
    return jsonError(401, "invalid_token", "Invalid public API key");
  }

  const keyId = parseStoredPublicKey(stored, hashedKey.slice(0, 12)).id;
  return {
    id: `public-key:${keyId}`,
    authMode: "public_key",
    apiKeyId: keyId,
  };
}

export async function parsePublicMcpRequest(
  request: Request
): Promise<ParsedMcpRequest> {
  if (request.method !== "POST") {
    return {
      arguments: {},
    };
  }

  try {
    const body = (await request.clone().json()) as {
      method?: string;
      params?: {
        name?: string;
        arguments?: Record<string, unknown>;
      };
    };
    const toolName =
      body.method === "tools/call" &&
      typeof body.params?.name === "string" &&
      PUBLIC_ROUTE_TOOL_NAMES.includes(body.params.name)
        ? (body.params.name as PublicRouteToolName)
        : undefined;

    return {
      method: body.method,
      toolName,
      arguments: body.params?.arguments ?? {},
    };
  } catch {
    return {
      arguments: {},
    };
  }
}

function rateLimitResponse(message: string): Response {
  return jsonError(429, "rate_limited", message);
}

export async function enforcePublicRateLimits(
  env: WorkerEnv,
  actor: PublicActor,
  toolName?: PublicRouteToolName
): Promise<Response | null> {
  if (env.PUBLIC_ROUTE_RATE_LIMITER) {
    const { success } = await env.PUBLIC_ROUTE_RATE_LIMITER.limit({
      key: actor.id,
    });

    if (!success) {
      return rateLimitResponse("Public MCP rate limit exceeded");
    }
  }

  if (toolName === "get_visa" && env.PUBLIC_GET_VISA_RATE_LIMITER) {
    const { success } = await env.PUBLIC_GET_VISA_RATE_LIMITER.limit({
      key: actor.id,
    });

    if (!success) {
      return rateLimitResponse("Public MCP get_visa rate limit exceeded");
    }
  }

  if (
    toolName &&
    APPLICATION_WRITE_TOOLS.includes(toolName) &&
    env.APPLICATION_WRITE_RATE_LIMITER
  ) {
    const { success } = await env.APPLICATION_WRITE_RATE_LIMITER.limit({
      key: actor.id,
    });

    if (!success) {
      return rateLimitResponse("Visa application rate limit exceeded");
    }
  }

  return null;
}
