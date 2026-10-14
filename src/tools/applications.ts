import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { toolResult } from "../toolResult.js";

/**
 * Agent visa-application tools (public route). The business rules live in
 * form-visamundi-next `/api/agent/*`; these tools only relay calls with the
 * shared service key and turn HTTP errors into messages an agent can act on.
 * Results are not passed through the Connect redaction: `resumeToken` must
 * reach the agent for the follow-up calls.
 */
export const APPLICATION_TOOL_NAMES = [
  "get_application_form",
  "save_application",
  "get_payment_link",
] as const;

export type ApplicationToolName = (typeof APPLICATION_TOOL_NAMES)[number];

export interface FormAgentApiConfig {
  baseUrl: string;
  apiKey: string;
  /** Traveller IP (CF-Connecting-IP), forwarded for the form's own rate limit. */
  clientIp?: string | null;
  fetchImpl?: typeof fetch;
}

export interface ApplicationToolCallEvent {
  toolName: ApplicationToolName;
  arguments: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  cacheHit: boolean;
  upstreamStatus?: number;
  errorMessage?: string;
}

export interface ApplicationToolOptions {
  onToolCall?: (event: ApplicationToolCallEvent) => void;
}

type ToolRegistrar = Pick<McpServer, "registerTool">;

const FORM_LOCALES = ["fr", "en", "de", "es", "it", "pt", "zh", "hi", "ar"] as const;
const MAX_TRAVELERS = 10;

const visaIdSchema = z
  .union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)])
  .transform(String)
  .describe("Visa product ID, as returned by list_visas / get_visa.");

const applicationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe("applicationId returned by the first save_application call.");

const resumeTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .describe("resumeToken returned by the first save_application call. Keep it private.");

const valuesSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "Application-level answers (contact, trip dates, purpose, billing address, questionnaire, options), keyed as in the `values` schema of get_application_form."
  );

const travelersSchema = z
  .array(z.record(z.string(), z.unknown()))
  .max(MAX_TRAVELERS)
  .describe(
    "One object per traveller (identity and passport), keyed as in the `travelers` schema of get_application_form. On update, travellers are merged by position."
  );

interface Gap {
  path?: string;
  reason?: string;
  /** Allowed values, minimum date or expected format, when the form API knows it. */
  hint?: string;
}

class FormApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function formatGaps(gaps: unknown): string {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return "";
  }
  return (gaps as Gap[])
    .map(
      (gap) =>
        `- ${gap.path ?? "?"}: ${gap.reason ?? "invalid"}${gap.hint ? ` (${gap.hint})` : ""}`
    )
    .join("\n");
}

function errorMessage(status: number, body: Record<string, unknown> | null): string {
  const code = typeof body?.error === "string" ? body.error : undefined;
  switch (status) {
    case 400:
      return `Invalid input. Fix these fields and retry:\n${formatGaps(body?.missing) || "- request body"}`;
    case 401:
      return "Not authorised: the applicationId / resumeToken pair is invalid. Use the values returned by save_application.";
    case 404:
      return "Application or visa not found. It may have expired: start again with save_application without applicationId.";
    case 409:
      return `This application can no longer be changed (status: ${String(body?.status ?? "locked")}). If it is paid, nothing else is needed.`;
    case 422:
      if (code === "incomplete") {
        return `The application is incomplete. Complete these fields with save_application, then retry:\n${formatGaps(body?.missing)}`;
      }
      return `This visa or application cannot be submitted by an agent (${String(body?.detail ?? code ?? "unsupported")}). Invite the traveller to apply directly on https://form.visamundi.app.`;
    case 429:
      return "Too many requests. Wait a few minutes before retrying.";
    default:
      return "The Visamundi application service is temporarily unavailable. Retry later.";
  }
}

async function callFormApi(
  config: FormAgentApiConfig,
  method: "GET" | "POST" | "PATCH",
  path: string,
  options: { body?: unknown; resumeToken?: string } = {}
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Agent-Key": config.apiKey,
  };
  if (config.clientIp) headers["X-Agent-Client-Ip"] = config.clientIp;
  if (options.resumeToken) headers["X-Resume-Token"] = options.resumeToken;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const fetchImpl = config.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new FormApiError(errorMessage(502, null), 502);
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body) {
    const status = response.ok ? 502 : response.status;
    throw new FormApiError(errorMessage(status, body), status);
  }
  return body;
}

