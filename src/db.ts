import { createHash } from "node:crypto";
import { Client, type QueryResultRow } from "pg";
import type {
  CredentialContext,
  InvoiceSummaryRow,
  ProcessingLoadRow,
  ReferredApplicationSummaryRow,
  ResolvedCredentialRow,
  UserResolvedCredentialRow,
  TravelGroupSummaryRow,
} from "./types.js";
import { grantedPartnerTools } from "./types.js";

type Queryable = Pick<Client, "query">;

export interface DatabaseApi {
  resolveCredentialByApiKey(apiKey: string): Promise<CredentialContext | null>;
  resolveCredentialByUserId(userId: string): Promise<CredentialContext | null>;
  getConnectToken(credentialId: string): Promise<string | null>;
  getCompany(credentialId: string): Promise<unknown>;
  listTravelGroups(
    credentialId: string,
    limit?: number,
    offset?: number,
    search?: string
  ): Promise<TravelGroupSummaryRow[]>;
  getTravelGroup(
    credentialId: string,
    travelGroupId: string
  ): Promise<unknown | null>;
  listReferredApplications(
    credentialId: string,
    limit?: number,
    offset?: number
  ): Promise<ReferredApplicationSummaryRow[]>;
  getReferredApplication(
    credentialId: string,
    referredApplicationId: string
  ): Promise<unknown | null>;
  listInvoices(
    credentialId: string,
    limit?: number,
    offset?: number
  ): Promise<InvoiceSummaryRow[]>;
  getProcessingLoad(
    countryCode: string,
    visaId?: string
  ): Promise<ProcessingLoadRow | null>;
  getDeliveryWindow(
    credentialId: string,
    recordId: string
  ): Promise<unknown | null>;
  getAffiliateStats(
    credentialId: string,
    from?: string,
    to?: string
  ): Promise<unknown>;
}

export async function withDbClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function functionCallSql(name: string, argCount: number): string {
  const placeholders =
    argCount === 0
      ? ""
      : Array.from({ length: argCount }, (_, index) => `$${index + 1}`).join(", ");

  return `select * from public.${name}(${placeholders})`;
}

async function callRows<T extends QueryResultRow>(
  db: Queryable,
  name: string,
  args: unknown[]
): Promise<T[]> {
  const result = await db.query<T>(functionCallSql(name, args.length), args);
  return result.rows;
}

