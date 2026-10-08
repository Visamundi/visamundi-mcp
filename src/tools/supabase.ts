import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { DatabaseApi } from "../db.js";
import { toolError, toolResult } from "../toolResult.js";
import type { CredentialContext, ToolName } from "../types.js";
import { toPartnerStatuses } from "../partnerStatuses.js";
import type { AddVisaLabels } from "../visaLabels.js";

type ToolRegistrar = Pick<McpServer, "registerTool">;

const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  .optional()
  .describe("Optional ISO 639-1 language code for the visa and destination names.");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function partnerResult(result: unknown) {
  return toolResult(toPartnerStatuses(result));
}

export function registerSupabaseTools(
  server: ToolRegistrar,
  context: CredentialContext,
  allowedTools: ReadonlySet<ToolName>,
  db: DatabaseApi,
  addVisaLabels: AddVisaLabels = async (data) => data
): void {
  if (allowedTools.has("get_company")) {
  server.registerTool(
    "get_company",
    {
      description:
        "Return the partner company profile bound to the current credential. Only call this when the user asks about their company or account; other partner tools are already scoped to the current partner and do not need it.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return partnerResult(await db.getCompany(context.credentialId));
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }

  if (allowedTools.has("list_travel_groups")) {
  server.registerTool(
    "list_travel_groups",
    {
      description:
        "List B2B travel groups managed by the current partner account. Each row already includes destination, dates, traveler count and the group status, which is enough to answer overview and group status questions without calling get_travel_group. When the user names a group (name, internal code or reference), pass it as search instead of paging through every group. Status values are already partner-facing wording: relay their meaning in the user's language. Only call get_travel_group when the user asks about the travelers of one specific group, and get_delivery_window when they ask about timing. Records include visa_name and destination_name: always refer to a visa by its name and destination, never by its numeric document_id or visa_id.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        search: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .optional()
          .describe("Optional group name, internal code or reference to look for (case-insensitive, partial match)."),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        language: languageSchema,
      }),
    },
    async ({ search, limit, offset, language }) => {
      try {
        return partnerResult(
          await addVisaLabels(
            await db.listTravelGroups(
              context.credentialId,
              limit ?? 25,
              offset ?? 0,
              search
            ),
            language
          )
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }

  if (allowedTools.has("get_travel_group")) {
  server.registerTool(
    "get_travel_group",
    {
      description:
        "Fetch one managed travel group with traveler details (including each traveler's status), invoices (with their invoice_url link), and partner-visible operational fields. Requires a travel_group_id from list_travel_groups. Use only when the user needs details on one specific group, not to build an overview of several groups. Only report traveler statuses when the user asks about the travelers. Records include visa_name and destination_name: always refer to a visa by its name and destination, never by its numeric document_id or visa_id.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        travel_group_id: z
          .string()
          .describe("Travel group UUID returned by list_travel_groups, never a group name."),
        language: languageSchema,
      }),
    },
    async ({ travel_group_id, language }) => {
      if (!UUID_PATTERN.test(travel_group_id)) {
        return toolError(
          new Error(
            "travel_group_id must be the UUID returned by list_travel_groups. To find a group by name, internal code or reference, call list_travel_groups with search."
          )
        );
      }

      try {
        const travelGroup = await addVisaLabels(
          await db.getTravelGroup(context.credentialId, travel_group_id),
          language
        );

        return partnerResult(
          travelGroup ?? {
            record_type: "travel_group",
            status: "not_found",
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }

  if (allowedTools.has("list_referred_applications")) {
  server.registerTool(
    "list_referred_applications",
    {
      description:
        "List referred applications generated through the partner's affiliate links. Each row already includes destination, dates, status and traveler count, which is enough for overview questions. Only call get_referred_application when the user asks about one specific application. Records include visa_name and destination_name: always refer to a visa by its name and destination, never by its numeric document_id or visa_id.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        language: languageSchema,
      }),
    },
    async ({ limit, offset, language }) => {
      try {
        return partnerResult(
          await addVisaLabels(
            await db.listReferredApplications(
              context.credentialId,
              limit ?? 25,
              offset ?? 0
            ),
            language
          )
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }

  if (allowedTools.has("get_referred_application")) {
  server.registerTool(
    "get_referred_application",
    {
      description:
        "Fetch one referred application with traveler details and invoices (with their invoice_url link). Requires a referred_application_id from list_referred_applications. Use only when the user needs details on one specific application. Records include visa_name and destination_name: always refer to a visa by its name and destination, never by its numeric document_id or visa_id.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        referred_application_id: z
          .string()
          .uuid()
          .describe(
            "Referred application UUID returned by list_referred_applications."
          ),
        language: languageSchema,
      }),
    },
    async ({ referred_application_id, language }) => {
      try {
        const application = await addVisaLabels(
          await db.getReferredApplication(context.credentialId, referred_application_id),
          language
        );

        return partnerResult(
          application ?? {
            record_type: "referred_application",
            status: "not_found",
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }

  if (allowedTools.has("list_invoices")) {
  server.registerTool(
    "list_invoices",
    {
      description:
        "List invoices for travel groups and referred applications visible to the current partner account. Each row includes record_type to identify the source record and invoice_url, the only valid link to the invoice (null when no link is available).",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    },
    async ({ limit, offset }) => {
      try {
        return partnerResult(
          await db.listInvoices(context.credentialId, limit ?? 25, offset ?? 0)
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }

  if (allowedTools.has("get_processing_load")) {
  server.registerTool(
    "get_processing_load",
    {
      description:
        "Return average processing load for a destination country and optional visa id. Use when estimating how busy processing is for a route or product.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        country_code: z
          .string()
          .min(2)
          .max(3)
          .describe("Destination country ISO code."),
        visa_id: z.string().optional().describe("Optional visa id as stored on the submission."),
      }),
    },
    async ({ country_code, visa_id }) => {
      try {
        return partnerResult(await db.getProcessingLoad(country_code, visa_id));
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }

  if (allowedTools.has("get_delivery_window")) {
  server.registerTool(
    "get_delivery_window",
    {
      description:
        "Estimate the delivery window for a travel group or referred application using processing-load averages and arrival date. Requires record_id from list_travel_groups or list_referred_applications. Records include visa_name and destination_name: always refer to a visa by its name and destination, never by its numeric document_id or visa_id.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        record_id: z
          .string()
          .uuid()
          .describe(
            "Record UUID returned by list_travel_groups or list_referred_applications."
          ),
        language: languageSchema,
      }),
    },
    async ({ record_id, language }) => {
      try {
        const result = await addVisaLabels(
          await db.getDeliveryWindow(context.credentialId, record_id),
          language
        );
        return partnerResult(result ?? { status: "not_found" });
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }

  if (allowedTools.has("get_affiliate_stats")) {
  server.registerTool(
    "get_affiliate_stats",
    {
      description:
        "Return click and conversion aggregates for the current partner company over an optional date range. Use for affiliate performance reporting.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        from: z.string().date().optional().describe("Inclusive start date in YYYY-MM-DD format."),
        to: z.string().date().optional().describe("Inclusive end date in YYYY-MM-DD format."),
      }),
    },
    async ({ from, to }) => {
      try {
        return partnerResult(await db.getAffiliateStats(context.credentialId, from, to));
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }
}
