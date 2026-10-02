export const ALL_TOOL_NAMES = [
  "list_visas",
  "get_visa",
  "get_visa_requirements",
  "get_vaccines",
  "get_customs",
  "list_countries",
  "get_company",
  "list_travel_groups",
  "get_travel_group",
  "list_referred_applications",
  "get_referred_application",
  "list_invoices",
  "get_processing_load",
  "get_delivery_window",
  "get_affiliate_stats",
] as const;

export type ToolName = (typeof ALL_TOOL_NAMES)[number];

/** Tools that read company-scoped data and therefore need a company context. */
export const COMPANY_TOOL_NAMES = [
  "get_company",
  "list_travel_groups",
  "get_travel_group",
  "list_referred_applications",
  "get_referred_application",
  "list_invoices",
  "get_delivery_window",
  "get_affiliate_stats",
] as const satisfies readonly ToolName[];

/**
 * Every partner gets every tool: per-key tool selection no longer exists.
 * Accounts without a company only get the tools that need no company context.
 */
export function grantedPartnerTools(companyId: string | null | undefined): ToolName[] {
  if (companyId) {
    return [...ALL_TOOL_NAMES];
  }

  const companyTools = new Set<ToolName>(COMPANY_TOOL_NAMES);
  return ALL_TOOL_NAMES.filter((tool) => !companyTools.has(tool));
}

export interface CredentialContext {
  credentialId: string;
  companyId: string;
  allowedTools: ToolName[];
  connectPartnerName: string | null;
  connectConfigured: boolean;
  connectToken: string | null;
}

export interface ResolvedCredentialRow {
  credential_id: string;
  company_id: string;
  allowed_tools: string[];
  connect_partner_name: string | null;
  connect_configured: boolean;
}

export interface UserResolvedCredentialRow
  extends Omit<ResolvedCredentialRow, "credential_id"> {
  credential_id: string | null;
}

export interface TravelGroupSummaryRow {
  record_type: "travel_group";
  travel_group_id: string;
  status: string;
  channel: string;
  destination_iso: string | null;
  document_id: string | null;
  reason: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  trip_duration: number | null;
  contact_email: string | null;
  reference: string | null;
  group_name: string | null;
  internal_code: string | null;
  legacy_travel_group_id: string | null;
  traveler_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReferredApplicationSummaryRow {
  record_type: "referred_application";
  referred_application_id: string;
  status: string;
  channel: string;
  destination_iso: string | null;
  document_id: string | null;
  reason: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  trip_duration: number | null;
  contact_email: string | null;
  reference: string | null;
  affiliate_code: string | null;
  traveler_count: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceSummaryRow {
  invoice_id: string;
  record_id: string;
  record_type: "travel_group" | "referred_application" | "unknown";
  invoice_number: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  amount: string | number | null;
  currency: string | null;
  status: string;
  service_fees: number | null;
  validated_at: string | null;
  created_at: string;
}

export interface ProcessingLoadRow {
  country_code: string;
  visa_id: string;
  avg_delay_hours: string | number | null;
  avg_process_days: string | number;
  last_updated: string | null;
}

const LEGACY_TOOL_NAME_MAP: Record<string, ToolName> = {
  "connect.list_visas": "list_visas",
  "connect.get_visa": "get_visa",
  "supabase.get_company": "get_company",
  "supabase.list_travel_groups": "list_travel_groups",
  "supabase.get_travel_group": "get_travel_group",
  "supabase.list_referred_applications": "list_referred_applications",
  "supabase.get_referred_application": "get_referred_application",
  "supabase.list_invoices": "list_invoices",
  "supabase.get_processing_load": "get_processing_load",
  "supabase.get_delivery_window": "get_delivery_window",
  "supabase.get_affiliate_stats": "get_affiliate_stats",
};

export function normalizeToolNames(input: readonly string[]): ToolName[] {
  const normalized = new Set<ToolName>();

  for (const value of input) {
    if (ALL_TOOL_NAMES.includes(value as ToolName)) {
      normalized.add(value as ToolName);
      continue;
    }

    const legacyName = LEGACY_TOOL_NAME_MAP[value];
    if (legacyName) {
      normalized.add(legacyName);
    }
  }

  return ALL_TOOL_NAMES.filter((tool) => normalized.has(tool));
}

export function parseAllowedToolsEnv(value: string | undefined): ToolName[] {
  if (!value) {
    return ["list_visas", "get_visa"];
  }

  const requested = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const allowed = normalizeToolNames(requested);
  return allowed.length > 0 ? allowed : ["list_visas", "get_visa"];
}
