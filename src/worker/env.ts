export interface HyperdriveBinding {
  connectionString: string;
}

export interface WorkerEnv {
  CONNECT_API_MCP_KEY?: string;
  VISAMUNDI_TOKEN?: string;
  MCP_ALLOWED_HOSTS?: string;
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
