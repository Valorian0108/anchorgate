"use server";

/**
 * Gate actions and the Rules editor (server-side only).
 *
 * The "Ask the assistant" box. The owner types what they want looked at; we run
 * the proposal-only agent and return to the Gate with an honest outcome code:
 * what was filed, what was blocked, and what could not be filed at all. The
 * agent can only PROPOSE; the deterministic engine still decides, and nothing
 * is paid here.
 *
 * The Rules editor. The owner edits their monthly limit, the one money amount
 * the Rules page collects (Option 1: auto-approve is off, so there is no
 * second number to set). A save advances the rule version, and the outcome
 * travels back as an honest one-line code.
 */

import { InvalidToolInputError } from "ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PROPOSE_PURCHASE_TOOL, type AgentRunResult } from "@/agent";
import {
  ReasonCode,
  type AuthorizationDecision,
  type SpendingRules,
} from "@/core/authorization";
import { verifyOwner } from "@/lib/auth/dal";
import { askPathFor, frontDoorReason, type AskOutcome } from "@/lib/askOutcome";
import { shortRef } from "@/lib/format";
import { nextRuleVersion, parseMoneyToMinor, startingRules } from "@/lib/rulesEdit";
import { getAgent, getActiveRules, getService, saveRules, surfaceNextCatalog } from "@/lib/service";
import type { PurchaseRecord } from "@/core/purchases";

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
  const owner = await verifyOwner();

  const text = String(formData.get("request") ?? "").trim();
  if (!text) {
    redirect("/?ask=empty");
  }

  const rules = await getActiveRules(owner.userId);
  if (!rules) {
    // No rules means nothing can ever be approved, and running the model would
    // only produce a denial. Say so honestly and point at the Rules page.
    redirect("/?ask=norules");
  }

  // NOTE: redirect() throws, so it must happen OUTSIDE the try block or the
  // catch would swallow it and report an error on success.
  let outcome: AskOutcome;
  try {
    const agent = await getAgent(owner.userId);
    outcome = outcomeFromRun(await agent.run(text), rules);
  } catch (error) {
    // A tool input the contract rejected is a front-door refusal, not outage.
    outcome = InvalidToolInputError.isInstance(error)
      ? { kind: "unfiled", reasonCode: ReasonCode.INVALID_REQUEST }
      : { kind: "error" };
  }

  redirect(askPathFor(outcome));
}

/**
 * Save the owner's monthly limit, the only number the Rules page collects.
 * Every failure path is a plain sentence on the Rules page; nothing is saved
 * unless the amount parses.
 *
 * Option 1: auto-approve is off, so there is no second number. An existing
 * set keeps its dormant auto line untouched (the engine ignores it while the
 * flag is false); a first set starts that dormant line at zero, the safest
 * value it could ever have.
 */
export async function updateRules(formData: FormData): Promise<void> {
  const owner = await verifyOwner();

  const capMinor = parseMoneyToMinor(String(formData.get("cap") ?? ""));
  if (capMinor === null) {
    redirect("/statute?saved=bad-money");
  }

  const current = await getActiveRules(owner.userId);

  // A person with no rules yet writes their FIRST set here: the number they
  // typed, on the documented starting defaults. For an existing set, only the
  // limit changes and the version bumps.
  await saveRules(
    owner.userId,
    current
      ? {
          ...current,
          monthlyCapMinor: capMinor,
          ruleVersion: nextRuleVersion(current.ruleVersion),
        }
      : startingRules(capMinor, 0),
  );

  redirect("/statute?saved=ok");
}

/**
 * The live feed's heartbeat.
 *
 * The Gate calls this about every thirty seconds. It files at most one catalog
 * request per person per window (enforced on the server), and returns the new
 * record so the Gate can show it arrive without a reload, or null when nothing
 * is due. It never touches money: the request lands as ASK and still waits for
 * the owner, exactly like a typed ask.
 */
export async function surfaceNextFromGate(): Promise<PurchaseRecord | null> {
  const owner = await verifyOwner();
  return surfaceNextCatalog(owner.userId);
}

/** The two decisions an owner can take on a card at the gate. */
export type GateDecision = "approve" | "decline";

/**
 * What a Gate decision returns to the card.
 *
 * `record` is the request after the decision, so the card shows exactly what
 * happened (paid, blocked, or declined) without guessing. `ref` is the short
 * PayPal capture reference, present only when a capture was verified — the same
 * string the server-rendered card would show after a reload, so the reference
 * appears the moment you pay rather than waiting for the page to refresh.
 */
export interface GateDecisionResult {
  record: PurchaseRecord;
  ref?: string;
}

/**
 * Take one decision from a Gate card, server-side.
 *
 * This is the same path the case file uses, minus the redirect: approve runs the
 * engine's re-check against the CURRENT rules and budget and, only if the request
 * is still approved, executes the payment; decline records a final rejection.
 *
 * A hard refusal is a real result, not an error: the card shows it as blocked and
 * no money moves.
 *
 * SECURITY: like every Server Function it can be reached by a direct POST, so it
 * trusts nothing from the client. Identity is the signed-in owner, and the core
 * re-gates the payment immediately before the provider is ever called.
 */
export async function decideFromGate(
  id: string,
  action: GateDecision,
): Promise<GateDecisionResult> {
  const owner = await verifyOwner();
  const service = getService(owner.userId);

  if (action === "decline") {
    const outcome = await service.reject(id, owner.email);
    revalidatePath("/");
    revalidatePath("/record");
    revalidatePath(`/requests/${id}`);
    return { record: outcome.record };
  }

  const approval = await service.approve(id, owner.email);
  if (approval.record.status !== "APPROVED") {
    revalidatePath("/");
    revalidatePath("/record");
    revalidatePath(`/requests/${id}`);
    return { record: approval.record };
  }

  const paid = await service.pay(id, { reconcilePending: true });
  revalidatePath("/");
  revalidatePath("/record");
  revalidatePath(`/requests/${id}`);
  // The capture id on a verified capture is exactly the ledger's providerRef, so
  // this is the same short reference the reloaded card would show. Pending
  // settlements carry no verified capture yet, so they show no reference.
  const ref = paid.outcome.capture
    ? shortRef(paid.outcome.capture.providerCaptureId)
    : undefined;
  return { record: paid.outcome.record, ref };
}
