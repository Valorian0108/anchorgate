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

/** Everything needed to build one chat model: where, with what key, which model. */
export interface AgentModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Build a chat model from validated configuration. Works for the primary
 * provider and, identically, for the optional fallback (28 oct 2026): both
 * are OpenAI-compatible endpoints, so a fallback is a config change
 * (`AGENT_BASE_URL_2` + `AGENT_MODEL_2`), not a code change.
 */
export function createAgentModel(config: AgentModelConfig): LanguageModel {
  const provider = createOpenAICompatible({
    name: "experiential-labs",
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  return provider(config.model);
}
