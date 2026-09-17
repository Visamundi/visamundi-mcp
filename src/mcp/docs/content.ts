import type { ToolName } from "../../types.js";

export const PUBLIC_SERVER_INSTRUCTIONS = `
You are connected to the Visamundi public MCP server.

Use these tools for read-only travel and visa reference data from Visamundi Connect.

Recommended workflow:
1. If the user asks whether a visa is required, call get_visa_requirements with nationality and destination.
2. If they need available visa products, call list_visas for the destination.
3. If they selected a product or gave a visa product ID, call get_visa.
4. For health or entry rules, call get_vaccines or get_customs for the destination country.

Country codes must be ISO 3166-1 alpha-2 or alpha-3 (examples: CN, CHN, AF, AFG, FR, TH).
Language codes must be ISO 639-1 (examples: en, fr).

This public route does not expose list_countries or any partner portal tools.
Prefer the smallest number of tool calls needed to answer the question.
`.trim();

export const PARTNER_SERVER_INSTRUCTIONS = `
You are connected to the Visamundi partner MCP server.

This server combines Visamundi Connect visa data with partner-scoped portal data.
Only tools allowed for the current credential are available.

Recommended workflow:
1. Call get_company first when you need account or company context.
2. Use get_visa_requirements or list_visas for visa eligibility and product discovery.
3. Use list_travel_groups / get_travel_group for managed B2B groups.
4. Use list_referred_applications / get_referred_application for affiliate-generated applications.
5. Use get_processing_load and get_delivery_window for operational timing questions.
6. Use list_invoices and get_affiliate_stats for billing and performance views.

Country codes must be ISO 3166-1 alpha-2 or alpha-3.
Record UUIDs must come from list_travel_groups or list_referred_applications.
Never guess travel_group_id, referred_application_id, or record_id values.

Tool availability:
- tools/list is authoritative for this connection.
- If a tool appears in Visamundi docs but not in tools/list, it is not enabled for this credential. This commonly means it was disabled on your Visamundi partner MCP access page or was never granted.
- Do not retry with alternate routes or invent tool names. Tell the user to re-enable the tool on the MCP access page and reconnect if needed.
`.trim();

export function buildPartnerServerInstructions(
  allowedTools: readonly ToolName[]
): string {
  const enabledTools = [...allowedTools].sort((left, right) =>
    left.localeCompare(right)
  );

  return [
    PARTNER_SERVER_INSTRUCTIONS,
    `Enabled tools for this connection: ${
      enabledTools.length > 0 ? enabledTools.join(", ") : "none"
    }.`,
  ].join("\n\n");
}

export const COUNTRY_CODES_GUIDE = `# Country and language codes

## Country codes
Use ISO 3166-1 alpha-2 or alpha-3 codes in tool arguments.

Examples:
- China: CN or CHN
- Afghanistan: AF or AFG
- France: FR or FRA
- Thailand: TH or THA
- United States: US or USA
- United Kingdom: GB or GBR

Codes are case-insensitive at the API boundary but should be passed as uppercase when possible.

## Language codes
Use ISO 639-1 codes for localized visa content when supported.

Examples:
- en
- fr
- de
- es

Optional regional variants such as en-US are accepted when supported by the schema.
`.trim();

export const PUBLIC_TOOL_GUIDE = `# Visamundi public tool guide

## get_visa_requirements
Use when the traveller asks whether a visa is required, visa-free entry applies, or what rule applies for a nationality visiting a destination.

Required:
- nationality
- destination

Optional:
- language

## list_visas
Use to discover visa products for a destination before fetching full product details.

Required:
- destination

Optional:
- nationality
- reason
- stay_duration
- language

## get_visa
Use after list_visas when you need full details for one product.

Required:
- id

Optional:
- language

## get_vaccines
Use for destination-specific vaccination guidance.

Required:
- country_code

## get_customs
Use for destination-specific customs and import rules.

Required:
- country_code
`.trim();

export const PARTNER_TOOL_GUIDE = `# Visamundi partner tool guide

## Tool availability
Use tools/list as the source of truth for the current connection.

If a tool appears in these docs but not in tools/list, it is not enabled for this credential. That usually means it was disabled on your Visamundi partner MCP access page or was never granted.

Do not invent missing tool names or keep retrying. Ask the user to re-enable the tool on the MCP access page and reconnect if needed.

Connect tools and portal tools can be enabled independently for the same credential.

## Connect tools
Partner credentials may include some or all Connect tools:
- list_countries
- list_visas
- get_visa
- get_visa_requirements
- get_vaccines
- get_customs

Use the same selection logic as the public server, plus list_countries when you need the country catalog.

## Portal tools
- get_company: current partner company profile
- list_travel_groups / get_travel_group: managed B2B travel groups
- list_referred_applications / get_referred_application: affiliate-generated applications
- list_invoices: invoice metadata across visible records
- get_processing_load: average processing load by destination and optional visa id
- get_delivery_window: estimated delivery window for a travel group or referred application
- get_affiliate_stats: click and conversion aggregates for the partner company

## ID rules
- travel_group_id comes from list_travel_groups
- referred_application_id comes from list_referred_applications
- record_id for get_delivery_window comes from one of those list endpoints
`.trim();

export const PUBLIC_WORKFLOWS = `# Example public workflows

## Check visa requirement
1. get_visa_requirements(nationality, destination)
2. If products are needed, list_visas(destination, nationality)

## Compare visa products
1. list_visas(destination, nationality)
2. get_visa(id) for each product the user wants compared

## Prepare a trip briefing
1. get_visa_requirements(nationality, destination)
2. get_vaccines(country_code=destination)
3. get_customs(country_code=destination)
`.trim();

export const PARTNER_WORKFLOWS = `# Example partner workflows

## Review one managed group
1. get_company
2. list_travel_groups
3. get_travel_group(travel_group_id)
4. get_delivery_window(record_id=travel_group_id) when timing matters

## Review affiliate performance
1. get_company
2. get_affiliate_stats(from, to)
3. list_referred_applications

## Quote processing time
1. get_processing_load(country_code, visa_id?)
2. get_delivery_window(record_id)
`.trim();
