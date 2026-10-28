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

/**
 * Default fallback gateway endpoint (overridable via `AGENT_BASE_URL_2`).
 * The Bitget hackathon gateway serves Qwen behind an OpenAI-compatible
 * surface; it is the recorded backup while the primary key is low on
 * credit (owner decision, 28 oct 2026).
 */
export const DEFAULT_AGENT_FALLBACK_BASE_URL = "https://hackathon.bitgetops.com/v1";

/** Default `agentId` recorded on proposed purchases. */
export const DEFAULT_AGENT_ID = "ai-agent";

/** The endpoint plus the credential needed to reach it. */
export interface AgentEndpoint {
  baseUrl: string;
  apiKey: string;
}

/** A backup endpoint plus the model to run there. */
export interface AgentFallbackConfig extends AgentEndpoint {
  model: string;
}

/** Full agent configuration: where to call, with what key, and which model. */
export interface AgentConfig extends AgentEndpoint {
  /** Provider model identifier (e.g. a public alias from the provider). */
  model: string;
  /** Value recorded as the proposing `agentId` on every request. */
  agentId: string;
  /**
   * Optional second provider, tried only when a run on the primary fails
   * with enough of the hard clock left to answer (28 oct 2026). Absent when
   * `AGENT_API_KEY_2` is unset; the app behaves exactly as before then.
   */
  fallback?: AgentFallbackConfig;
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

/**
 * Read the optional fallback provider (28 oct 2026). Returns undefined when
 * `AGENT_API_KEY_2` is unset, so the whole feature is env-gated and the app
 * behaves exactly as before without it. When the key IS set, the fallback
 * model name is required: failing fast at config time beats discovering a
 * half-configured backup mid-run. Messages name variables, never values.
 */
export function readAgentFallback(
  env: NodeJS.ProcessEnv = process.env,
): AgentFallbackConfig | undefined {
  const apiKey = trimmed(env.AGENT_API_KEY_2);
  if (!apiKey) return undefined;
  const model = trimmed(env.AGENT_MODEL_2);
  if (!model) {
    throw new AgentConfigError(
      "AGENT_API_KEY_2 is set but AGENT_MODEL_2 is not. Add the fallback model " +
        "name to your local `.env` (see `.env.example`), or remove " +
        "AGENT_API_KEY_2 to run without a fallback. Never paste keys into " +
        "code, chat, screenshots, or commits.",
    );
  }
  const baseUrl = trimmed(env.AGENT_BASE_URL_2) || DEFAULT_AGENT_FALLBACK_BASE_URL;
  return { baseUrl, apiKey, model };
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
  const fallback = readAgentFallback(env);
  return fallback ? { baseUrl, apiKey, model, agentId, fallback } : { baseUrl, apiKey, model, agentId };
}
