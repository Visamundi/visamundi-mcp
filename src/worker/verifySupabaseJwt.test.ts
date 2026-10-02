import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthServiceUnavailableError,
  clearSupabaseJwtCache,
  looksLikeJwt,
  verifySupabaseJwt,
} from "./verifySupabaseJwt.js";

const config = {
  supabaseUrl: "https://project.supabase.co/",
  anonKey: "sb_publishable_test",
};

function tokenWithExp(exp: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "HS256" })}.${encode({ exp })}.sig`;
}

function authResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("verifySupabaseJwt", () => {
  const fetchMock = vi.fn();
  const exp = Math.floor(Date.now() / 1000) + 3600;

  beforeEach(() => {
    clearSupabaseJwtCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Supabase Auth and returns the user id", async () => {
    fetchMock.mockResolvedValueOnce(
      authResponse({ id: "user-1", role: "authenticated" })
    );
    const token = tokenWithExp(exp);

    const claims = await verifySupabaseJwt(token, config);

    expect(claims).toEqual({ sub: "user-1", exp });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://project.supabase.co/auth/v1/user");
    expect(init.headers).toMatchObject({
      apikey: "sb_publishable_test",
      authorization: `Bearer ${token}`,
    });
  });

  it("caches a successful lookup", async () => {
    fetchMock.mockResolvedValue(authResponse({ id: "user-1", role: "authenticated" }));
    const token = tokenWithExp(exp);

    await verifySupabaseJwt(token, config);
    await verifySupabaseJwt(token, config);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null for rejected tokens and does not cache them", async () => {
    fetchMock.mockResolvedValue(authResponse({ msg: "invalid JWT" }, 401));
    const token = tokenWithExp(exp);

    expect(await verifySupabaseJwt(token, config)).toBeNull();
    expect(await verifySupabaseJwt(token, config)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects anonymous users", async () => {
    fetchMock.mockResolvedValueOnce(
      authResponse({ id: "anon-1", role: "authenticated", is_anonymous: true })
    );

    expect(await verifySupabaseJwt(tokenWithExp(exp), config)).toBeNull();
  });

  it("throws when Supabase Auth is unavailable", async () => {
    fetchMock.mockResolvedValueOnce(authResponse({}, 503));
    await expect(verifySupabaseJwt(tokenWithExp(exp), config)).rejects.toBeInstanceOf(
      AuthServiceUnavailableError
    );

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(verifySupabaseJwt(tokenWithExp(exp + 1), config)).rejects.toBeInstanceOf(
      AuthServiceUnavailableError
    );
  });
});

describe("looksLikeJwt", () => {
  it("separates JWTs from vm_mcp_ keys", () => {
    expect(looksLikeJwt("a.b.c")).toBe(true);
    expect(looksLikeJwt("vm_mcp_abcdef")).toBe(false);
  });
});
