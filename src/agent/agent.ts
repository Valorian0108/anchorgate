/**
 * The AI purchase agent (Phase 5).
 *
 * The agent's only capabilities are `propose_purchase` (file one request for
 * the engine) and `ask_for_details` (report genuinely missing facts). It is
 * told, unambiguously, that it cannot approve or pay and that the engine's
 * decision is final. Multi-step generation is capped so a model cannot loop
 * indefinitely "trying again", and the whole run sits behind a hard clock so a
 * hung model can never leave the ask box silent (19 oct 2026).
 *
 * The agent is a thin composition: a language model + exactly one tool + the
 * instructions. The interesting safety logic lives in the deterministic core.
 */

import { generateText, isStepCount, type LanguageModel } from "ai";

import type { SpendingRules } from "../core/authorization";
import { describeRules, type ProposalService } from "./proposal";
import { createPurchaseTools } from "./tools";

export interface PurchaseAgentDeps {
  /** The language model to drive the agent. */
  model: LanguageModel;
  /** The deterministic proposal service the tool calls. */
  proposals: ProposalService;
  /** The active rules, used only to describe the policy to the model. */
  rules: SpendingRules | null;
  /**
   * Hard clock for one run, in milliseconds. Injectable for tests; defaults
   * to `AGENT_RUN_TIMEOUT_MS`.
   */
  timeoutMs?: number;
}

/** A tool call the model made, with its raw input. */
export interface AgentToolCallSummary {
  name: string;
  input: unknown;
}

/** A tool result, with the engine's verdict payload. */
export interface AgentToolResultSummary {
  name: string;
  output: unknown;
}

export interface AgentRunResult {
  /** The model's final natural-language reply. */
  text: string;
  /** Every tool call made across all steps. */
  toolCalls: AgentToolCallSummary[];
  /** Every tool result across all steps. */
  toolResults: AgentToolResultSummary[];
  /** Number of model steps (tool round-trips included). */
  steps: number;
}

export interface PurchaseAgent {
  /** The tool set handed to the model. Exposed so callers/tests can inspect it. */
  tools: ReturnType<typeof createPurchaseTools>;
  /** Run one proposal conversation to completion. */
  run(prompt: string): Promise<AgentRunResult>;
}

/**
 * Instructions handed to the model.
 *
 * They state, plainly, that the model may only PROPOSE and has no authority to
 * pay or approve. The active rules are included so the model can make sensible
 * proposals — but the engine still makes every decision.
 */
export function agentInstructions(rules: SpendingRules | null): string {
  return [
    "You are a purchase-proposal assistant.",
    "",
    "You may ONLY propose purchases by calling the `propose_purchase` tool.",
    "You cannot approve, pay, reserve, or move money, and you must never claim that a payment happened.",
    "An independent, deterministic authorization engine decides each proposal:",
    "  - ALLOW: the engine cleared it. Any actual payment happens elsewhere, outside this conversation.",
    "  - ASK: a human must approve it. Tell the user that approval is required.",
    "  - DENY: a hard rule blocked it. Explain why and do not retry the same request.",
    "",
    "The engine's decision is final. You cannot change, override, or widen the rules.",
    "If a request is DENIED, do not split it, reword it, or otherwise try to work around the rule.",
    "When the amount, the payee, or the purpose is genuinely missing, call `ask_for_details` naming exactly which are missing.",
    "Never invent a seller, a price, or a purpose to fill a gap, and never file a guess.",
    "When all three are present but the category is unclear, pick the closest permitted category and file the proposal; the engine and the owner decide next.",
    "",
    "Current spending rules:",
    describeRules(rules),
  ].join("\n");
}

/**
 * The hard clock for one ask-box run (19 oct 2026).
 *
 * The model normally answers in 30-60 seconds. When it does not answer at all,
 * the platform eventually kills the whole function, and a killed function
 * cannot redirect: the box stays silent, the one outcome it must never
 * produce. Cancelling at 45 seconds leaves the run time to throw into the
 * action's catch block, which reports the honest "could not reach the model"
 * sentence. Must stay below the gate page's `maxDuration` (60s) so this clock
 * always fires first.
 */
export const AGENT_RUN_TIMEOUT_MS = 45_000;

/** Compose a language model, the proposal tools, and the instructions. */
export function createPurchaseAgent(deps: PurchaseAgentDeps): PurchaseAgent {
  const tools = createPurchaseTools(deps.proposals);
  const instructions = agentInstructions(deps.rules);

  return {
    tools,
    async run(prompt: string): Promise<AgentRunResult> {
      const result = await generateText({
        model: deps.model,
        instructions,
        tools,
        // Allow the model to call the tool and then summarize the verdict.
        stopWhen: isStepCount(4),
        // The hard clock: when the model hangs, this cancels the call and the
        // run rejects into the action's error path instead of outliving the
        // platform's own limit and taking the honest sentence down with it.
        abortSignal: AbortSignal.timeout(deps.timeoutMs ?? AGENT_RUN_TIMEOUT_MS),
        prompt,
      });

      return {
        text: result.text,
        steps: result.steps.length,
        toolCalls: result.steps
          .flatMap((step) => step.toolCalls)
          .map((call) => ({ name: call.toolName, input: call.input })),
        toolResults: result.steps
          .flatMap((step) => step.toolResults)
          .map((toolResult) => ({ name: toolResult.toolName, output: toolResult.output })),
      };
    },
  };
}
