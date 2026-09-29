const BASE_URL = "https://connect.visamundi.io/v3";
const ALLOWED_PATH =
  /^\/(visas|visa\/\d+|countries|customs|vaccines|e\/visa\/requirements)$/;
const REDACTED_FIELDS = new Set(["service_level"]);
const PUBLIC_REDACTED_FIELDS = new Set([
  "api_key",
  "connect_token",
  "credential_id",
  "credentialId",
  "internal_code",
  "internal_notes",
  "partner_token",
  "refresh_token",
  "secret",
  "supplier_reference",
  "token",
]);
const PUBLIC_REDACTED_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /^internal_/i,
  // Provenance: record authors, update/verification dates and data sources.
  /^(date|user)_(created|updated)$/i,
  /^(created|updated|modified|verified|reviewed|checked|published)_(at|on|by|date)$/i,
  /^last_(update|updated|modified|checked|verified|reviewed)/i,
  /(^|_)sources?($|_)/i,
];

export const PUBLIC_CACHE_TTLS = {
  get_customs: 60 * 60 * 24,
  get_vaccines: 60 * 60 * 24,
  list_visas: 60 * 60,
  get_visa_requirements: 60 * 60,
  get_visa: 60 * 30,
} as const;

export type PublicToolName = keyof typeof PUBLIC_CACHE_TTLS;

export interface ConnectCache {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export interface FetchTelemetry {
  cacheHit: boolean;
  cacheKey?: string;
  status: number;
}

export interface FetchVisamundiOptions {
  cache?: ConnectCache;
  cacheKey?: string;
  cacheTtlSeconds?: number;
  onComplete?: (telemetry: FetchTelemetry) => void;
}

export class ConnectApiError extends Error {
  readonly status: number;
  readonly clientMessage: string;

  constructor(status: number, clientMessage: string) {
    super(clientMessage);
    this.name = "ConnectApiError";
    this.status = status;
    this.clientMessage = clientMessage;
  }
}

export function sanitizeResponse(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(sanitizeResponse);
  }

  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (REDACTED_FIELDS.has(key)) {
        continue;
      }
      result[key] = sanitizeResponse(value);
    }
    return result;
  }

  return data;
}

function shouldRedactPublicField(key: string): boolean {
  if (PUBLIC_REDACTED_FIELDS.has(key)) {
    return true;
  }

  return PUBLIC_REDACTED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function sanitizePublicResponse(
  toolName: PublicToolName,
  data: unknown
): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => sanitizePublicResponse(toolName, item));
  }

  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (shouldRedactPublicField(key)) {
        continue;
      }

      result[key] = sanitizePublicResponse(toolName, value);
    }

    if (toolName === "get_visa" && "service_level" in result) {
      delete result.service_level;
    }

    return result;
  }

  return data;
}

export function assertAllowedPath(path: string): void {
  if (!ALLOWED_PATH.test(path)) {
    throw new Error(`Path not allowed: ${path}`);
  }
}

function getObjectValue(
  data: unknown,
  key: string
): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const value = (data as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getStringValue(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value.toUpperCase() : undefined;
}

function extractScopedCountryCodes(data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [];
  }

  const record = data as Record<string, unknown>;
  const destination = getObjectValue(record, "destination");
  const country = getObjectValue(record, "country");
  const nestedData = getObjectValue(record, "data");

  return [
    getStringValue(record, "country_code"),
    destination ? getStringValue(destination, "cca2") : undefined,
    destination ? getStringValue(destination, "cca3") : undefined,
    country ? getStringValue(country, "cca2") : undefined,
    country ? getStringValue(country, "cca3") : undefined,
    nestedData ? getStringValue(nestedData, "country_code") : undefined,
    ...(nestedData ? extractScopedCountryCodes(nestedData) : []),
  ].filter((value): value is string => Boolean(value));
}

export function assertSingleCountryResponse(
  data: unknown,
  countryCode: string
): void {
  const requestedCode = countryCode.toUpperCase();
  const scopedCodes = extractScopedCountryCodes(data);

  if (scopedCodes.length === 0 || !scopedCodes.includes(requestedCode)) {
    throw new Error(
      `Response was not scoped to requested country ${requestedCode}.`
    );
  }
}

async function fetchVisamundi(
  path: string,
  token: string,
  searchParams?: URLSearchParams,
  options: FetchVisamundiOptions = {}
): Promise<unknown> {
  assertAllowedPath(path);
  if (!token) {
    throw new Error("Missing Connect API token for this credential");
  }

  const query = searchParams?.size ? `?${searchParams.toString()}` : "";
  const url = `${BASE_URL}${path}${query}`;
  const { cache, cacheKey, cacheTtlSeconds, onComplete } = options;

  if (cache && cacheKey) {
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      onComplete?.({
        cacheHit: true,
        cacheKey,
        status: 200,
      });
      return cached;
    }
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(
      JSON.stringify({
        event: "connect_api_error",
        path,
        status: response.status,
        body: body.slice(0, 500),
      })
    );
    onComplete?.({
      cacheHit: false,
      cacheKey,
      status: response.status,
    });
    throw new ConnectApiError(
      response.status,
      response.status === 404
        ? "Requested record was not found."
        : "Connect API unavailable."
    );
  }

  const sanitized = sanitizeResponse(await response.json());

  if (cache && cacheKey && cacheTtlSeconds) {
    await cache.put(cacheKey, sanitized, cacheTtlSeconds);
  }

  onComplete?.({
    cacheHit: false,
    cacheKey,
    status: response.status,
  });

  return sanitized;
}

