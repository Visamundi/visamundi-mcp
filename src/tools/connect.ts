import { z } from "zod";
import {
  getCustoms,
  getPublicCustoms,
  getPublicVaccines,
  getVaccines,
  getVisa,
  getVisaRequirements,
  listCountries,
  listVisas,
} from "../api.js";
import { toolError, toolResult } from "../toolResult.js";
import type { CredentialContext, ToolName } from "../types.js";
import type { McpServer } from "@modelcontextprotocol/server";

type ToolRegistrar = Pick<McpServer, "registerTool">;

export interface ConnectToolOptions {
  fallbackConnectToken?: string | null;
  publicCountryGuard?: boolean;
}

function requireConnectToken(
  context: CredentialContext,
  fallbackConnectToken?: string | null
): string {
  const token = context.connectToken ?? fallbackConnectToken ?? null;

  if (!token) {
    throw new Error("No API token is configured for visa data requests.");
  }

  return token;
}

export function registerConnectTools(
  server: ToolRegistrar,
  context: CredentialContext,
  allowedTools: ReadonlySet<ToolName>,
  options: ConnectToolOptions = {}
): void {
  if (allowedTools.has("list_visas")) {
    server.registerTool(
      "list_visas",
      {
        description:
          "List visa products for a destination, optionally filtered by nationality, reason, stay duration, or language.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: z.object({
          destination: z
            .string()
            .min(2)
            .max(3)
            .describe(
              "Destination country ISO 3166-1 alpha-2 or alpha-3 code (for example TH or IND)."
            ),
          nationality: z
            .string()
            .min(2)
            .max(3)
            .optional()
            .describe(
              "Optional traveller nationality ISO 3166-1 alpha-2 or alpha-3 code."
            ),
          reason: z
            .string()
            .optional()
            .describe("Optional travel reason slug such as tourism or business."),
          stay_duration: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Optional minimum stay duration in days."),
          language: z
            .string()
            .optional()
            .describe("Optional ISO 639-1 language code for localized fields."),
        }),
      },
      async ({ destination, nationality, reason, stay_duration, language }) => {
        try {
          return toolResult(
            await listVisas({
              token: requireConnectToken(context, options.fallbackConnectToken),
              destination,
              nationality,
              reason,
              stay_duration,
              language,
            })
          );
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }

  if (allowedTools.has("get_visa")) {
    server.registerTool(
      "get_visa",
      {
        description: "Get full details for a single visa product by its numeric ID.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: z.object({
          id: z.number().int().positive().describe("Visa product ID."),
          language: z
            .string()
            .optional()
            .describe("Optional ISO 639-1 language code for localized fields."),
        }),
      },
      async ({ id, language }) => {
        try {
          return toolResult(
            await getVisa({
              token: requireConnectToken(context, options.fallbackConnectToken),
              id,
              language,
            })
          );
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }

  if (allowedTools.has("get_visa_requirements")) {
    server.registerTool(
      "get_visa_requirements",
      {
        description:
          "Get visa requirements for a traveller nationality and destination.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: z.object({
          nationality: z
            .string()
            .min(2)
            .max(3)
            .describe("Traveller nationality ISO 3166-1 alpha-2 or alpha-3 code."),
          destination: z
            .string()
            .min(2)
            .max(3)
            .describe("Destination country ISO 3166-1 alpha-2 or alpha-3 code."),
          language: z
            .string()
            .optional()
            .describe("Optional ISO 639-1 language code for localized fields."),
        }),
      },
      async ({ nationality, destination, language }) => {
        try {
          return toolResult(
            await getVisaRequirements({
              token: requireConnectToken(context, options.fallbackConnectToken),
              nationality,
              destination,
              language,
            })
          );
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }

  if (allowedTools.has("get_vaccines")) {
    server.registerTool(
      "get_vaccines",
      {
        description: "Get vaccine guidance for a destination country.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: z.object({
          country_code: z
            .string()
            .min(2)
            .max(3)
            .describe("Destination country ISO 3166-1 alpha-2 or alpha-3 code."),
        }),
      },
      async ({ country_code }) => {
        try {
          const getVaccinesForRequest = options.publicCountryGuard
            ? getPublicVaccines
            : getVaccines;

          return toolResult(
            await getVaccinesForRequest({
              token: requireConnectToken(context, options.fallbackConnectToken),
              country_code,
            })
          );
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }

  if (allowedTools.has("get_customs")) {
    server.registerTool(
      "get_customs",
      {
        description: "Get customs information for a destination country.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: z.object({
          country_code: z
            .string()
            .min(2)
            .max(3)
            .describe("Destination country ISO 3166-1 alpha-2 or alpha-3 code."),
        }),
      },
      async ({ country_code }) => {
        try {
          const getCustomsForRequest = options.publicCountryGuard
            ? getPublicCustoms
            : getCustoms;

          return toolResult(
            await getCustomsForRequest({
              token: requireConnectToken(context, options.fallbackConnectToken),
              country_code,
            })
          );
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }

  if (allowedTools.has("list_countries")) {
    server.registerTool(
      "list_countries",
      {
        description: "List available countries.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: z.object({}),
      },
      async () => {
        try {
          return toolResult(
            await listCountries(
              requireConnectToken(context, options.fallbackConnectToken)
            )
          );
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }
}
