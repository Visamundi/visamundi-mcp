import { describe, expect, it, vi } from "vitest";
import {
  authorizePublicRequest,
  enforcePublicRateLimits,
  parsePublicMcpRequest,
} from "./publicAccess.js";
import type { WorkerEnv } from "./env.js";

function createEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    CONNECT_API_MCP_KEY: "public-token",
    HYPERDRIVE: {
      connectionString: "postgres://worker",
    },
    ...overrides,
  };
}

describe("public route access helpers", () => {
  it("allows anonymous access by default", async () => {
    const actor = await authorizePublicRequest(
      new Request("https://example.com/", {
        headers: {
          "cf-connecting-ip": "203.0.113.1",
        },
      }),
      createEnv()
    );

    expect(actor).not.toBeInstanceOf(Response);
    expect(actor).toMatchObject({
      authMode: "anonymous",
    });
  });

  it("requires a public API key when configured", async () => {
    const response = await authorizePublicRequest(
      new Request("https://example.com/"),
      createEnv({
        PUBLIC_MCP_REQUIRE_API_KEY: "true",
        ALLOW_ANONYMOUS_PUBLIC: "false",
      })
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  it("accepts a valid public API key from KV", async () => {
    const actor = await authorizePublicRequest(
      new Request("https://example.com/", {
        headers: {
          authorization: "Bearer test-public-key",
        },
      }),
      createEnv({
        PUBLIC_MCP_KEYS: {
          get: vi.fn().mockResolvedValueOnce('{"id":"demo-client"}'),
        },
      })
    );

    expect(actor).not.toBeInstanceOf(Response);
    expect(actor).toMatchObject({
      authMode: "public_key",
      apiKeyId: "demo-client",
    });
  });

  it("returns 429 when route limiter rejects the actor", async () => {
    const response = await enforcePublicRateLimits(
      createEnv({
        PUBLIC_ROUTE_RATE_LIMITER: {
          limit: vi.fn().mockResolvedValueOnce({ success: false }),
        },
      }),
      {
        id: "anonymous:203.0.113.1",
        authMode: "anonymous",
      }
    );

    expect(response?.status).toBe(429);
  });

  it("parses tool calls from MCP request bodies", async () => {
    const parsed = await parsePublicMcpRequest(
      new Request("https://example.com/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_visa",
            arguments: {
              id: 42,
            },
          },
        }),
      })
    );

    expect(parsed.toolName).toBe("get_visa");
    expect(parsed.arguments).toEqual({ id: 42 });
  });
  it("applies the write limiter to application write tools only", async () => {
    const write = { limit: vi.fn().mockResolvedValue({ success: false }) };
    const env = createEnv({ APPLICATION_WRITE_RATE_LIMITER: write });
    const actor = { id: "anonymous:203.0.113.1", authMode: "anonymous" as const };

    expect((await enforcePublicRateLimits(env, actor, "save_application"))?.status).toBe(429);
    expect((await enforcePublicRateLimits(env, actor, "get_payment_link"))?.status).toBe(429);
    expect(await enforcePublicRateLimits(env, actor, "get_application_form")).toBeNull();
    expect(write.limit).toHaveBeenCalledWith({ key: "anonymous:203.0.113.1" });
  });

  it("lets browsers read rate-limit errors (CORS)", async () => {
    const response = await enforcePublicRateLimits(
      createEnv({
        PUBLIC_ROUTE_RATE_LIMITER: { limit: vi.fn().mockResolvedValueOnce({ success: false }) },
      }),
      { id: "anonymous:x", authMode: "anonymous" }
    );

    expect(response?.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("recognises application tool calls", async () => {
    const parsed = await parsePublicMcpRequest(
      new Request("https://example.com/", {
        method: "POST",
        body: JSON.stringify({
          method: "tools/call",
          params: { name: "save_application", arguments: { visaId: "1" } },
        }),
      })
    );

    expect(parsed.toolName).toBe("save_application");
  });
});
