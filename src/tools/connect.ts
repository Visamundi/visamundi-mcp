import { z } from "zod";
import {
  type ConnectCache,
  type FetchTelemetry,
  type PublicToolName,
  getCustoms,
  getPublicCustoms,
  getPublicVaccines,
  getVaccines,
  getVisa,
  getVisaRequirements,
  listCountries,
  sanitizePublicResponse,
  listVisas,
} from "../api.js";
import { toolError, toolResult } from "../toolResult.js";
import type { CredentialContext, ToolName } from "../types.js";
import type { McpServer } from "@modelcontextprotocol/server";

type ToolRegistrar = Pick<McpServer, "registerTool">;

export interface ConnectToolOptions {
  fallbackConnectToken?: string | null;
  publicCountryGuard?: boolean;
  cache?: ConnectCache;
  onPublicToolCall?: (event: PublicToolCallEvent) => void;
}

export interface PublicToolCallEvent {
  toolName: PublicToolName;
  arguments: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  cacheHit: boolean;
  upstreamStatus?: number;
  errorMessage?: string;
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

const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}$/)
  .describe("ISO 3166-1 alpha-2 or alpha-3 country code.");

const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  .describe("Optional ISO 639-1 language code for localized fields.");

const reasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z-]+$/)
  .describe("Optional travel reason slug such as tourism or business.");

function emitPublicToolCall(
  options: ConnectToolOptions,
  event: PublicToolCallEvent
): void {
  options.onPublicToolCall?.(event);
}

function formatPublicResult(
  toolName: PublicToolName,
  result: unknown
): ReturnType<typeof toolResult> {
  return toolResult(sanitizePublicResponse(toolName, result));
}

async function runPublicTool(
  toolName: PublicToolName,
  args: Record<string, unknown>,
  options: ConnectToolOptions,
  action: (onComplete: (telemetry: FetchTelemetry) => void) => Promise<unknown>
): Promise<ReturnType<typeof toolResult> | ReturnType<typeof toolError>> {
  const startedAt = Date.now();
  let telemetry: FetchTelemetry | undefined;

  try {
    const result = await action((nextTelemetry) => {
      telemetry = nextTelemetry;
    });
    emitPublicToolCall(options, {
      toolName,
      arguments: args,
      durationMs: Date.now() - startedAt,
      success: true,
      cacheHit: telemetry?.cacheHit ?? false,
      upstreamStatus: telemetry?.status ?? 200,
    });
    return formatPublicResult(toolName, result);
  } catch (error) {
    emitPublicToolCall(options, {
      toolName,
      arguments: args,
      durationMs: Date.now() - startedAt,
      success: false,
      cacheHit: telemetry?.cacheHit ?? false,
      upstreamStatus: telemetry?.status,
      errorMessage: error instanceof Error ? error.message : "Unknown error occurred",
    });
    return toolError(error);
  }
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
            .trim()
            .regex(/^[A-Za-z]{2,3}$/)
            .describe(
              "Destination country ISO 3166-1 alpha-2 or alpha-3 code (for example TH or IND)."
            ),
          nationality: countryCodeSchema
            .optional()
            .describe("Optional traveller nationality ISO 3166-1 alpha-2 or alpha-3 code."),
          reason: reasonSchema.optional(),
          stay_duration: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Optional minimum stay duration in days."),
          language: languageSchema.optional(),
        }),
      },
      async ({ destination, nationality, reason, stay_duration, language }) => {
        if (options.publicCountryGuard) {
          return runPublicTool(
            "list_visas",
            { destination, nationality, reason, stay_duration, language },
            options,
            (onComplete) =>
              listVisas({
                token: requireConnectToken(context, options.fallbackConnectToken),
                destination,
                nationality,
                reason,
                stay_duration,
                language,
                cache: options.cache,
                onComplete,
              })
          );
        }

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
          language: languageSchema.optional(),
        }),
      },
      async ({ id, language }) => {
        if (options.publicCountryGuard) {
          return runPublicTool(
            "get_visa",
            { id, language },
            options,
            (onComplete) =>
              getVisa({
                token: requireConnectToken(context, options.fallbackConnectToken),
                id,
                language,
                cache: options.cache,
                onComplete,
              })
          );
        }

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
          nationality: countryCodeSchema.describe(
            "Traveller nationality ISO 3166-1 alpha-2 or alpha-3 code."
          ),
          destination: countryCodeSchema.describe(
            "Destination country ISO 3166-1 alpha-2 or alpha-3 code."
          ),
          language: languageSchema.optional(),
        }),
      },
      async ({ nationality, destination, language }) => {
        if (options.publicCountryGuard) {
          return runPublicTool(
            "get_visa_requirements",
            { nationality, destination, language },
            options,
            (onComplete) =>
              getVisaRequirements({
                token: requireConnectToken(context, options.fallbackConnectToken),
                nationality,
                destination,
                language,
                cache: options.cache,
                onComplete,
              })
          );
        }

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
          country_code: countryCodeSchema.describe(
            "Destination country ISO 3166-1 alpha-2 or alpha-3 code."
          ),
        }),
      },
      async ({ country_code }) => {
        const getVaccinesForRequest = options.publicCountryGuard
          ? getPublicVaccines
          : getVaccines;

        if (options.publicCountryGuard) {
          return runPublicTool(
            "get_vaccines",
            { country_code },
            options,
            (onComplete) =>
              getVaccinesForRequest({
                token: requireConnectToken(context, options.fallbackConnectToken),
                country_code,
                cache: options.cache,
                onComplete,
              })
          );
        }

        try {
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
          country_code: countryCodeSchema.describe(
            "Destination country ISO 3166-1 alpha-2 or alpha-3 code."
          ),
        }),
      },
      async ({ country_code }) => {
        const getCustomsForRequest = options.publicCountryGuard
          ? getPublicCustoms
          : getCustoms;

        if (options.publicCountryGuard) {
          return runPublicTool(
            "get_customs",
            { country_code },
            options,
            (onComplete) =>
              getCustomsForRequest({
                token: requireConnectToken(context, options.fallbackConnectToken),
                country_code,
                cache: options.cache,
                onComplete,
              })
          );
        }

        try {
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
