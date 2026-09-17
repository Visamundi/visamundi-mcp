# visamundi-mcp

Cloudflare Worker MCP server for Visamundi public visa data and partner-scoped tools.

## What it serves

- Public MCP route: `/`
- Private MCP route: `/partners`
- Public tools:
  - `list_visas`
  - `get_visa`
  - `get_visa_requirements`
  - `get_vaccines`
  - `get_customs`
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
```

Then deploy:

```bash
npm run deploy
```

## Public route hardening

The public MCP route at `/` is read-only, but it still spends your shared
Connect API token. The Worker now supports the following abuse controls:

- Optional public API keys on `/` via `Authorization: Bearer <key>` or
  `X-MCP-Key`
- Optional Cloudflare rate-limit bindings for the whole public route and a
  tighter `get_visa` budget
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
4. Enable `PUBLIC_ROUTE_RATE_LIMITER` and `PUBLIC_GET_VISA_RATE_LIMITER`
5. Set `MCP_ALLOWED_HOSTS` for the exact production hostname
6. Bind `MCP_ANALYTICS` if you want queryable abuse metrics

The repository keeps these bindings commented out in `wrangler.jsonc` so you
can replace them with account-specific IDs before enabling them.

### Public API keys

Store public keys in KV by SHA-256 hash. Example value:

```json
{"id":"demo-client"}
```

Example hash command:

```bash
node -e 'console.log(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "replace-me"
```

### Abuse simulation scripts

The `scripts/abuse-simulation/` directory contains staging-only probes for:

- Response auditing for `list_visas`, `get_visa`, and `get_visa_requirements`
- Sequential `get_visa` enumeration
- `get_visa_requirements` matrix sweeps
- Sustained public-route load tests

Set `MCP_BASE_URL` to a staging deployment before running them. Optional
`PUBLIC_MCP_KEY` is supported if the public route requires a key.

```bash
MCP_BASE_URL="https://staging.example.com/" npm run abuse:audit
MCP_BASE_URL="https://staging.example.com/" START_ID=1 END_ID=250 npm run abuse:get-visa
MCP_BASE_URL="https://staging.example.com/" NATIONALITIES=FR,GB,US DESTINATIONS=TH,VN,IN npm run abuse:requirements
MCP_BASE_URL="https://staging.example.com/" DURATION_SECONDS=60 CONCURRENCY=10 npm run abuse:sustain
```

Do not point these scripts at production unless you explicitly want to validate
enforcement thresholds there.

## Notes

- `MCP_ALLOWED_HOSTS` can be set in `.dev.vars` or Cloudflare env vars to restrict accepted Host headers for custom domains.
- Public customs and vaccines calls are guarded so they only return data scoped to the requested country.
- `list_countries` is not exposed on the public route.
- MCP clients that only support local stdio can use `mcp-remote` against the deployed Worker URL.
- Public route acceptable use should forbid scraping, bulk mirroring, and unattended high-volume harvesting.