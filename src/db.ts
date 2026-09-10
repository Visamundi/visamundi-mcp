import { createHash } from "node:crypto";
import { Pool, type QueryResultRow } from "pg";
import type {
  CredentialContext,
  InvoiceSummaryRow,
  ProcessingLoadRow,
  ReferredApplicationSummaryRow,
  ResolvedCredentialRow,
  TravelGroupSummaryRow,
} from "./types.js";
import { normalizeToolNames } from "./types.js";

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.MCP_SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("Missing MCP_SUPABASE_DB_URL");
  }

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  return pool;
}

function functionCallSql(name: string, argCount: number): string {
  const placeholders =
    argCount === 0
      ? ""
      : Array.from({ length: argCount }, (_, index) => `$${index + 1}`).join(", ");

  return `select * from public.${name}(${placeholders})`;
}

async function callRows<T extends QueryResultRow>(
  name: string,
  args: unknown[]
): Promise<T[]> {
  const db = getPool();
  const result = await db.query<T>(functionCallSql(name, args.length), args);
  return result.rows;
}

async function callValue<T>(name: string, args: unknown[]): Promise<T> {
  const db = getPool();
  const placeholders =
    args.length === 0
      ? ""
      : Array.from({ length: args.length }, (_, index) => `$${index + 1}`).join(", ");
  const result = await db.query<{ value: T }>(
    `select public.${name}(${placeholders}) as value`,
    args
  );

  return result.rows[0]?.value as T;
}

export async function closeDbPool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export async function resolveCredentialByApiKey(
  apiKey: string
): Promise<CredentialContext | null> {
  const [row] = await callRows<ResolvedCredentialRow>("mcp_resolve_credential", [
    hashApiKey(apiKey),
  ]);

  if (!row) {
    return null;
  }

  const connectToken = row.connect_configured
    ? await getConnectToken(row.credential_id)
    : null;

  return {
    credentialId: row.credential_id,
    companyId: row.company_id,
    allowedTools: normalizeToolNames(row.allowed_tools ?? []),
    connectPartnerName: row.connect_partner_name,
    connectConfigured: row.connect_configured,
    connectToken,
  };
}

export async function getConnectToken(
  credentialId: string
): Promise<string | null> {
  return callValue<string | null>("mcp_get_connect_token", [credentialId]);
}

export async function getCompany(credentialId: string): Promise<unknown> {
  return callValue<unknown>("mcp_get_company", [credentialId]);
}

export async function listTravelGroups(
  credentialId: string,
  limit = 25,
  offset = 0
): Promise<TravelGroupSummaryRow[]> {
  return callRows<TravelGroupSummaryRow>("mcp_list_travel_groups", [
    credentialId,
    limit,
    offset,
  ]);
}

export async function getTravelGroup(
  credentialId: string,
  travelGroupId: string
): Promise<unknown | null> {
  return callValue<unknown | null>("mcp_get_travel_group", [
    credentialId,
    travelGroupId,
  ]);
}

export async function listReferredApplications(
  credentialId: string,
  limit = 25,
  offset = 0
): Promise<ReferredApplicationSummaryRow[]> {
  return callRows<ReferredApplicationSummaryRow>(
    "mcp_list_referred_applications",
    [credentialId, limit, offset]
  );
}

export async function getReferredApplication(
  credentialId: string,
  referredApplicationId: string
): Promise<unknown | null> {
  return callValue<unknown | null>("mcp_get_referred_application", [
    credentialId,
    referredApplicationId,
  ]);
}

export async function listInvoices(
  credentialId: string,
  limit = 25,
  offset = 0
): Promise<InvoiceSummaryRow[]> {
  return callRows<InvoiceSummaryRow>("mcp_list_invoices", [
    credentialId,
    limit,
    offset,
  ]);
}

export async function getProcessingLoad(
  countryCode: string,
  visaId?: string
): Promise<ProcessingLoadRow | null> {
  const rows = await callRows<ProcessingLoadRow>("mcp_get_processing_load", [
    countryCode,
    visaId ?? null,
  ]);
  return rows[0] ?? null;
}

export async function getDeliveryWindow(
  credentialId: string,
  recordId: string
): Promise<unknown | null> {
  return callValue<unknown | null>("mcp_get_delivery_window", [
    credentialId,
    recordId,
  ]);
}

export async function getAffiliateStats(
  credentialId: string,
  from?: string,
  to?: string
): Promise<unknown> {
  return callValue<unknown>("mcp_get_affiliate_stats", [
    credentialId,
    from ?? null,
    to ?? null,
  ]);
}