export interface ListVisasParams {
  destination: string;
  nationality?: string;
  reason?: string;
  stay_duration?: number;
  language?: string;
  token: string;
  cache?: ConnectCache;
  onComplete?: (telemetry: FetchTelemetry) => void;
}

export async function listVisas(params: ListVisasParams): Promise<unknown> {
  const cacheKey = `list_visas:${JSON.stringify({
    destination: params.destination.toUpperCase(),
    language: params.language ?? null,
    nationality: params.nationality?.toUpperCase() ?? null,
    reason: params.reason ?? null,
    stay_duration: params.stay_duration ?? null,
  })}`;
  const searchParams = new URLSearchParams({
    destination: params.destination.toUpperCase(),
  });

  if (params.nationality) {
    searchParams.set("nationality", params.nationality.toUpperCase());
  }
  if (params.reason) {
    searchParams.set("reason", params.reason);
  }
  if (params.stay_duration !== undefined) {
    searchParams.set("stay_duration", String(params.stay_duration));
  }
  if (params.language) {
    searchParams.set("language", params.language);
  }

  return fetchVisamundi("/visas", params.token, searchParams, {
    cache: params.cache,
    cacheKey,
    cacheTtlSeconds: PUBLIC_CACHE_TTLS.list_visas,
    onComplete: params.onComplete,
  });
}

export interface GetVisaParams {
  id: number;
  language?: string;
  token: string;
  cache?: ConnectCache;
  onComplete?: (telemetry: FetchTelemetry) => void;
}

export async function getVisa(params: GetVisaParams): Promise<unknown> {
  const searchParams = new URLSearchParams();
  if (params.language) {
    searchParams.set("language", params.language);
  }

  return fetchVisamundi(`/visa/${params.id}`, params.token, searchParams, {
    cache: params.cache,
    cacheKey: `get_visa:${JSON.stringify({
      id: params.id,
      language: params.language ?? null,
    })}`,
    cacheTtlSeconds: PUBLIC_CACHE_TTLS.get_visa,
    onComplete: params.onComplete,
  });
}

export interface GetVisaRequirementsParams {
  nationality: string;
  destination: string;
  language?: string;
  token: string;
  cache?: ConnectCache;
  onComplete?: (telemetry: FetchTelemetry) => void;
}

export async function getVisaRequirements(
  params: GetVisaRequirementsParams
): Promise<unknown> {
  const searchParams = new URLSearchParams({
    nationality: params.nationality.toUpperCase(),
    destination: params.destination.toUpperCase(),
  });

  if (params.language) {
    searchParams.set("language", params.language);
  }

  return fetchVisamundi("/e/visa/requirements", params.token, searchParams, {
    cache: params.cache,
    cacheKey: `get_visa_requirements:${JSON.stringify({
      destination: params.destination.toUpperCase(),
      language: params.language ?? null,
      nationality: params.nationality.toUpperCase(),
    })}`,
    cacheTtlSeconds: PUBLIC_CACHE_TTLS.get_visa_requirements,
    onComplete: params.onComplete,
  });
}

export interface CountryCodeParams {
  country_code: string;
  token: string;
  cache?: ConnectCache;
  onComplete?: (telemetry: FetchTelemetry) => void;
}

export async function getVaccines(params: CountryCodeParams): Promise<unknown> {
  const searchParams = new URLSearchParams({
    country_code: params.country_code.toUpperCase(),
  });

  return fetchVisamundi("/vaccines", params.token, searchParams, {
    cache: params.cache,
    cacheKey: `get_vaccines:${JSON.stringify({
      country_code: params.country_code.toUpperCase(),
    })}`,
    cacheTtlSeconds: PUBLIC_CACHE_TTLS.get_vaccines,
    onComplete: params.onComplete,
  });
}

export async function getPublicVaccines(
  params: CountryCodeParams
): Promise<unknown> {
  const response = await getVaccines(params);
  assertSingleCountryResponse(response, params.country_code);
  return response;
}

export async function getCustoms(params: CountryCodeParams): Promise<unknown> {
  const searchParams = new URLSearchParams({
    country_code: params.country_code.toUpperCase(),
  });

  return fetchVisamundi("/customs", params.token, searchParams, {
    cache: params.cache,
    cacheKey: `get_customs:${JSON.stringify({
      country_code: params.country_code.toUpperCase(),
    })}`,
    cacheTtlSeconds: PUBLIC_CACHE_TTLS.get_customs,
    onComplete: params.onComplete,
  });
}

export async function getPublicCustoms(
  params: CountryCodeParams
): Promise<unknown> {
  const response = await getCustoms(params);
  assertSingleCountryResponse(response, params.country_code);
  return response;
}

export async function listCountries(token: string): Promise<unknown> {
  return fetchVisamundi("/countries", token);
}