async function callValue<T>(
  db: Queryable,
  name: string,
  args: unknown[]
): Promise<T> {
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

const SEARCH_SCAN_LIMIT = 1000;

export function matchesTravelGroupSearch(
  row: Pick<TravelGroupSummaryRow, "group_name" | "internal_code" | "reference">,
  search: string
): boolean {
  const needle = search.trim().toLowerCase();
  return [row.group_name, row.internal_code, row.reference].some(
    (value) => typeof value === "string" && value.toLowerCase().includes(needle)
  );
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function getConnectTokenWithDb(
  db: Queryable,
  credentialId: string
): Promise<string | null> {
  return callValue<string | null>(db, "mcp_get_connect_token", [credentialId]);
}

async function credentialFromResolvedRow(
  db: Queryable,
  row: ResolvedCredentialRow | undefined
): Promise<CredentialContext | null> {
  if (!row) {
    return null;
  }

  const connectToken = row.connect_configured
    ? await getConnectTokenWithDb(db, row.credential_id)
    : null;

  return {
    credentialId: row.credential_id,
    companyId: row.company_id,
    allowedTools: grantedPartnerTools(row.company_id),
    connectPartnerName: row.connect_partner_name,
    connectConfigured: row.connect_configured,
    connectToken,
  };
}

export function createDatabaseApi(connectionString: string): DatabaseApi {
  return {
    async resolveCredentialByApiKey(
      apiKey: string
    ): Promise<CredentialContext | null> {
      return withDbClient(connectionString, async (db) => {
        const [row] = await callRows<ResolvedCredentialRow>(
          db,
          "mcp_resolve_credential",
          [hashApiKey(apiKey)]
        );

        return credentialFromResolvedRow(db, row);
      });
    },

    async resolveCredentialByUserId(
      userId: string
    ): Promise<CredentialContext | null> {
      return withDbClient(connectionString, async (db) => {
        const [row] = await callRows<UserResolvedCredentialRow>(
          db,
          "mcp_resolve_credential_for_user",
          [userId]
        );

        if (!row) {
          return null;
        }

        if (!row.credential_id) {
          // Eligible account without a company (e.g. some admins): no
          // company-scoped data, only the tools that need no company.
          return {
            credentialId: "",
            companyId: "",
            allowedTools: grantedPartnerTools(null),
            connectPartnerName: null,
            connectConfigured: false,
            connectToken: null,
          };
        }

        return credentialFromResolvedRow(db, {
          ...row,
          credential_id: row.credential_id,
        });
      });
    },

    async getConnectToken(credentialId: string): Promise<string | null> {
      return withDbClient(connectionString, (db) =>
        getConnectTokenWithDb(db, credentialId)
      );
    },

    async getCompany(credentialId: string): Promise<unknown> {
      return withDbClient(connectionString, (db) =>
        callValue<unknown>(db, "mcp_get_company", [credentialId])
      );
    },

    async listTravelGroups(
      credentialId: string,
      limit = 25,
      offset = 0,
      search?: string
    ): Promise<TravelGroupSummaryRow[]> {
      const term = search?.trim();
      if (!term) {
        return withDbClient(connectionString, (db) =>
          callRows<TravelGroupSummaryRow>(db, "mcp_list_travel_groups", [
            credentialId,
            limit,
            offset,
          ])
        );
      }

      // Search runs over every group of the partner, then paginates the matches.
      const rows = await withDbClient(connectionString, (db) =>
        callRows<TravelGroupSummaryRow>(db, "mcp_list_travel_groups", [
          credentialId,
          SEARCH_SCAN_LIMIT,
          0,
        ])
      );
      return rows
        .filter((row) => matchesTravelGroupSearch(row, term))
        .slice(offset, offset + limit);
    },

    async getTravelGroup(
      credentialId: string,
      travelGroupId: string
    ): Promise<unknown | null> {
      return withDbClient(connectionString, (db) =>
        callValue<unknown | null>(db, "mcp_get_travel_group", [
          credentialId,
          travelGroupId,
        ])
      );
    },

    async listReferredApplications(
      credentialId: string,
      limit = 25,
      offset = 0
    ): Promise<ReferredApplicationSummaryRow[]> {
      return withDbClient(connectionString, (db) =>
        callRows<ReferredApplicationSummaryRow>(
          db,
          "mcp_list_referred_applications",
          [credentialId, limit, offset]
        )
      );
    },

    async getReferredApplication(
      credentialId: string,
      referredApplicationId: string
    ): Promise<unknown | null> {
      return withDbClient(connectionString, (db) =>
        callValue<unknown | null>(db, "mcp_get_referred_application", [
          credentialId,
          referredApplicationId,
        ])
      );
    },

    async listInvoices(
      credentialId: string,
      limit = 25,
      offset = 0
    ): Promise<InvoiceSummaryRow[]> {
      return withDbClient(connectionString, (db) =>
        callRows<InvoiceSummaryRow>(db, "mcp_list_invoices", [
          credentialId,
          limit,
          offset,
        ])
      );
    },

    async getProcessingLoad(
      countryCode: string,
      visaId?: string
    ): Promise<ProcessingLoadRow | null> {
      return withDbClient(connectionString, async (db) => {
        const rows = await callRows<ProcessingLoadRow>(
          db,
          "mcp_get_processing_load",
          [countryCode, visaId ?? null]
        );
        return rows[0] ?? null;
      });
    },

    async getDeliveryWindow(
      credentialId: string,
      recordId: string
    ): Promise<unknown | null> {
      return withDbClient(connectionString, (db) =>
        callValue<unknown | null>(db, "mcp_get_delivery_window", [
          credentialId,
          recordId,
        ])
      );
    },

    async getAffiliateStats(
      credentialId: string,
      from?: string,
      to?: string
    ): Promise<unknown> {
      return withDbClient(connectionString, (db) =>
        callValue<unknown>(db, "mcp_get_affiliate_stats", [
          credentialId,
          from ?? null,
          to ?? null,
        ])
      );
    },
  };
}
