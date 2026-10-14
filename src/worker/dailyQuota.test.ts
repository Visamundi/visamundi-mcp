import { describe, expect, it, vi } from "vitest";
import {
  consumeDailyQuota,
  enforcePublicDailyQuota,
  parisDay,
  PublicDailyQuota,
  type DailyQuotaNamespace,
} from "./dailyQuota.js";

function memoryStorage() {
  const map = new Map<string, unknown>();
  return {
    get: vi.fn(async (k: string) => map.get(k)),
    put: vi.fn(async (k: string, v: unknown) => {
      map.set(k, v);
    }),
  };
}

describe("daily quota counter", () => {
  it("allows up to the limit, then refuses", async () => {
    const storage = memoryStorage();
    for (let i = 1; i <= 3; i += 1) {
      expect(await consumeDailyQuota(storage, "2026-10-14", 3)).toEqual({ allowed: true, count: i });
    }
    expect(await consumeDailyQuota(storage, "2026-10-14", 3)).toEqual({ allowed: false, count: 3 });
  });

  it("resets on a new day", async () => {
    const storage = memoryStorage();
    await consumeDailyQuota(storage, "2026-10-14", 1);
    expect((await consumeDailyQuota(storage, "2026-10-14", 1)).allowed).toBe(false);
    expect(await consumeDailyQuota(storage, "2026-10-15", 1)).toEqual({ allowed: true, count: 1 });
  });

  it("uses the Paris calendar day", () => {
    // 23:30 UTC on 14 Oct = 01:30 on 15 Oct in Paris (CEST).
    expect(parisDay(new Date("2026-10-14T23:30:00Z"))).toBe("2026-10-15");
  });

  it("the Durable Object answers consume requests", async () => {
    const quota = new PublicDailyQuota({ storage: memoryStorage() });
    const res = await quota.fetch(new Request("https://quota/consume?limit=1&day=2026-10-14"));
    expect(await res.json()).toEqual({ allowed: true, count: 1 });
    const again = await quota.fetch(new Request("https://quota/consume?limit=1&day=2026-10-14"));
    expect(await again.json()).toEqual({ allowed: false, count: 1 });
  });
});

function namespace(allowed: boolean): DailyQuotaNamespace & { names: string[] } {
  const names: string[] = [];
  return {
    names,
    idFromName(name: string) {
      names.push(name);
      return name;
    },
    get() {
      return { fetch: vi.fn(async () => Response.json({ allowed, count: 200 })) };
    },
  };
}

const anonymous = { id: "anonymous:203.0.113.1", authMode: "anonymous" as const };

describe("enforcePublicDailyQuota", () => {
  it("answers a refused reference call with a JSON-RPC tool error the agent can relay", async () => {
    const ns = namespace(false);
    const res = await enforcePublicDailyQuota({ PUBLIC_DAILY_QUOTA: ns }, anonymous, {
      id: 7,
      toolName: "get_visa",
    });

    expect(ns.names).toEqual(["anonymous:203.0.113.1"]);
    expect(res?.status).toBe(200);
    expect(res?.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res!.json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 7, result: { isError: true } });
    expect(body.result.content[0].text).toContain("200");
    expect(body.result.content[0].text).toContain("https://form.visamundi.app");
  });

  it("lets the call through under the quota", async () => {
    expect(
      await enforcePublicDailyQuota({ PUBLIC_DAILY_QUOTA: namespace(true) }, anonymous, {
        id: 1,
        toolName: "list_visas",
      })
    ).toBeNull();
  });

  it("does not count application tools, non tool calls, keyed clients or a missing binding", async () => {
    const ns = namespace(false);
    const env = { PUBLIC_DAILY_QUOTA: ns };
    expect(await enforcePublicDailyQuota(env, anonymous, { id: 1, toolName: "save_application" })).toBeNull();
    expect(await enforcePublicDailyQuota(env, anonymous, { id: 1 })).toBeNull();
    expect(
      await enforcePublicDailyQuota(env, { id: "public-key:x", authMode: "public_key" }, { id: 1, toolName: "get_visa" })
    ).toBeNull();
    expect(ns.names).toEqual([]);
    expect(await enforcePublicDailyQuota({}, anonymous, { id: 1, toolName: "get_visa" })).toBeNull();
  });

  it("fails open when the counter is unavailable", async () => {
    const ns: DailyQuotaNamespace = {
      idFromName: (n) => n,
      get: () => ({ fetch: vi.fn(async () => { throw new Error("DO down"); }) }),
    };
    expect(
      await enforcePublicDailyQuota({ PUBLIC_DAILY_QUOTA: ns }, anonymous, { id: 1, toolName: "get_visa" })
    ).toBeNull();
  });
});
