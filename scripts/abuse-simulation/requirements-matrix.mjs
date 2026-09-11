import { callTool, env, intEnv, listEnv, runPool, summarize } from "./_client.mjs";

const baseUrl = env("MCP_BASE_URL");
if (!baseUrl) {
  throw new Error("Set MCP_BASE_URL to the staging public MCP endpoint.");
}

const apiKey = env("PUBLIC_MCP_KEY");
const nationalities = listEnv("NATIONALITIES", ["FR", "GB", "US", "CA", "DE"]);
const destinations = listEnv("DESTINATIONS", ["TH", "VN", "IN", "EG", "AU"]);
const concurrency = intEnv("CONCURRENCY", 5);
const language = env("LANGUAGE", "en");

const matrix = [];
for (const nationality of nationalities) {
  for (const destination of destinations) {
    matrix.push({ nationality, destination });
  }
}

const results = await runPool(matrix, concurrency, ({ nationality, destination }) =>
  callTool(
    baseUrl,
    "get_visa_requirements",
    {
      nationality,
      destination,
      language,
    },
    apiKey
  ).then((result) => ({
    ...result,
    destination,
    nationality,
  }))
);

summarize("get_visa_requirements matrix", results);
console.log(`pairs_checked=${matrix.length}`);
