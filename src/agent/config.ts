/**
 * AI agent configuration (Phase 5).
 *
 * The agent talks to an OpenAI-compatible chat endpoint. Experiential Labs
 * (https://platform.experientiallabs.ai) is an OpenAI-compatible gateway/router,
 * so the AI SDK's OpenAI-compatible provider is used directly against its
 * `/v1` base URL.
 *
 * SECRETS: the API key is read from the local environment only. This module
 * NEVER logs, returns, or embeds the key in an error message — it reports the
 * NAMES of missing variables so the operator can fix `.env` without the value
 * ever leaving their machine.
 */

import process from "node:process";

/** Default gateway endpoint (overridable via `AGENT_BASE_URL`). */
export const DEFAULT_AGENT_BASE_URL = "https://api.experientiallabs.ai/v1";

/** Default `agentId` recorded on proposed purchases. */
export const DEFAULT_AGENT_ID = "ai-agent";

/** The endpoint plus the credential needed to reach it. */
export interface AgentEndpoint {
  baseUrl: string;
  apiKey: string;
}

/** Full agent configuration: where to call, with what key, and which model. */
export interface AgentConfig extends AgentEndpoint {
  /** Provider model identifier (e.g. a public alias from the provider). */
  model: string;
  /** Value recorded as the proposing `agentId` on every request. */
  agentId: string;
}

/** Thrown when required configuration is missing. Messages contain names, not values. */
export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}

function trimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Read the endpoint and key. Only `AGENT_API_KEY` is required. */
export function readAgentEndpoint(env: NodeJS.ProcessEnv = process.env): AgentEndpoint {
  const baseUrl = trimmed(env.AGENT_BASE_URL) || DEFAULT_AGENT_BASE_URL;
  const apiKey = trimmed(env.AGENT_API_KEY);
  if (!apiKey) {
    throw new AgentConfigError(
      "AGENT_API_KEY is not set. Add it to your local `.env` (see `.env.example`). " +
        "Never paste the key into code, chat, screenshots, or commits.",
    );
  }
  return { baseUrl, apiKey };
}

/** Read the full config. Requires `AGENT_MODEL` in addition to the key. */
export function readAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const { baseUrl, apiKey } = readAgentEndpoint(env);
  const model = trimmed(env.AGENT_MODEL);
  if (!model) {
    throw new AgentConfigError(
      "AGENT_MODEL is not set. Copy a model name from your provider's Models page " +
        "into `AGENT_MODEL` in `.env`, or run `npm run agent:models` to list them.",
    );
  }
  const agentId = trimmed(env.AGENT_ID) || DEFAULT_AGENT_ID;
  return { baseUrl, apiKey, model, agentId };
}
