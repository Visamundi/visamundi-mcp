import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  COUNTRY_CODES_GUIDE,
  PARTNER_SERVER_INSTRUCTIONS,
  PARTNER_TOOL_GUIDE,
  PARTNER_WORKFLOWS,
  PUBLIC_SERVER_INSTRUCTIONS,
  PUBLIC_TOOL_GUIDE,
  PUBLIC_WORKFLOWS,
} from "./docs/content.js";

type DocServer = Pick<McpServer, "registerResource" | "registerPrompt">;

function registerMarkdownResource(
  server: DocServer,
  name: string,
  uri: string,
  title: string,
  description: string,
  text: string
): void {
  server.registerResource(
    name,
    uri,
    {
      title,
      description,
      mimeType: "text/markdown",
    },
    async (resourceUri) => ({
      contents: [
        {
          uri: resourceUri.href,
          mimeType: "text/markdown",
          text,
        },
      ],
    })
  );
}

export function registerPublicVisamundiDocs(server: DocServer): void {
  registerMarkdownResource(
    server,
    "public-tool-guide",
    "visamundi://docs/public-tool-guide",
    "Public tool guide",
    "When to use each public Visamundi MCP tool.",
    PUBLIC_TOOL_GUIDE
  );
  registerMarkdownResource(
    server,
    "country-codes-guide",
    "visamundi://docs/country-codes",
    "Country and language codes",
    "Accepted country and language code formats for Visamundi MCP tools.",
    COUNTRY_CODES_GUIDE
  );
  registerMarkdownResource(
    server,
    "public-workflows",
    "visamundi://docs/public-workflows",
    "Public workflows",
    "Recommended public-route tool sequences for common travel questions.",
    PUBLIC_WORKFLOWS
  );

  server.registerPrompt(
    "check-visa-requirements",
    {
      title: "Check visa requirements",
      description:
        "Structured workflow for checking whether a traveller needs a visa.",
      argsSchema: z.object({
        nationality: z
          .string()
          .describe("Traveller nationality ISO code, for example CN or CHN."),
        destination: z
          .string()
          .describe("Destination country ISO code, for example AF or AFG."),
        language: z
          .string()
          .optional()
          .describe("Optional ISO 639-1 language code such as en or fr."),
      }),
    },
    ({ nationality, destination, language }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Check visa requirements for this trip.",
              `Nationality: ${nationality}`,
              `Destination: ${destination}`,
              language ? `Preferred language: ${language}` : null,
              "Start with get_visa_requirements. If product options are useful, follow with list_visas.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "prepare-trip-briefing",
    {
      title: "Prepare trip briefing",
      description:
        "Gather visa, vaccine, and customs information for a destination.",
      argsSchema: z.object({
        nationality: z.string().describe("Traveller nationality ISO code."),
        destination: z.string().describe("Destination country ISO code."),
        language: z.string().optional(),
      }),
    },
    ({ nationality, destination, language }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Prepare a concise trip briefing.",
              `Nationality: ${nationality}`,
              `Destination: ${destination}`,
              language ? `Preferred language: ${language}` : null,
              "Use get_visa_requirements, get_vaccines, and get_customs as needed.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );
}

export function registerPartnerVisamundiDocs(server: DocServer): void {
  registerMarkdownResource(
    server,
    "partner-tool-guide",
    "visamundi://docs/partner-tool-guide",
    "Partner tool guide",
    "When to use each partner Visamundi MCP tool.",
    PARTNER_TOOL_GUIDE
  );
  registerMarkdownResource(
    server,
    "country-codes-guide",
    "visamundi://docs/country-codes",
    "Country and language codes",
    "Accepted country and language code formats for Visamundi MCP tools.",
    COUNTRY_CODES_GUIDE
  );
  registerMarkdownResource(
    server,
    "partner-workflows",
    "visamundi://docs/partner-workflows",
    "Partner workflows",
    "Recommended partner-route tool sequences for operations and reporting.",
    PARTNER_WORKFLOWS
  );

  server.registerPrompt(
    "review-travel-group",
    {
      title: "Review travel group",
      description:
        "Review one managed B2B travel group and its operational timing.",
      argsSchema: z.object({
        travel_group_id: z
          .string()
          .uuid()
          .describe("Travel group UUID from list_travel_groups."),
      }),
    },
    ({ travel_group_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Review this travel group for the partner.",
              `travel_group_id: ${travel_group_id}`,
              "Use get_travel_group first. Use get_delivery_window if timing is relevant.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}

export { PUBLIC_SERVER_INSTRUCTIONS, PARTNER_SERVER_INSTRUCTIONS };
