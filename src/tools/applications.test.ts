import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  APPLICATION_TOOL_NAMES,
  registerApplicationTools,
  type FormAgentApiConfig,
} from "./applications.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

function setup(fetchImpl: typeof fetch, overrides: Partial<FormAgentApiConfig> = {}) {
  const tools = new Map<string, { config: { annotations?: Record<string, unknown> }; handler: Handler }>();
  const server = {
    registerTool(name: string, config: never, handler: Handler) {
      tools.set(name, { config, handler });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as unknown as Pick<McpServer, "registerTool">;
  const onToolCall = vi.fn();
  registerApplicationTools(
    server,
    {
      baseUrl: "https://form.test/",
      apiKey: "k",
      clientIp: "203.0.113.9",
      fetchImpl,
      ...overrides,
    },
    { onToolCall }
  );
  return { tools, onToolCall };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("application tools", () => {
  it("registers the three tools with write annotations on the write tools", () => {
    const { tools } = setup(vi.fn());
    expect([...tools.keys()].sort()).toEqual([...APPLICATION_TOOL_NAMES].sort());
    expect(tools.get("get_application_form")?.config.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(tools.get("save_application")?.config.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(tools.get("get_payment_link")?.config.annotations).toMatchObject({
      readOnlyHint: false,
    });
  });

  it("get_application_form calls the form API with the agent key and client IP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { visaId: "42629" }));
    const { tools } = setup(fetchImpl);

    const res = await tools.get("get_application_form")!.handler({
      visaId: 42629,
      language: "fr",
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://form.test/api/agent/form/42629?lang=fr");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Agent-Key"]).toBe("k");
    expect(init.headers["X-Agent-Client-Ip"]).toBe("203.0.113.9");
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toEqual({ visaId: "42629" });
  });

  it("save_application creates with POST when no applicationId is given", async () => {
    const created = {
      applicationId: "app-1",
      resumeToken: "tok-1",
      reference: "VM-1",
      missing: [
        { path: "travelers[0].passportNumber", reason: "required" },
        { path: "travelers[0].nationality", reason: "not_allowed", hint: "alpha-3, e.g. FRA" },
      ],
      pricing: { totalEur: 60 },
    };
    const fetchImpl = vi.fn().mockResolvedValue(json(200, created));
    const { tools } = setup(fetchImpl);

    const res = await tools.get("save_application")!.handler({
      visaId: "42629",
      locale: "fr",
      values: { contactEmail: "a@b.co" },
      travelers: [{ firstName: "Jean" }],
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://form.test/api/agent/applications");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      visaId: "42629",
      locale: "fr",
      values: { contactEmail: "a@b.co" },
      travelers: [{ firstName: "Jean" }],
    });
    expect(res.isError).toBeUndefined();
    // The resume token must survive: the agent needs it for the next calls.
    expect(res.structuredContent).toMatchObject({ resumeToken: "tok-1", complete: false });
    expect(res.content[0].text).toContain("travelers[0].passportNumber");
    // Hints (allowed values, min dates, formats) must reach the agent.
    expect(res.structuredContent?.nextStep).toContain(
      "travelers[0].nationality: not_allowed (alpha-3, e.g. FRA)"
    );
  });

  it("save_application updates with PATCH and the resume token header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, { applicationId: "app-1", missing: [], pricing: null })
    );
    const { tools } = setup(fetchImpl);

    const res = await tools.get("save_application")!.handler({
      visaId: "42629",
      locale: "fr",
      applicationId: "app-1",
      resumeToken: "tok-1",
      values: { arrivalDate: "2026-12-15" },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://form.test/api/agent/applications/app-1");
    expect(init.method).toBe("PATCH");
    expect(init.headers["X-Resume-Token"]).toBe("tok-1");
    expect(JSON.parse(init.body)).toEqual({ values: { arrivalDate: "2026-12-15" } });
    expect(res.structuredContent).toMatchObject({ complete: true, resumeToken: "tok-1" });
  });

  it("save_application forwards the partner affiliateCode on create and update", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { applicationId: "app-1", missing: [] }));
    const { tools } = setup(fetchImpl);
    const save = tools.get("save_application")!;

    await save.handler({ visaId: "42629", locale: "fr", affiliateCode: "ag404" });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      visaId: "42629",
      locale: "fr",
      affiliateCode: "ag404",
    });

    await save.handler({
      visaId: "42629",
      locale: "fr",
      applicationId: "app-1",
      resumeToken: "tok-1",
      affiliateCode: "ag404",
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ affiliateCode: "ag404" });

    const schema = (save.config as { inputSchema?: unknown }).inputSchema as { shape: Record<string, { safeParse(v: unknown): { success: boolean } }> };
    expect(schema.shape.affiliateCode.safeParse("AG404").success).toBe(true);
    expect(schema.shape.affiliateCode.safeParse("promo10").success).toBe(false);
  });

  it("save_application refuses an update without resumeToken", async () => {
    const fetchImpl = vi.fn();
    const { tools } = setup(fetchImpl);

    const res = await tools.get("save_application")!.handler({
      visaId: "42629",
      locale: "fr",
      applicationId: "app-1",
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("resumeToken");
  });

  it("get_payment_link returns the link", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, { url: "https://form.test/fr/reprendre/tok-1?step=recapitulatif", total: 60, currency: "EUR", missing: [] })
    );
    const { tools } = setup(fetchImpl);

    const res = await tools.get("get_payment_link")!.handler({
      applicationId: "app-1",
      resumeToken: "tok-1",
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://form.test/api/agent/applications/app-1/payment-link");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Resume-Token"]).toBe("tok-1");
    expect(res.structuredContent).toMatchObject({ total: 60, currency: "EUR" });
  });

  it.each([
    [422, { error: "incomplete", missing: [{ path: "values.billingAddress.city", reason: "required" }] }, "values.billingAddress.city"],
    [400, { error: "invalid_input", missing: [{ path: "values.arrivalDate", reason: "format" }] }, "values.arrivalDate"],
    [422, { error: "unsupported", detail: "pack" }, "cannot be submitted"],
    [409, { error: "not_payable", status: "paid" }, "paid"],
    [404, { error: "not found" }, "not found"],
    [401, { error: "unauthorized" }, "resumeToken"],
    [429, { error: "rate_limited" }, "Too many"],
    [503, { error: "agent_api_disabled" }, "unavailable"],
  ])("maps HTTP %s to an actionable tool error", async (status, body, expected) => {
    const fetchImpl = vi.fn().mockResolvedValue(json(status, body));
    const { tools, onToolCall } = setup(fetchImpl);

    const res = await tools.get("get_payment_link")!.handler({
      applicationId: "app-1",
      resumeToken: "tok-1",
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain(expected);
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "get_payment_link", success: false, upstreamStatus: status })
    );
  });

  it("hides network and 5xx details from the agent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("pg error: secret", { status: 500 }));
    const { tools } = setup(fetchImpl);

    const res = await tools.get("get_application_form")!.handler({ visaId: "1" });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toContain("secret");
  });

  it("logs successful calls without arguments leaking into the event name", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { ok: true }));
    const { tools, onToolCall } = setup(fetchImpl);

    await tools.get("get_application_form")!.handler({ visaId: "1" });

    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "get_application_form", success: true, upstreamStatus: 200 })
    );
  });
});
