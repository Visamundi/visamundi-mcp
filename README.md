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
- Partner tools: credential-scoped tools resolved from Supabase

The Worker uses Cloudflare Hyperdrive for Postgres access and `createMcpHandler` for stateless MCP transport.

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

## Notes

- `MCP_ALLOWED_HOSTS` can be set in `.dev.vars` or Cloudflare env vars to restrict accepted Host headers for custom domains.
- Public customs and vaccines calls are guarded so they only return data scoped to the requested country.
- `list_countries` is not exposed on the public route.
- MCP clients that only support local stdio can use `mcp-remote` against the deployed Worker URL.