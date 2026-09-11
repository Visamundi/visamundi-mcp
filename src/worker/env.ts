export interface HyperdriveBinding {
  connectionString: string;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface PublicKeyValueStore {
  get(key: string): Promise<string | null>;
}

export interface AnalyticsEngineBinding {
  writeDataPoint(dataPoint: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }): void;
}

export interface WorkerEnv {
  CONNECT_API_MCP_KEY?: string;
  VISAMUNDI_TOKEN?: string;
  MCP_ALLOWED_HOSTS?: string;
  ALLOW_ANONYMOUS_PUBLIC?: string;
  PUBLIC_MCP_REQUIRE_API_KEY?: string;
  PUBLIC_MCP_KEYS?: PublicKeyValueStore;
  PUBLIC_ROUTE_RATE_LIMITER?: RateLimitBinding;
  PUBLIC_GET_VISA_RATE_LIMITER?: RateLimitBinding;
  MCP_ANALYTICS?: AnalyticsEngineBinding;
  HYPERDRIVE: HyperdriveBinding;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export function getConnectTokenFromEnv(
  env: Pick<WorkerEnv, "CONNECT_API_MCP_KEY" | "VISAMUNDI_TOKEN">
): string | null {
  return env.CONNECT_API_MCP_KEY ?? env.VISAMUNDI_TOKEN ?? null;
}

export function parseAllowedHosts(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : undefined;
}

export function parseBooleanEnv(
  value: string | undefined,
  defaultValue = false
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}
