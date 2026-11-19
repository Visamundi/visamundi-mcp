# visamundi-mcp

[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.visamundi%2Fvisa-blue)](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.visamundi/visa)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Remote [MCP](https://modelcontextprotocol.io) server for travel entry requirements: **visa, vaccine and customs data** by nationality and destination, plus optional visa application filing. Built by [Visamundi](https://www.visamundi.io) as a Cloudflare Worker.

- **Endpoint:** `https://mcp.visamundi.io/` (streamable HTTP, no login for lookups)
- **Registry name:** `io.visamundi/visa` ([official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.visamundi/visa))
- **Lookups** are read-only and rate-limited. The application tools only create a draft and return a payment link: the agent never pays and never accepts terms.

## Connect

Claude Code:

```bash
claude mcp add --transport http visamundi https://mcp.visamundi.io/
```

Any MCP client that supports remote servers (JSON config):

```json
{
  "mcpServers": {
    "visamundi": { "type": "http", "url": "https://mcp.visamundi.io/" }
  }
}
```

Example questions: *"Do I need a visa for Kenya as a French citizen?"*, *"What vaccines and customs rules apply for Thailand?"*, *"Start my Kenya e-visa."*

The rest of this README describes the server's internals and how to run your own instance.

## What it serves

- Public MCP route: `/`
- Private MCP route: `/partners`
- Public tools:
  - `list_visas`
  - `get_visa`
  - `get_visa_requirements`
  - `get_vaccines`
  - `get_customs`
- Public application tools (only when `FORM_AGENT_API_URL` and the `FORM_AGENT_API_KEY` secret are set):
  - `get_application_form` — form schema, constraints and estimated price for one visa
  - `save_application` — create / update a B2C application (returns `missing` until complete)
  - `get_payment_link` — Visamundi payment link for the traveller (the agent never pays nor accepts terms)
  - Business rules live in form-visamundi-next `/api/agent/*`; the Worker only relays calls with `X-Agent-Key`, `X-Agent-Client-Ip` (from `CF-Connecting-IP`) and `X-Resume-Token`. Workflow doc: `visamundi://docs/submit-visa-application` and prompt `submit-visa-application`.
  - form-visamundi-next also relays these public tools to in-browser agents through a WebMCP bridge (CORS is open on `/`).
- Partner tools (route `/partners`, bearer auth; only tools allowed for the credential are exposed):
  - `list_countries`
  - `get_company`
  - `list_travel_groups`
  - `get_travel_group`
  - `list_referred_applications`
  - `get_referred_application`
  - `list_invoices`
  - `get_processing_load`
  - `get_delivery_window`
  - `get_affiliate_stats`
  - Partner credentials may also include any of the public connect tools above.
  - If a documented partner tool is missing for an agent, it may be disabled on the credential's Visamundi partner MCP access page; the server instructions include the enabled tool list for that connection.

The Worker uses Cloudflare Hyperdrive for Postgres access and `createMcpHandler` for stateless MCP transport.

Agents can also fetch MCP resources and prompts from the server:
- Resources: tool guides, country-code reference, and example workflows (`visamundi://docs/...`)
- Prompts: reusable workflows such as `check-visa-requirements` and `review-travel-group`
- Server instructions: route-specific guidance injected by MCP clients that support them

## Install

```bash
npm install
```

## Local Cloudflare development

1. Copy local Worker secrets:

```bash
cp .dev.vars.example .dev.vars
```

2. Set `CONNECT_API_MCP_KEY` in `.dev.vars`.

3. Create a Hyperdrive binding in Cloudflare and replace the placeholder ID in `wrangler.jsonc`:

```bash
wrangler hyperdrive create visamundi-mcp --connection-string="$MCP_SUPABASE_DB_URL"
```

4. Run the Worker:

```bash
npm run dev:worker
```

Local MCP endpoints:

- Public: `http://localhost:8788/`
- Private: `http://localhost:8788/partners`

## Local stdio mode

You can still run the shared MCP tool definitions over stdio for local-only clients:

```bash
cp .env.example .env
npm run build
npm run start
```

Set `MCP_SUPABASE_DB_URL` in `.env` only if you want DB-backed partner tools in stdio mode.

## Local wrangler dev

```bash
npx wrangler dev --remote
```

## Deploy to Cloudflare

Set Worker secrets:

```bash
wrangler secret put CONNECT_API_MCP_KEY
```

Optional:

```bash
wrangler secret put VISAMUNDI_TOKEN
# Enables the application tools; same value as AGENT_API_KEY on form-visamundi-next.
wrangler secret put FORM_AGENT_API_KEY
```

Then deploy:

```bash
npm run deploy
```

## Public route hardening

The public MCP route at `/` spends your shared Connect API token and, when the
application tools are enabled, writes draft applications anonymously. The Worker now supports the following abuse controls:

- Optional public API keys on `/` via `Authorization: Bearer <key>` or
  `X-MCP-Key`
- Cloudflare rate-limit bindings for the whole public route, a tighter
  `get_visa` budget and `APPLICATION_WRITE_RATE_LIMITER` for `save_application`
  / `get_payment_link` (enabled in `wrangler.jsonc`)
- A daily cap of 200 reference lookups per anonymous client (Paris day),
  counted by the `PublicDailyQuota` Durable Object; application tools and
  keyed clients are not counted. Past the cap, calls get a tool error that
  points to the form and to API keys.
- Compact, traveller-oriented public results (`src/publicCompact.ts`): no
  envelope, nationality lists, entry points or long HTML texts. The full
  structured data stays behind the keyed REST API.
- Response caching for public Connect-backed reads
- Recursive redaction of token-like and internal fields in public responses
- Structured audit logs for each public tool call
- Optional Analytics Engine events through the `MCP_ANALYTICS` binding
- A short circuit breaker when the upstream Connect API starts returning `429`
  or `503`

Recommended production posture:

1. Set `ALLOW_ANONYMOUS_PUBLIC=false`
2. Set `PUBLIC_MCP_REQUIRE_API_KEY=true`
3. Bind `PUBLIC_MCP_KEYS` to a KV namespace of hashed public keys
4. Keep `PUBLIC_ROUTE_RATE_LIMITER`, `PUBLIC_GET_VISA_RATE_LIMITER` and
   `APPLICATION_WRITE_RATE_LIMITER` enabled
5. Set `MCP_ALLOWED_HOSTS` for the exact production hostname
6. Bind `MCP_ANALYTICS` if you want queryable abuse metrics

The rate limiters are enabled in `wrangler.jsonc`; the KV and Analytics Engine
bindings stay commented out until account-specific IDs are set. Requiring a
public API key would hide the route from the browser WebMCP bridge (a key
cannot stay secret in a browser).

### Public API keys

Store public keys in KV by SHA-256 hash. Example value:

```json
{"id":"demo-client"}
```

Example hash command:

```bash
node -e 'console.log(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "replace-me"
```


## Notes

- `MCP_ALLOWED_HOSTS` can be set in `.dev.vars` or Cloudflare env vars to restrict accepted Host headers for custom domains.
- Public customs and vaccines calls are guarded so they only return data scoped to the requested country.
- `list_countries` is not exposed on the public route.
- MCP clients that only support local stdio can use `mcp-remote` against the deployed Worker URL.
- Public route acceptable use should forbid scraping, bulk mirroring, and unattended high-volume harvesting.