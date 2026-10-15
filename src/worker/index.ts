import { createMcpHandler } from "agents/mcp/server";
import type { ConnectCache } from "../api.js";
import { hashApiKey } from "../db.js";
import { createDatabaseApi } from "../db.js";
import { createPartnerMcpServer } from "../mcp/createPartnerMcpServer.js";
import { createPublicMcpServer } from "../mcp/createPublicMcpServer.js";
import {
  getConnectTokenFromEnv,
  getFormAgentApiFromEnv,
  parseAllowedHosts,
  type WorkerEnv,
  type WorkerExecutionContext,
} from "./env.js";
import {
  authorizePublicRequest,
  enforcePublicRateLimits,
  parsePublicMcpRequest,
  type PublicActor,
} from "./publicAccess.js";
import {
  getPublicCircuitBreakerResponse,
  notePublicUpstreamFailure,
} from "./publicCircuitBreaker.js";
import { verifyPartnerBearer } from "./verifyPartnerBearer.js";
import { enforcePublicDailyQuota } from "./dailyQuota.js";

export { PublicDailyQuota } from "./dailyQuota.js";

let hasWarnedAboutOpenPublicHostConfig = false;

function createCloudflareCache(): ConnectCache | undefined {
  const defaultCache = (
    globalThis as {
      caches?: {
        default?: {
          match(request: Request): Promise<Response | undefined>;
          put(request: Request, response: Response): Promise<void>;
        };
      };
    }
  ).caches?.default;

  if (!defaultCache) {
    return undefined;
  }

  return {
    async get(key: string): Promise<unknown | null> {
      const response = await defaultCache.match(
        new Request(`https://public-cache.invalid/${encodeURIComponent(key)}`)
      );

      if (!response) {
        return null;
      }

      return response.json();
    },
    async put(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      await defaultCache.put(
        new Request(`https://public-cache.invalid/${encodeURIComponent(key)}`),
        new Response(JSON.stringify(value), {
          headers: {
            "cache-control": `public, max-age=${ttlSeconds}`,
            "content-type": "application/json",
          },
        })
      );
    },
  };
}

function logPublicToolCall(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerExecutionContext,
  actor: PublicActor
) {
  return (event: {
    toolName: string;
    arguments: Record<string, unknown>;
    durationMs: number;
    success: boolean;
    cacheHit: boolean;
    upstreamStatus?: number;
    errorMessage?: string;
  }): void => {
    const payload = {
      actorId: actor.id,
      argsHash: hashApiKey(JSON.stringify(event.arguments)),
      authMode: actor.authMode,
      cacheHit: event.cacheHit,
      durationMs: event.durationMs,
      errorMessage: event.errorMessage,
      ipCountry: request.headers.get("cf-ipcountry") ?? "unknown",
      route: "/",
      success: event.success,
      toolName: event.toolName,
      upstreamStatus: event.upstreamStatus ?? 200,
    };

    notePublicUpstreamFailure(payload.upstreamStatus);
    console.log(JSON.stringify({ event: "public_tool_call", ...payload }));
    if (env.MCP_ANALYTICS) {
      ctx.waitUntil(
        Promise.resolve().then(() => {
          env.MCP_ANALYTICS?.writeDataPoint({
            blobs: [
              payload.route,
              payload.toolName,
              payload.actorId,
              payload.authMode,
              String(payload.success),
              String(payload.cacheHit),
              payload.ipCountry,
            ],
            doubles: [payload.durationMs, payload.upstreamStatus],
            indexes: [payload.toolName, payload.authMode],
          });
        })
      );
    }
  };
}

function createPublicHandler(
  env: WorkerEnv,
  request: Request,
  ctx: WorkerExecutionContext,
  actor: PublicActor
) {
  const allowedHostnames = parseAllowedHosts(env.MCP_ALLOWED_HOSTS);
  const hostname = new URL(request.url).hostname;

  if (
    !allowedHostnames &&
    !hasWarnedAboutOpenPublicHostConfig &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1"
  ) {
    hasWarnedAboutOpenPublicHostConfig = true;
    console.warn(
      "MCP_ALLOWED_HOSTS is not set; the public MCP route is accepting requests for any host."
    );
  }

  return createMcpHandler(
    () =>
      createPublicMcpServer({
        connectToken: getConnectTokenFromEnv(env),
        cache: createCloudflareCache(),
        onPublicToolCall: logPublicToolCall(request, env, ctx, actor),
        formAgentApi: getFormAgentApiFromEnv(
          env,
          request.headers.get("cf-connecting-ip")
        ),
      }),
    {
      route: "/",
      allowedHostnames,
      // Browser pages relaying the public tools (WebMCP bridge on the form);
      // unset = the SDK default, localhost only.
      allowedOriginHostnames: parseAllowedHosts(env.MCP_ALLOWED_ORIGINS),
    }
  );
}

function createPartnerHandler(env: WorkerEnv) {
  const allowedHostnames = parseAllowedHosts(env.MCP_ALLOWED_HOSTS);
  const db = createDatabaseApi(env.HYPERDRIVE.connectionString);

  return createMcpHandler(
    (ctx) => {
      if (!ctx.authInfo) {
        throw new Error("Missing auth info for partner request.");
      }

      return createPartnerMcpServer({
        authInfo: ctx.authInfo,
        db,
        fallbackConnectToken: getConnectTokenFromEnv(env),
        cache: createCloudflareCache(),
        onToolCall: (event) => {
          console.log(
            JSON.stringify({ event: "partner_tool_call", route: "/partners", ...event })
          );
        },
      });
    },
    {
      route: "/partners",
      allowedHostnames,
    }
  );
}

export function createWorkerHandler() {
  return {
    async fetch(
      request: Request,
      env: WorkerEnv,
      ctx: WorkerExecutionContext
    ): Promise<Response> {
      const { pathname } = new URL(request.url);

      if (pathname === "/") {
        const circuitBreakerResponse = getPublicCircuitBreakerResponse();
        if (circuitBreakerResponse) {
          return circuitBreakerResponse;
        }

        const actor = await authorizePublicRequest(request, env);
        if (actor instanceof Response) {
          return actor;
        }

        const parsedRequest = await parsePublicMcpRequest(request);
        const rateLimited = await enforcePublicRateLimits(
          env,
          actor,
          parsedRequest.toolName
        );
        if (rateLimited) {
          return rateLimited;
        }

        const overQuota = await enforcePublicDailyQuota(env, actor, parsedRequest);
        if (overQuota) {
          return overQuota;
        }

        return createPublicHandler(env, request, ctx, actor).fetch(request, {
          parsedBody: undefined,
        });
      }

      if (pathname === "/partners") {
        const auth = await verifyPartnerBearer(request, env);
        if (auth instanceof Response) {
          return auth;
        }

        return createPartnerHandler(env).fetch(request, {
          authInfo: auth,
          parsedBody: undefined,
        });
      }

      return new Response("Not found", { status: 404 });
    },
  };
}

export default createWorkerHandler();
