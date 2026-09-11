import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerHandler } from "./index.js";

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    CONNECT_API_MCP_KEY: "public-token",
    HYPERDRIVE: {
      connectionString: "postgres://worker",
    },
    ...overrides,
  };
}

const ctx = {
  waitUntil() {
    return undefined;
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cloudflare worker routing", () => {
  it("returns 404 for unknown paths", async () => {
    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/unknown"),
      createEnv(),
      ctx
    );

    expect(response.status).toBe(404);
  });

  it("rejects partner requests without a bearer token", async () => {
    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/partners", {
        method: "POST",
      }),
      createEnv(),
      ctx
    );

    expect(response.status).toBe(401);
  });

  it("routes public requests through the MCP handler", async () => {
    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      createEnv(),
      ctx
    );

    expect(response.status).not.toBe(404);
  });

  it("returns 429 when the public route rate limit is exceeded", async () => {
    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ method: "tools/list" }),
      }),
      createEnv({
        PUBLIC_ROUTE_RATE_LIMITER: {
          limit: vi.fn().mockResolvedValueOnce({ success: false }),
        },
      }),
      ctx
    );

    expect(response.status).toBe(429);
  });

  it("hides upstream error bodies from public MCP callers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("raw upstream token=secret-value", {
          status: 403,
        })
      )
    );

    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
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
      }),
      createEnv(),
      ctx
    );

    const body = await response.text();
    expect(body).toContain("Connect API unavailable.");
    expect(body).not.toContain("secret-value");
    expect(body).not.toContain("token=");
  });
});
