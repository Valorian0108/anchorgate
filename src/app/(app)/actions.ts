"use server";

/**
 * Gate actions (server-side only).
 *
 * The "Ask the assistant" box. The owner types what they want looked at; we run
 * the proposal-only agent and return to the Gate with an honest outcome code:
 * what was filed, what was blocked, and what could not be filed at all. The
 * agent can only PROPOSE; the deterministic engine still decides, and nothing
 * is paid here.
 */

import { InvalidToolInputError } from "ai";
import { redirect } from "next/navigation";

import { PROPOSE_PURCHASE_TOOL, type AgentRunResult } from "@/agent";
import {
  ReasonCode,
  type AuthorizationDecision,
  type SpendingRules,
} from "@/core/authorization";
import { verifyOwner } from "@/lib/auth/dal";
import { askPathFor, frontDoorReason, type AskOutcome } from "@/lib/askOutcome";
import { getAgent, getActiveRules } from "@/lib/service";

/** The verdict payload the propose tool returns (to the model, and to us). */
interface ProposeToolOutput {
  decision?: AuthorizationDecision;
  reasonCode?: ReasonCode;
  requestId?: string | null;
}

/**
 * Read what actually happened out of a finished agent run.
 *
 * A tool result means the engine ran: a request id means a record was filed,
 * no id means the engine saw a malformed request and filed nothing. A tool
 * call with no result means the tool contract rejected the input before the
 * engine (the front door), so the reason is reconstructed in the same order
 * the engine would have checked. No tool call at all means the assistant asked
 * for more detail instead of filing.
 */
function outcomeFromRun(run: AgentRunResult, rules: SpendingRules | null): AskOutcome {
  const results = run.toolResults.filter((r) => r.name === PROPOSE_PURCHASE_TOOL);
  const lastResult = results.at(-1);
  if (lastResult) {
    const output = lastResult.output as ProposeToolOutput;
    const reasonCode = output.reasonCode ?? ReasonCode.INVALID_REQUEST;
    if (output.requestId) {
      return {
        kind: "filed",
        decision: output.decision ?? "DENY",
        reasonCode,
      };
    }
    return { kind: "unfiled", reasonCode };
  }

  const calls = run.toolCalls.filter((c) => c.name === PROPOSE_PURCHASE_TOOL);
  const lastCall = calls.at(-1);
  if (lastCall) {
    return { kind: "unfiled", reasonCode: frontDoorReason(lastCall.input, rules) };
  }
  return { kind: "clarify" };
}

export async function proposeFromGate(formData: FormData): Promise<void> {
  await verifyOwner();

  const text = String(formData.get("request") ?? "").trim();
  if (!text) {
    redirect("/?ask=empty");
  }

  const rules = await getActiveRules();

  // NOTE: redirect() throws, so it must happen OUTSIDE the try block or the
  // catch would swallow it and report an error on success.
  let outcome: AskOutcome;
  try {
    const agent = await getAgent();
    outcome = outcomeFromRun(await agent.run(text), rules);
  } catch (error) {
    // A tool input the contract rejected is a front-door refusal, not outage.
    outcome = InvalidToolInputError.isInstance(error)
      ? { kind: "unfiled", reasonCode: ReasonCode.INVALID_REQUEST }
      : { kind: "error" };
  }

  redirect(askPathFor(outcome));
}
