# Abuse simulation scripts

These scripts are for a staging or otherwise disposable public MCP deployment.
They are intentionally shaped like abuse traffic so you can verify throttling,
caching, redaction, and logging before opening the route more broadly.

## Environment

- `MCP_BASE_URL` - full public MCP endpoint, for example `https://staging.example.com/`
- `PUBLIC_MCP_KEY` - optional public API key if the route requires one

## Scripts

### 1. Audit public responses

Collect representative `list_visas`, `get_visa`, and `get_visa_requirements`
responses for manual review of public-field redaction.

```bash
MCP_BASE_URL="https://staging.example.com/" npm run abuse:audit
```

Pass:
- No token-like, credential, or internal fields appear in captured JSON
- `get_visa` does not expose fields you consider commercially sensitive

Fail:
- Any response contains secrets, internal references, or fields that should be
  partner-only

### 2. Enumerate `get_visa`

Probe how quickly sequential ID scraping is throttled.

```bash
MCP_BASE_URL="https://staging.example.com/" START_ID=1 END_ID=500 CONCURRENCY=5 npm run abuse:get-visa
```

Pass:
- `429` responses appear before the entire sweep completes at high rate
- Worker stays healthy and latency does not climb uncontrollably

Fail:
- Large sweeps complete without throttling
- Upstream starts failing before Worker-side protection activates

### 3. Requirements matrix

Simulate a scraper walking nationality x destination combinations.

```bash
MCP_BASE_URL="https://staging.example.com/" NATIONALITIES=FR,GB,US DESTINATIONS=TH,VN,IN CONCURRENCY=5 npm run abuse:requirements
```

Pass:
- Repeated patterns eventually hit route controls or key-level budgets
- Logs and analytics make the sweep obvious

Fail:
- High-volume matrices run unchecked
- No useful telemetry exists to detect the sweep

### 4. Sustained load

Drive steady `list_visas` traffic to verify cache efficiency and route
stability.

```bash
MCP_BASE_URL="https://staging.example.com/" DURATION_SECONDS=60 CONCURRENCY=10 npm run abuse:sustain
```

Pass:
- Worker responds mostly from cache after warm-up
- Error rate stays low and latency remains bounded

Fail:
- Cache hit rate stays poor on repeated requests
- Connect-side `429` / `503` errors rise quickly

## Suggested thresholds

- Public route baseline: alert if `429` or `5xx` exceeds 5% over 5 minutes
- Cache effectiveness: target at least 80% hit rate for repeated reads after warm-up
- `get_visa` enumeration: should trigger dedicated limiter well before 100 rapid sequential IDs
- Sustained load: p95 latency should stay within your normal public-route SLO

## Safety notes

- Use a staging Connect token where possible
- Keep rate-limit bindings enabled during these tests
- Do not run high-concurrency sweeps against production without explicit approval
