/**
 * List the models available from the configured OpenAI-compatible endpoint.
 *
 * This exists so you never have to paste your API key anywhere: it reads the
 * key from your local `.env`, calls `GET {AGENT_BASE_URL}/models`, and prints
 * the model ids. Copy one into `AGENT_MODEL`.
 *
 * If the provider does not expose `/models`, the command says so and you can
 * read the id from the provider's Models page instead.
 *
 * Run with:  npm run agent:models
 */

import { existsSync } from "node:fs";
import process from "node:process";

import { AgentConfigError, readAgentEndpoint } from "../src/agent";

function loadLocalEnv(): void {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
}

/** Extract model ids from OpenAI-style `{ data: [{ id }] }` or a bare array. */
function extractModelIds(body: unknown): string[] {
  const ids: string[] = [];

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const data = (body as { data?: unknown }).data;
    if (Array.isArray(data)) {
      for (const item of data) {
        const id = item && typeof item === "object" ? (item as { id?: unknown }).id : undefined;
        if (typeof id === "string") ids.push(id);
      }
    }
  }

  if (ids.length === 0 && Array.isArray(body)) {
    for (const item of body) {
      if (typeof item === "string") ids.push(item);
      else if (item && typeof item === "object") {
        const id = (item as { id?: unknown }).id;
        if (typeof id === "string") ids.push(id);
      }
    }
  }

  return ids;
}

async function main(): Promise<void> {
  loadLocalEnv();

  const { baseUrl, apiKey } = readAgentEndpoint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.log(
        `The provider returned HTTP ${response.status}. ` +
          "Check AGENT_BASE_URL and AGENT_API_KEY in `.env`, or read the model " +
          "name from the provider's Models page.",
      );
      process.exitCode = 1;
      return;
    }

    const ids = extractModelIds(await response.json());
    if (ids.length === 0) {
      console.log(
        "The provider returned no model ids. Read the model name from the provider's Models page.",
      );
      return;
    }

    console.log("Available models (copy one into AGENT_MODEL in `.env`):");
    for (const id of ids) {
      console.log(`  ${id}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

main().catch((error: unknown) => {
  if (error instanceof AgentConfigError) {
    console.error(`Configuration needed: ${error.message}`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Could not list models: ${message}`);
    console.error("(No credentials are shown.)");
  }
  process.exitCode = 1;
});
