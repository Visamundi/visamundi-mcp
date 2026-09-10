# visamundi-mcp

## Setup

```bash
cp .env.example .env
# Set CONNECT_API_MCP_KEY (and MCP_SUPABASE_DB_URL for /partners)
npm i
npm run build
```

## Run (HTTP) in local

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run start:http
```

## Run (stdio, for Cursor) in local

```bash
npm run start
```