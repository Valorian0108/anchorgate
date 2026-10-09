/**
 * Agent tools (Phase 5).
 *
 * There is exactly ONE tool: `propose_purchase`. The agent has no payment,
 * capture, refund, or approval tool. This is the security property the whole
 * product rests on, so it is enforced structurally here — the tool set is built
 * in one place and contains nothing else.
 *
 * The tool does not decide anything. It calls the deterministic `ProposalService`
 * (which runs the authorization engine) and returns the engine's verdict to the
 * model. The model can read the verdict; it cannot change it.
 */

import { tool } from "ai";
import { z } from "zod";

import type { ProposalService } from "./proposal";

/** The one and only tool the agent may use. */
export const PROPOSE_PURCHASE_TOOL = "propose_purchase";

const proposePurchaseInput = z.object({
  payee: z.string().min(1).describe("The merchant or person who would be paid."),
  purpose: z
    .string()
    .min(1)
    .describe("What the purchase is for, in the user's own terms."),
  category: z
    .string()
    .min(1)
    .describe("Spending category. It must be one of the permitted categories."),
  amountMinor: z
    .number()
    .int()
    .positive()
    .describe(
      "Amount as an integer in minor units (e.g. cents). 5.00 USD is 500.",
    ),
  currency: z
    .string()
    .min(3)
    .max(3)
    .describe("ISO 4217 currency code, e.g. USD."),
});

/**
 * Build the `propose_purchase` tool.
 *
 * The tool returns the engine's decision verbatim, plus the durable request id
 * and status, and an explicit note that the model did not make the decision.
 */
export function createProposePurchaseTool(proposals: ProposalService) {
  return tool({
    description:
      "Propose a purchase for the independent, deterministic authorization " +
      "engine to decide. This does NOT pay and does NOT reserve money; it only " +
      "files a request. The engine returns ALLOW, ASK (human approval required), " +
      "or DENY. Its decision is final and cannot be overridden by the model.",
    inputSchema: proposePurchaseInput,
    execute: async (input) => {
      const outcome = await proposals.propose(input);
      return {
        decision: outcome.decision.decision,
        reasonCode: outcome.decision.reasonCode,
        reason: outcome.decision.reason,
        requestId: outcome.record?.id ?? null,
        status: outcome.record?.status ?? null,
        decidedBy: "deterministic authorization engine (not the model)",
      };
    },
  });
}

/**
 * The complete tool set handed to the model. Deliberately just one tool: if a
 * payment tool is ever needed it must be added to the *server-side execution*
 * layer, never to the agent's tool set.
 */
export function createPurchaseTools(proposals: ProposalService) {
  return { [PROPOSE_PURCHASE_TOOL]: createProposePurchaseTool(proposals) };
}
