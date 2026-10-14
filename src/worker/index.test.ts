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
  it("relays save_application to the form API without redacting the resume token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        applicationId: "app-1",
        resumeToken: "tok-secret-1",
        reference: "VM-1",
        missing: [],
        pricing: null,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.7",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "save_application",
            arguments: { visaId: "42629", locale: "fr", values: {} },
          },
        }),
      }),
      createEnv({
        FORM_AGENT_API_URL: "https://form.test",
        FORM_AGENT_API_KEY: "service-key",
      }),
      ctx
    );

    const body = await response.text();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://form.test/api/agent/applications");
    expect(init.headers["X-Agent-Key"]).toBe("service-key");
    expect(init.headers["X-Agent-Client-Ip"]).toBe("203.0.113.7");
    expect(body).toContain("tok-secret-1");
    expect(body).not.toContain("service-key");
    vi.unstubAllGlobals();
  });

  it("does not expose the application tools when the form API is not configured", async () => {
    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      createEnv(),
      ctx
    );

    const body = await response.text();
    expect(body).toContain("get_visa");
    expect(body).not.toContain("save_application");
  });
});