function textError(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

async function run(
  toolName: ApplicationToolName,
  args: Record<string, unknown>,
  options: ApplicationToolOptions,
  action: () => Promise<ReturnType<typeof toolResult>>
) {
  const startedAt = Date.now();
  try {
    const result = await action();
    options.onToolCall?.({
      toolName,
      arguments: args,
      durationMs: Date.now() - startedAt,
      success: true,
      cacheHit: false,
      upstreamStatus: 200,
    });
    return result;
  } catch (error) {
    const status = error instanceof FormApiError ? error.status : undefined;
    const message =
      error instanceof FormApiError ? error.message : errorMessage(500, null);
    options.onToolCall?.({
      toolName,
      arguments: args,
      durationMs: Date.now() - startedAt,
      success: false,
      cacheHit: false,
      upstreamStatus: status,
      errorMessage: error instanceof FormApiError ? `http_${status}` : "internal",
    });
    return textError(message);
  }
}

function withNextStep(body: Record<string, unknown>, resumeToken?: string) {
  const missing = Array.isArray(body.missing) ? body.missing : [];
  const complete = missing.length === 0;
  return {
    ...body,
    resumeToken: body.resumeToken ?? resumeToken,
    complete,
    nextStep: complete
      ? "The application is complete. Call get_payment_link with applicationId and resumeToken, then give the link to the traveller."
      : `Ask the traveller for the missing information (never invent personal or passport data), then call save_application again with the same applicationId and resumeToken. Missing:\n${formatGaps(missing)}`,
  };
}

export function registerApplicationTools(
  server: ToolRegistrar,
  config: FormAgentApiConfig,
  options: ApplicationToolOptions = {}
): void {
  server.registerTool(
    "get_application_form",
    {
      description:
        "Get everything needed to fill a Visamundi visa application for one visa product: accepted purposes and nationalities, the JSON Schema of `values` and `travelers`, the visa questionnaire, date and passport-validity constraints, arrival-card and insurance options, and the estimated price. Call after get_visa, before save_application.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        visaId: visaIdSchema,
        language: z
          .enum(FORM_LOCALES)
          .optional()
          .describe("Language of labels and questions (default en)."),
      }),
    },
    async ({ visaId, language }) =>
      run("get_application_form", { visaId, language }, options, async () =>
        toolResult(
          await callFormApi(
            config,
            "GET",
            `/api/agent/form/${encodeURIComponent(visaId)}?lang=${language ?? "en"}`
          )
        )
      )
  );

  server.registerTool(
    "save_application",
    {
      description:
        "Create (without applicationId) or update (with applicationId + resumeToken) a Visamundi visa application for the traveller. Returns applicationId, resumeToken, reference, the price and `missing`: the exact fields still required. Repeat until `missing` is empty, then call get_payment_link. Only use information given by the traveller. Consents and payment are always done by the traveller on the payment page.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        visaId: visaIdSchema,
        locale: z
          .enum(FORM_LOCALES)
          .describe("Language of the traveller: used for emails and the payment page."),
        applicationId: applicationIdSchema.optional(),
        resumeToken: resumeTokenSchema.optional(),
        values: valuesSchema.optional(),
        travelers: travelersSchema.optional(),
      }),
    },
    async ({ visaId, locale, applicationId, resumeToken, values, travelers }) => {
      const logged = { visaId, locale, applicationId };
      if (applicationId && !resumeToken) {
        return run("save_application", logged, options, async () => {
          throw new FormApiError(
            "resumeToken is required to update an application: pass the one returned by the first save_application call.",
            400
          );
        });
      }

      return run("save_application", logged, options, async () => {
        const patch = {
          ...(values ? { values } : {}),
          ...(travelers ? { travelers } : {}),
        };
        const body = applicationId
          ? await callFormApi(
              config,
              "PATCH",
              `/api/agent/applications/${encodeURIComponent(applicationId)}`,
              { body: patch, resumeToken }
            )
          : await callFormApi(config, "POST", "/api/agent/applications", {
              body: { visaId, locale, ...patch },
            });
        return toolResult(withNextStep(body, resumeToken));
      });
    }
  );

  server.registerTool(
    "get_payment_link",
    {
      description:
        "Get the Visamundi payment link for a complete application. Give this link to the traveller: they review the application, accept the terms and pay there. Also returns `estimatedDelivery` (null when unavailable): `latestDate` (YYYY-MM-DD) is an estimate, never a guarantee; always state it together with `condition`, and with `cappedExplanation` when `cappedFarTrip` is true (issuance deliberately scheduled closer to a distant trip). Fails with the list of missing fields if the application is incomplete.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        applicationId: applicationIdSchema,
        resumeToken: resumeTokenSchema,
      }),
    },
    async ({ applicationId, resumeToken }) =>
      run("get_payment_link", { applicationId }, options, async () =>
        toolResult(
          await callFormApi(
            config,
            "POST",
            `/api/agent/applications/${encodeURIComponent(applicationId)}/payment-link`,
            { resumeToken }
          )
        )
      )
  );
}
