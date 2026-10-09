/**
 * Language-model construction for the agent.
 *
 * The provider is OpenAI-compatible, so the AI SDK's `createOpenAICompatible`
 * is used directly. Swapping providers later is a configuration change
 * (`AGENT_BASE_URL` + `AGENT_MODEL`), not a code change.
 *
 * The API key is passed straight to the provider. It is never stored, logged,
 * or returned.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { AgentConfig } from "./config";

/**
 * Build the chat model for the agent from validated configuration.
 *
 * `AGENT_BASE_URL` must be the OpenAI-compatible endpoint (for Experiential
 * Labs: https://api.experientiallabs.ai/v1).
 */
export function createAgentModel(config: AgentConfig): LanguageModel {
  const provider = createOpenAICompatible({
    name: "experiential-labs",
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  return provider(config.model);
}
