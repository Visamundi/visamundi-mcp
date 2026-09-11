import { mkdir, writeFile } from "node:fs/promises";
import { callTool, env } from "./_client.mjs";

const baseUrl = env("MCP_BASE_URL");
if (!baseUrl) {
  throw new Error("Set MCP_BASE_URL to the staging public MCP endpoint.");
}

const apiKey = env("PUBLIC_MCP_KEY");
const outputDir = env("AUDIT_OUTPUT_DIR", "scripts/abuse-simulation/output");

const samples = [
  {
    fileName: "list_visas.json",
    toolName: "list_visas",
    args: {
      destination: env("AUDIT_DESTINATION", "TH"),
      nationality: env("AUDIT_NATIONALITY", "FR"),
      reason: env("AUDIT_REASON", "tourism"),
      language: env("AUDIT_LANGUAGE", "en"),
    },
  },
  {
    fileName: "get_visa.json",
    toolName: "get_visa",
    args: {
      id: Number.parseInt(env("AUDIT_VISA_ID", "1"), 10),
      language: env("AUDIT_LANGUAGE", "en"),
    },
  },
  {
    fileName: "get_visa_requirements.json",
    toolName: "get_visa_requirements",
    args: {
      destination: env("AUDIT_DESTINATION", "TH"),
      nationality: env("AUDIT_NATIONALITY", "FR"),
      language: env("AUDIT_LANGUAGE", "en"),
    },
  },
];

await mkdir(outputDir, { recursive: true });

for (const sample of samples) {
  const result = await callTool(baseUrl, sample.toolName, sample.args, apiKey);
  const outputPath = `${outputDir}/${sample.fileName}`;
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(`${sample.toolName} -> ${outputPath} (${result.status})`);
}
