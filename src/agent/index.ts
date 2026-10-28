/**
 * Public surface of the AI agent module (Phase 5).
 *
 * The agent can PROPOSE purchases. It can never approve, pay, or widen its own
 * authority; those decisions belong to the deterministic authorization core.
 */

export {
  AgentConfigError,
  DEFAULT_AGENT_BASE_URL,
  DEFAULT_AGENT_FALLBACK_BASE_URL,
  DEFAULT_AGENT_ID,
  readAgentConfig,
  readAgentEndpoint,
  readAgentFallback,
} from "./config";
export type { AgentConfig, AgentEndpoint, AgentFallbackConfig } from "./config";
export { createAgentModel } from "./model";
export type { AgentModelConfig } from "./model";
export { describeRules, ProposalService } from "./proposal";
export type {
  ProposalInput,
  ProposalResult,
  ProposalServiceDeps,
} from "./proposal";
export {
  CATALOG,
  CATALOG_AGENT_ID,
  CATALOG_ARRIVAL_GAP_MS,
  CATALOG_MAX_WAITING_ON_YOU,
  catalogArrivalDue,
  catalogForCategories,
  catalogShouldHoldBack,
  catalogState,
  pickNextCatalogItem,
  surfaceCatalogPurchase,
} from "./catalog";
export type { CatalogItem } from "./catalog";
export {
  createAskDetailsTool,
  createProposePurchaseTool,
  createPurchaseTools,
  ASK_DETAILS_TOOL,
  PROPOSE_PURCHASE_TOOL,
} from "./tools";
export {
  agentInstructions,
  createPurchaseAgent,
  AGENT_RUN_TIMEOUT_MS,
  FALLBACK_MIN_BUDGET_MS,
} from "./agent";
export type {
  AgentRunResult,
  AgentToolCallSummary,
  AgentToolResultSummary,
  PurchaseAgent,
  PurchaseAgentDeps,
} from "./agent";
