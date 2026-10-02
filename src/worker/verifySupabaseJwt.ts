const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;
const AUTH_TIMEOUT_MS = 5_000;

export interface SupabaseAuthConfig {
  supabaseUrl: string;
  /** Public publishable/anon key, sent as the `apikey` header to Supabase Auth. */
  anonKey: string;
}

export interface SupabaseJwtClaims {
  sub: string;
  exp: number;
}

/** Supabase Auth could not be reached or answered unexpectedly (not a bad token). */
export class AuthServiceUnavailableError extends Error {}

interface CacheEntry {
  claims: SupabaseJwtClaims;
  cachedUntil: number;
}

const cache = new Map<string, CacheEntry>();

export function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3 && !token.startsWith("vm_mcp_");
}

async function cacheKey(token: string, supabaseUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${supabaseUrl}\n${token}`)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** Reads `exp` from the payload. Not trusted for auth: Supabase Auth validates the token. */
function readExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1] ?? "";
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

function remember(key: string, claims: SupabaseJwtClaims): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }

  const tokenExpiryMs = claims.exp * 1000;
  cache.set(key, {
    claims,
    cachedUntil: Math.min(Date.now() + CACHE_TTL_MS, tokenExpiryMs),
  });
}

/**
 * Validates a Supabase access token by asking Supabase Auth (GET /auth/v1/user).
 * Works for any signing method (HS256 or ES256) and rejects signed-out or revoked
 * sessions. Returns null for an invalid token; throws AuthServiceUnavailableError
 * when Auth itself cannot answer. Successful lookups are cached for 60 seconds.
 */
export async function verifySupabaseJwt(
  token: string,
  { supabaseUrl, anonKey }: SupabaseAuthConfig
): Promise<SupabaseJwtClaims | null> {
  const key = await cacheKey(token, supabaseUrl);
  const cached = cache.get(key);
  if (cached && cached.cachedUntil > Date.now()) {
    return cached.claims;
  }
  cache.delete(key);

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AuthServiceUnavailableError(
      error instanceof Error ? error.message : "Supabase Auth request failed"
    );
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new AuthServiceUnavailableError(
      `Supabase Auth responded with status ${response.status}`
    );
  }

  const user = (await response.json().catch(() => null)) as {
    id?: unknown;
    role?: unknown;
    is_anonymous?: unknown;
  } | null;

  if (
    !user ||
    typeof user.id !== "string" ||
    !user.id ||
    user.role !== "authenticated" ||
    user.is_anonymous === true
  ) {
    return null;
  }

  const claims: SupabaseJwtClaims = {
    sub: user.id,
    exp: readExpiry(token) ?? Math.floor(Date.now() / 1000) + 60,
  };
  remember(key, claims);
  return claims;
}

/** Test helper. */
export function clearSupabaseJwtCache(): void {
  cache.clear();
}
