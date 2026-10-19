/**
 * Agent tools (Phase 5).
 *
 * There are exactly TWO tools, and neither can move money:
 *   - `propose_purchase` files one request for the engine to decide.
 *   - `ask_for_details` reports which facts the owner's message genuinely
 *     lacks, so the gate can ask for them by name instead of the model
 *     guessing or filing placeholders (19 oct 2026). It files nothing and
 *     touches no store.
 * The agent has no payment, capture, refund, or approval tool. This is the
 * security property the whole product rests on, so it is enforced structurally
 * here — the tool set is built in one place and contains nothing else.
 *
 * `propose_purchase` does not decide anything. It calls the deterministic
 * `ProposalService` (which runs the authorization engine) and returns the
 * engine's verdict to the model. The model can read the verdict; it cannot
 * change it.
 */

import { tool } from "ai";
import { z } from "zod";

import type { ProposalService } from "./proposal";

/** The tool that files one proposal with the engine. */
export const PROPOSE_PURCHASE_TOOL = "propose_purchase";

/**
 * The tool the model uses to report genuinely missing facts instead of
 * guessing (19 oct 2026). A fixed enum on purpose: the gate turns these codes
 * into its own plain sentence and never shows the model's free text.
 */
export const ASK_DETAILS_TOOL = "ask_for_details";

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

/** The facts a proposal needs that an owner's message can genuinely lack. */
const askDetailsInput = z.object({
  missing: z
    .array(z.enum(["payee", "amount", "purpose"]))
    .describe(
      "Which facts the owner's message genuinely lacks: 'payee' (who gets " +
        "paid), 'amount' (the price), 'purpose' (what the purchase is for). " +
        "List only what is truly missing; never invent one to avoid listing it.",
    ),
});

/**
 * Build the `ask_for_details` tool.
 *
 * It executes nothing and stores nothing: it echoes the list back so the run
 * result carries it to the gate, which writes the owner-facing sentence.
 */
export function createAskDetailsTool() {
  return tool({
    description:
      "Report which required facts are missing from the owner's request, " +
      "instead of guessing or filing an incomplete proposal. This files " +
      "nothing and moves no money; the gate turns the list into a plain " +
      "question for the owner.",
    inputSchema: askDetailsInput,
    execute: async (input) => ({ missing: input.missing }),
  });
}

/**
 * The complete tool set handed to the model. Deliberately just these two: if a
 * payment tool is ever needed it must be added to the *server-side execution*
 * layer, never to the agent's tool set.
 */
export function createPurchaseTools(proposals: ProposalService) {
  return {
    [PROPOSE_PURCHASE_TOOL]: createProposePurchaseTool(proposals),
    [ASK_DETAILS_TOOL]: createAskDetailsTool(),
  };
}
