import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { CredentialContext, ToolName } from "../types.js";
import { normalizeToolNames } from "../types.js";
import { createServer } from "./createServer.js";

type SessionRecord = {
  clientId: string;
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createServer>;
};

type SessionStore = Record<string, SessionRecord>;

type RouteConfig = {
  path: string;
  requireAuth: boolean;
  createServerForRequest: (authInfo?: AuthInfo) => ReturnType<typeof createServer>;
  getClientId: (authInfo?: AuthInfo) => string | null;
};

export interface HostedAppOptions {
  host: string;
  allowedHosts?: string[];
  verifier: OAuthTokenVerifier;
  publicContext: CredentialContext;
  createServerForAuth?: (authInfo: AuthInfo) => ReturnType<typeof createServer>;
  createServerForPublic?: (context: CredentialContext) => ReturnType<typeof createServer>;
}

export interface HostedApp {
  app: ReturnType<typeof createMcpExpressApp>;
  closeSessions(): Promise<void>;
}

function authInfoToCredentialContext(authInfo: AuthInfo): CredentialContext {
  const extra = authInfo.extra ?? {};

  return {
    credentialId: String(extra.credentialId ?? authInfo.clientId),
    companyId: String(extra.companyId ?? ""),
    allowedTools: normalizeToolNames(authInfo.scopes as ToolName[]),
    connectPartnerName:
      typeof extra.connectPartnerName === "string"
        ? extra.connectPartnerName
        : null,
    connectConfigured: Boolean(extra.connectConfigured),
    connectToken:
      typeof extra.connectToken === "string" ? extra.connectToken : null,
  };
}

export function createHostedApp({
  host,
  allowedHosts,
  verifier,
  publicContext,
  createServerForAuth = (authInfo) => createServer(authInfoToCredentialContext(authInfo)),
  createServerForPublic = (context) => createServer(context),
}: HostedAppOptions): HostedApp {
  const app = createMcpExpressApp({ host, allowedHosts });
  const authMiddleware = requireBearerAuth({
    verifier,
    requiredScopes: [],
  });
  const publicCredentialContext: CredentialContext = {
    ...publicContext,
    allowedTools: normalizeToolNames(publicContext.allowedTools as ToolName[]),
  };
  const sessionStores: SessionStore[] = [];

  function sameClient(
    authInfo: AuthInfo | undefined,
    recordClientId: string,
    requireAuth: boolean
  ): boolean {
    return requireAuth
      ? Boolean(authInfo && authInfo.clientId === recordClientId)
      : recordClientId === "public";
  }

  function registerRoute({
    path,
    requireAuth,
    createServerForRequest,
    getClientId,
  }: RouteConfig): void {
    const sessions: SessionStore = {};
    sessionStores.push(sessions);

    async function createSession(
      authInfo: AuthInfo | undefined,
      req: Parameters<StreamableHTTPServerTransport["handleRequest"]>[0],
      res: Parameters<StreamableHTTPServerTransport["handleRequest"]>[1],
      body: unknown
    ) {
      const clientId = getClientId(authInfo);
      if (!clientId) {
        res.statusCode = 401;
        res.end("Unauthorized");
        return;
      }

      const server = createServerForRequest(authInfo);
      let transport: StreamableHTTPServerTransport | undefined;

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          if (!transport) {
            return;
          }

          sessions[sessionId] = {
            clientId,
            transport,
            server,
          };
        },
      });

      transport.onclose = async () => {
        const sessionId = transport?.sessionId;
        if (!sessionId) {
          return;
        }

        const record = sessions[sessionId];
        if (record) {
          delete sessions[sessionId];
          await record.server.close().catch(() => undefined);
        }
      };

      await server.connect(transport);
      if (transport.sessionId) {
        sessions[transport.sessionId] = {
          clientId,
          transport,
          server,
        };
      }

      await transport.handleRequest(req, res, body);
    }

    async function handleExistingSession(
      authInfo: AuthInfo | undefined,
      sessionId: string,
      req: Parameters<StreamableHTTPServerTransport["handleRequest"]>[0],
      res: Parameters<StreamableHTTPServerTransport["handleRequest"]>[1],
      body?: unknown
    ) {
      const record = sessions[sessionId];
      if (!record || !sameClient(authInfo, record.clientId, requireAuth)) {
        res.statusCode = 404;
        res.end("Invalid or expired session");
        return;
      }

      await record.transport.handleRequest(req, res, body);
    }

    const postHandler = async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers["mcp-session-id"];
        if (typeof sessionId === "string") {
          await handleExistingSession(req.auth, sessionId, req, res, req.body);
          return;
        }

        if (isInitializeRequest(req.body)) {
          await createSession(req.auth, req, res, req.body);
          return;
        }

        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        });
      } catch (error) {
        console.error(`Error handling MCP POST request for ${path}:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    };

    const getHandler = async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers["mcp-session-id"];
        if (typeof sessionId !== "string") {
          res.status(400).send("Invalid or missing session ID");
          return;
        }

        await handleExistingSession(req.auth, sessionId, req, res);
      } catch (error) {
        console.error(`Error handling MCP GET request for ${path}:`, error);
        if (!res.headersSent) {
          res.status(500).send("Internal server error");
        }
      }
    };

    const deleteHandler = async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers["mcp-session-id"];
        if (typeof sessionId !== "string") {
          res.status(400).send("Invalid or missing session ID");
          return;
        }

        await handleExistingSession(req.auth, sessionId, req, res);
      } catch (error) {
        console.error(`Error handling MCP DELETE request for ${path}:`, error);
        if (!res.headersSent) {
          res.status(500).send("Internal server error");
        }
      }
    };

    if (requireAuth) {
      app.post(path, authMiddleware, postHandler);
      app.get(path, authMiddleware, getHandler);
      app.delete(path, authMiddleware, deleteHandler);
      return;
    }

    app.post(path, postHandler);
    app.get(path, getHandler);
    app.delete(path, deleteHandler);
  }

  registerRoute({
    path: "/",
    requireAuth: false,
    createServerForRequest: () => createServerForPublic(publicCredentialContext),
    getClientId: () => "public",
  });

  registerRoute({
    path: "/partners",
    requireAuth: true,
    createServerForRequest: (authInfo) => createServerForAuth(authInfo as AuthInfo),
    getClientId: (authInfo) => authInfo?.clientId ?? null,
  });

  return {
    app,
    async closeSessions() {
      for (const sessions of sessionStores) {
        for (const sessionId of Object.keys(sessions)) {
          const record = sessions[sessionId];
          delete sessions[sessionId];
          await record.transport.close().catch(() => undefined);
          await record.server.close().catch(() => undefined);
        }
      }
    },
  };
}
