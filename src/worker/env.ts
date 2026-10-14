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
  /** Supabase project URL; enables Supabase JWT auth on the partner route. */
  SUPABASE_URL?: string;
  /** Public publishable key (sb_publishable_...), used as the apikey header for Supabase Auth. */
  SUPABASE_ANON_KEY?: string;
  MCP_ALLOWED_HOSTS?: string;
  ALLOW_ANONYMOUS_PUBLIC?: string;
  PUBLIC_MCP_REQUIRE_API_KEY?: string;
  PUBLIC_MCP_KEYS?: PublicKeyValueStore;
  PUBLIC_ROUTE_RATE_LIMITER?: RateLimitBinding;
  PUBLIC_GET_VISA_RATE_LIMITER?: RateLimitBinding;
  /** Per-actor limit on save_application / get_payment_link (anonymous writes). */
  APPLICATION_WRITE_RATE_LIMITER?: RateLimitBinding;
  /** form-visamundi-next base URL serving /api/agent/* (e.g. https://form.visamundi.app). */
  FORM_AGENT_API_URL?: string;
  /** Shared service key, sent as X-Agent-Key (AGENT_API_KEY on the form side). */
  FORM_AGENT_API_KEY?: string;
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

/** Application tools are exposed only when both the URL and the key are set. */
export function getFormAgentApiFromEnv(
  env: Pick<WorkerEnv, "FORM_AGENT_API_URL" | "FORM_AGENT_API_KEY">,
  clientIp: string | null
): { baseUrl: string; apiKey: string; clientIp: string | null } | null {
  const baseUrl = env.FORM_AGENT_API_URL?.trim();
  const apiKey = env.FORM_AGENT_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    return null;
  }
  return { baseUrl, apiKey, clientIp };
}
