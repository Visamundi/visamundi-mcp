const acceptHeader = "application/json, text/event-stream";

export function env(name, fallback = undefined) {
  return process.env[name] ?? fallback;
}

export function intEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export function listEnv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createHeaders(apiKey) {
  const headers = {
    accept: acceptHeader,
    "content-type": "application/json",
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export async function callTool(baseUrl, toolName, args = {}, apiKey) {
  const startedAt = Date.now();
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: createHeaders(apiKey),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${toolName}-${startedAt}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }

  return {
    body,
    durationMs: Date.now() - startedAt,
    ok: response.ok,
    status: response.status,
  };
}

export async function runPool(items, concurrency, worker) {
  const queue = [...items];
  const results = [];

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) {
        return;
      }

      results.push(await worker(item));
    }
  });

  await Promise.all(runners);
  return results;
}

export function summarize(label, results) {
  const total = results.length;
  const successful = results.filter((result) => result.ok).length;
  const statuses = Object.groupBy(results, (result) => String(result.status));
  const averageDurationMs =
    total === 0
      ? 0
      : Math.round(
          results.reduce((sum, result) => sum + result.durationMs, 0) / total
        );

  console.log(`\n${label}`);
  console.log(`total=${total} successful=${successful} avg_ms=${averageDurationMs}`);
  for (const [status, entries] of Object.entries(statuses)) {
    console.log(`status_${status}=${entries?.length ?? 0}`);
  }
}
