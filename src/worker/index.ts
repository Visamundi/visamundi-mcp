import { createMcpHandler } from "agents/mcp/server";
import { createDatabaseApi } from "../db.js";
import { createPartnerMcpServer } from "../mcp/createPartnerMcpServer.js";
import { createPublicMcpServer } from "../mcp/createPublicMcpServer.js";
import {
  getConnectTokenFromEnv,
  parseAllowedHosts,
  type WorkerEnv,
  type WorkerExecutionContext,
} from "./env.js";
import { verifyPartnerBearer } from "./verifyPartnerBearer.js";

function createPublicHandler(env: WorkerEnv) {
  const allowedHostnames = parseAllowedHosts(env.MCP_ALLOWED_HOSTS);

  return createMcpHandler(
    () =>
      createPublicMcpServer({
        connectToken: getConnectTokenFromEnv(env),
      }),
    {
      route: "/",
      allowedHostnames,
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
        return createPublicHandler(env)(request, env, ctx as any);
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
