import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { DatabaseApi } from "../db.js";
import { toolError, toolResult } from "../toolResult.js";
import type { CredentialContext, ToolName } from "../types.js";
import type { AddVisaLabels } from "../visaLabels.js";

type ToolRegistrar = Pick<McpServer, "registerTool">;

const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  .optional()
  .describe("Optional ISO 639-1 language code for the visa and destination names.");

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
        return toolResult(await db.getCompany(context.credentialId));
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
        "List B2B travel groups managed by the current partner account. Each row already includes destination, dates, traveler count and processing status, which is enough to answer overview questions without calling get_travel_group for every group. `status` is the group form status only; use `processing_status` (shared back-office status of the travelers, or \"mixed\") and `traveler_status_counts` to know where the visas stand. Only call get_travel_group or get_delivery_window when the user asks about one specific group. Records include visa_name and destination_name: always refer to a visa by its name and destination, never by its numeric document_id or visa_id.",
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
        return toolResult(
          await addVisaLabels(
            await db.listTravelGroups(context.credentialId, limit ?? 25, offset ?? 0),
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
        "Fetch one managed travel group with traveler details, invoice metadata, and partner-visible operational fields. Requires a travel_group_id from list_travel_groups. Use only when the user needs details on one specific group, not to build an overview of several groups. Records include visa_name and destination_name: always refer to a visa by its name and destination, never by its numeric document_id or visa_id.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        travel_group_id: z
          .string()
          .uuid()
          .describe("Travel group UUID returned by list_travel_groups."),
        language: languageSchema,
      }),
    },
    async ({ travel_group_id, language }) => {
      try {
        const travelGroup = await addVisaLabels(
          await db.getTravelGroup(context.credentialId, travel_group_id),
          language
        );

        return toolResult(
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
        return toolResult(
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
        "Fetch one referred application with traveler details and invoice metadata. Requires a referred_application_id from list_referred_applications. Use only when the user needs details on one specific application. Records include visa_name and destination_name: always refer to a visa by its name and destination, never by its numeric document_id or visa_id.",
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

        return toolResult(
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
        "List invoice metadata for travel groups and referred applications visible to the current partner account. Each row includes record_type to identify the source record.",
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
        return toolResult(
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
        return toolResult(await db.getProcessingLoad(country_code, visa_id));
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
        return toolResult(result ?? { status: "not_found" });
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
        return toolResult(await db.getAffiliateStats(context.credentialId, from, to));
      } catch (error) {
        return toolError(error);
      }
    }
  );
  }
}
