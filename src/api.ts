const BASE_URL = "https://connect.visamundi.io/v3";
const ALLOWED_PATH =
  /^\/(visas|visa\/\d+|countries|customs|vaccines|e\/visa\/requirements)$/;
const REDACTED_FIELDS = new Set(["service_level"]);

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
  searchParams?: URLSearchParams
): Promise<unknown> {
  assertAllowedPath(path);
  if (!token) {
    throw new Error("Missing Connect API token for this credential");
  }

  const query = searchParams?.size ? `?${searchParams.toString()}` : "";
  const url = `${BASE_URL}${path}${query}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Connect API request failed (${response.status}): ${body || response.statusText}`);
  }

  return sanitizeResponse(await response.json());
}

export interface ListVisasParams {
  destination: string;
  nationality?: string;
  reason?: string;
  stay_duration?: number;
  language?: string;
  token: string;
}

export async function listVisas(params: ListVisasParams): Promise<unknown> {
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

  return fetchVisamundi("/visas", params.token, searchParams);
}

export interface GetVisaParams {
  id: number;
  language?: string;
  token: string;
}

export async function getVisa(params: GetVisaParams): Promise<unknown> {
  const searchParams = new URLSearchParams();
  if (params.language) {
    searchParams.set("language", params.language);
  }

  return fetchVisamundi(`/visa/${params.id}`, params.token, searchParams);
}

export interface GetVisaRequirementsParams {
  nationality: string;
  destination: string;
  language?: string;
  token: string;
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

  return fetchVisamundi("/e/visa/requirements", params.token, searchParams);
}

export interface CountryCodeParams {
  country_code: string;
  token: string;
}

export async function getVaccines(params: CountryCodeParams): Promise<unknown> {
  const searchParams = new URLSearchParams({
    country_code: params.country_code.toUpperCase(),
  });

  return fetchVisamundi("/vaccines", params.token, searchParams);
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

  return fetchVisamundi("/customs", params.token, searchParams);
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
