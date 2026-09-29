import { createHash } from "node:crypto";
import { Client, type QueryResultRow } from "pg";
import type {
  CredentialContext,
  InvoiceSummaryRow,
  ProcessingLoadRow,
  ReferredApplicationSummaryRow,
  ResolvedCredentialRow,
  TravelGroupListItem,
  TravelGroupSummaryRow,
} from "./types.js";
import { normalizeToolNames } from "./types.js";

type Queryable = Pick<Client, "query">;

export interface DatabaseApi {
  resolveCredentialByApiKey(apiKey: string): Promise<CredentialContext | null>;
  getConnectToken(credentialId: string): Promise<string | null>;
  getCompany(credentialId: string): Promise<unknown>;
  listTravelGroups(
    credentialId: string,
    limit?: number,
    offset?: number
  ): Promise<TravelGroupListItem[]>;
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

// The group-level `status` is the form status (almost always "draft"); the real
// processing state lives on each traveler as `backoffice_status`.
export function summarizeTravelerStatuses(
  statuses: readonly (string | null)[]
): Pick<TravelGroupListItem, "processing_status" | "traveler_status_counts"> {
  const counts: Record<string, number> = {};

  for (const status of statuses) {
    if (status) {
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }

  const distinct = Object.keys(counts);

  return {
    processing_status:
      distinct.length === 0 ? null : distinct.length === 1 ? distinct[0] : "mixed",
    traveler_status_counts: counts,
  };
}

// Reuses mcp_get_travel_group so the credential scoping stays in the database.
const TRAVELER_STATUSES_SQL = `
select g.id::text as travel_group_id,
       coalesce(
         (select jsonb_agg(t ->> 'backoffice_status')
            from jsonb_array_elements(
              coalesce((public.mcp_get_travel_group($1, g.id))::jsonb -> 'travelers', '[]'::jsonb)
            ) as t),
         '[]'::jsonb
       ) as statuses
  from unnest($2::uuid[]) as g(id)`;

async function withTravelerStatuses(
  db: Queryable,
  credentialId: string,
  rows: TravelGroupSummaryRow[]
): Promise<TravelGroupListItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const result = await db.query<{
    travel_group_id: string;
    statuses: (string | null)[];
  }>(TRAVELER_STATUSES_SQL, [
    credentialId,
    rows.map((row) => row.travel_group_id),
  ]);
  const statusesById = new Map(
    result.rows.map((row) => [row.travel_group_id, row.statuses])
  );

  return rows.map((row) => ({
    ...row,
    ...summarizeTravelerStatuses(statusesById.get(row.travel_group_id) ?? []),
  }));
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

        if (!row) {
          return null;
        }

        const connectToken = row.connect_configured
          ? await getConnectTokenWithDb(db, row.credential_id)
          : null;

        return {
          credentialId: row.credential_id,
          companyId: row.company_id,
          allowedTools: normalizeToolNames(row.allowed_tools ?? []),
          connectPartnerName: row.connect_partner_name,
          connectConfigured: row.connect_configured,
          connectToken,
        };
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
      offset = 0
    ): Promise<TravelGroupListItem[]> {
      return withDbClient(connectionString, async (db) => {
        const rows = await callRows<TravelGroupSummaryRow>(
          db,
          "mcp_list_travel_groups",
          [credentialId, limit, offset]
        );
        return withTravelerStatuses(db, credentialId, rows);
      });
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
