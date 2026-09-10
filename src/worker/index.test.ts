import { describe, expect, it } from "vitest";
import { createWorkerHandler } from "./index.js";

const env = {
  CONNECT_API_MCP_KEY: "public-token",
  HYPERDRIVE: {
    connectionString: "postgres://worker",
  },
};

const ctx = {
  waitUntil() {
    return undefined;
  },
};

describe("Cloudflare worker routing", () => {
  it("returns 404 for unknown paths", async () => {
    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/unknown"),
      env,
      ctx
    );

    expect(response.status).toBe(404);
  });

  it("rejects partner requests without a bearer token", async () => {
    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/partners", {
        method: "POST",
      }),
      env,
      ctx
    );

    expect(response.status).toBe(401);
  });

  it("routes public requests through the MCP handler", async () => {
    const response = await createWorkerHandler().fetch(
      new Request("https://example.com/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      env,
      ctx
    );

    expect(response.status).not.toBe(404);
  });
});
