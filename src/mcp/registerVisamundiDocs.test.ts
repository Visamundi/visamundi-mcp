import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  registerPartnerVisamundiDocs,
  registerPublicVisamundiDocs,
} from "./registerVisamundiDocs.js";

type DocServer = Pick<McpServer, "registerResource" | "registerPrompt">;

function createDocServerMock() {
  const resources = new Map<string, unknown>();
  const prompts = new Map<string, unknown>();

  const server = {
    registerResource(
      name: string,
      uri: string,
      config: unknown,
      readCallback: unknown
    ) {
      resources.set(name, { uri, config, readCallback });
      return {} as ReturnType<McpServer["registerResource"]>;
    },
    registerPrompt(name: string, config: unknown, callback: unknown) {
      prompts.set(name, { config, callback });
      return {} as ReturnType<McpServer["registerPrompt"]>;
    },
  } as unknown as DocServer;

  return {
    resources,
    prompts,
    server,
  };
}

describe("registerVisamundiDocs", () => {
  it("registers public docs resources and prompts", () => {
    const { server, resources, prompts } = createDocServerMock();

    registerPublicVisamundiDocs(server);

    expect([...resources.keys()].sort()).toEqual([
      "country-codes-guide",
      "public-tool-guide",
      "public-workflows",
    ]);
    expect([...prompts.keys()].sort()).toEqual([
      "check-visa-requirements",
      "prepare-trip-briefing",
    ]);
    expect(resources.get("public-tool-guide")).toMatchObject({
      uri: "visamundi://docs/public-tool-guide",
    });
  });

  it("registers partner docs resources and prompts", () => {
    const { server, resources, prompts } = createDocServerMock();

    registerPartnerVisamundiDocs(server);

    expect([...resources.keys()].sort()).toEqual([
      "country-codes-guide",
      "partner-tool-guide",
      "partner-workflows",
    ]);
    expect([...prompts.keys()].sort()).toEqual(["review-travel-group"]);
  });

  it("returns markdown from a registered public resource", async () => {
    const { server, resources } = createDocServerMock();
    registerPublicVisamundiDocs(server);

    const entry = resources.get("country-codes-guide") as {
      readCallback: (uri: URL) => Promise<{ contents: Array<{ text: string }> }>;
    };

    const result = await entry.readCallback(new URL("visamundi://docs/country-codes"));

    expect(result.contents[0]?.text).toContain("ISO 3166-1");
  });
});
