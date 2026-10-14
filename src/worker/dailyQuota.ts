import type { PublicActor, PublicRouteToolName } from "./publicAccess.js";

/**
 * Daily cap on anonymous reference lookups (public route). Cloudflare rate
 * limits only offer 10 s / 60 s windows, so the per-day count lives in one
 * Durable Object per actor (exact and strongly consistent), reset at midnight
 * Paris time. Application tools are not counted: they are the conversion path
 * and have their own limiter.
 */
export const PUBLIC_DAILY_LOOKUP_LIMIT = 200;

const COUNTED_TOOLS: readonly string[] = [
  "list_visas",
  "get_visa",
  "get_visa_requirements",
  "get_vaccines",
  "get_customs",
];

export interface QuotaStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

export interface DailyQuotaStub {
  fetch(request: Request): Promise<Response>;
}

export interface DailyQuotaNamespace {
  idFromName(name: string): unknown;
  get(id: never): DailyQuotaStub;
}

interface QuotaState {
  day: string;
  count: number;
}

export function parisDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function consumeDailyQuota(
  storage: QuotaStorage,
  day: string,
  limit: number
): Promise<{ allowed: boolean; count: number }> {
  const stored = (await storage.get("quota")) as QuotaState | undefined;
  const count = stored?.day === day ? stored.count : 0;
  if (count >= limit) {
    return { allowed: false, count };
  }
  await storage.put("quota", { day, count: count + 1 } satisfies QuotaState);
  return { allowed: true, count: count + 1 };
}

/** Durable Object: one instance per actor, a single {day, count} record. */
export class PublicDailyQuota {
  constructor(private readonly state: { storage: QuotaStorage }) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit")) || PUBLIC_DAILY_LOOKUP_LIMIT;
    const day = url.searchParams.get("day") || parisDay();
    return Response.json(await consumeDailyQuota(this.state.storage, day, limit));
  }
}

const QUOTA_MESSAGE = `Daily limit reached: this connection has used its ${PUBLIC_DAILY_LOOKUP_LIMIT} free Visamundi lookups for today (reset at midnight, Paris time). The traveller can still apply directly at https://form.visamundi.app. Developers needing more volume can request an API key at https://www.visamundi.io/getting-started/trial-key/.`;

export async function enforcePublicDailyQuota(
  env: { PUBLIC_DAILY_QUOTA?: DailyQuotaNamespace },
  actor: PublicActor,
  request: { id?: unknown; toolName?: PublicRouteToolName }
): Promise<Response | null> {
  if (
    !env.PUBLIC_DAILY_QUOTA ||
    actor.authMode !== "anonymous" ||
    !request.toolName ||
    !COUNTED_TOOLS.includes(request.toolName)
  ) {
    return null;
  }

  let allowed = true;
  try {
    const ns = env.PUBLIC_DAILY_QUOTA;
    const stub = ns.get(ns.idFromName(actor.id) as never);
    const res = await stub.fetch(
      new Request(
        `https://quota/consume?limit=${PUBLIC_DAILY_LOOKUP_LIMIT}&day=${parisDay()}`
      )
    );
    allowed = ((await res.json()) as { allowed?: boolean }).allowed !== false;
  } catch (error) {
    // A counter outage must not take the public route down.
    console.warn(JSON.stringify({ event: "daily_quota_unavailable", error: String(error) }));
    return null;
  }

  if (allowed) {
    return null;
  }

  // A tool-level error (not an HTTP failure) so the agent can tell the
  // traveller what happened and where to go next.
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: {
        content: [{ type: "text", text: `Error: ${QUOTA_MESSAGE}` }],
        isError: true,
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    }
  );
}
