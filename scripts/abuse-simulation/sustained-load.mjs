import { callTool, env, intEnv, summarize } from "./_client.mjs";

const baseUrl = env("MCP_BASE_URL");
if (!baseUrl) {
  throw new Error("Set MCP_BASE_URL to the staging public MCP endpoint.");
}

const apiKey = env("PUBLIC_MCP_KEY");
const durationSeconds = intEnv("DURATION_SECONDS", 60);
const concurrency = intEnv("CONCURRENCY", 10);
const destination = env("DESTINATION", "TH");
const nationality = env("NATIONALITY", "FR");
const language = env("LANGUAGE", "en");

const endAt = Date.now() + durationSeconds * 1000;
const results = [];

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (Date.now() < endAt) {
      results.push(
        await callTool(
          baseUrl,
          "list_visas",
          {
            destination,
            nationality,
            language,
          },
          apiKey
        )
      );
    }
  })
);

summarize("sustained list_visas load", results);
console.log(`duration_seconds=${durationSeconds} concurrency=${concurrency}`);
