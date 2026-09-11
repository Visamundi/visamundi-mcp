import { callTool, env, intEnv, runPool, summarize } from "./_client.mjs";

const baseUrl = env("MCP_BASE_URL");
if (!baseUrl) {
  throw new Error("Set MCP_BASE_URL to the staging public MCP endpoint.");
}

const apiKey = env("PUBLIC_MCP_KEY");
const startId = intEnv("START_ID", 1);
const endId = intEnv("END_ID", 100);
const concurrency = intEnv("CONCURRENCY", 5);
const language = env("LANGUAGE", "en");

const ids = Array.from({ length: Math.max(0, endId - startId + 1) }, (_, index) => {
  return startId + index;
});

const results = await runPool(ids, concurrency, (id) =>
  callTool(
    baseUrl,
    "get_visa",
    {
      id,
      language,
    },
    apiKey
  ).then((result) => ({ ...result, id }))
);

summarize("get_visa enumeration", results);

const found = results.filter((result) => result.ok).length;
console.log(`ids_checked=${ids.length} ids_with_success=${found}`);
