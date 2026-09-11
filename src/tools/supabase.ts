import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { DatabaseApi } from "../db.js";
import { toolError, toolResult } from "../toolResult.js";
import type { CredentialContext, ToolName } from "../types.js";

type ToolRegistrar = Pick<McpServer, "registerTool">;

export function registerSupabaseTools(
  server: ToolRegistrar,
  context: CredentialContext,
  allowedTools: ReadonlySet<ToolName>,
  db: DatabaseApi
): void {
  if (allowedTools.has("get_company")) {
  server.registerTool(
    "get_company",
    {
      description: "Get the partner company bound to the current MCP credential.",
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
        "List B2B travel groups you manage in the partner portal.",
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
          await db.listTravelGroups(context.credentialId, limit ?? 25, offset ?? 0)
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
        "Get one B2B travel group with traveler details, invoice metadata, and partner-visible fields.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        travel_group_id: z
          .string()
          .uuid()
          .describe("Travel group UUID returned by list_travel_groups."),
      }),
    },
    async ({ travel_group_id }) => {
      try {
        const travelGroup = await db.getTravelGroup(
          context.credentialId,
          travel_group_id
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
        "List applications generated through your affiliate links from the Referred Applications page.",
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
          await db.listReferredApplications(
            context.credentialId,
            limit ?? 25,
            offset ?? 0
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
        "Get one referred application generated through your affiliate links, with traveler details and invoice metadata.",
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
      }),
    },
    async ({ referred_application_id }) => {
      try {
        const application = await db.getReferredApplication(
          context.credentialId,
          referred_application_id
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
        "List invoice metadata for travel groups and referred applications visible to your account. Each row includes a record_type.",
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
        "Get the average processing load for a destination country and optional visa id.",
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
        "Calculate the estimated delivery window for a travel group or referred application using processing-load averages and arrival date.",
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
      }),
    },
    async ({ record_id }) => {
      try {
        const result = await db.getDeliveryWindow(context.credentialId, record_id);
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
        "Get click and conversion aggregates for the current partner company over an optional date range.",
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
