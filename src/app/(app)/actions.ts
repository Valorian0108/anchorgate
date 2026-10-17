"use server";

/**
 * Gate actions and the Rules editor (server-side only).
 *
 * The "Ask the assistant" box. The owner types what they want looked at; we run
 * the proposal-only agent and return to the Gate with an honest outcome code:
 * what was filed, what was blocked, and what could not be filed at all. The
 * agent can only PROPOSE; the deterministic engine still decides. Under trust
 * mode (owner decision, 16 oct 2026) a filed request the owner's exact-price
 * list cleared is settled before the redirect, and the outcome code says
 * plainly whether it was paid, queued, or cleared but not paid.
 *
 * The Rules editor. The owner edits their monthly limit and the AI
 * authorization section (toggle, listed items at exact prices, one auto
 * budget). A save advances the rule version, and the outcome travels back as
 * an honest one-line code.
 */

import { InvalidToolInputError } from "ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PROPOSE_PURCHASE_TOOL, type AgentRunResult } from "@/agent";
import { CATALOG } from "@/agent/catalog";
import {
  ReasonCode,
  type AuthorizationDecision,
  type AutoAllowlistEntry,
  type SpendingRules,
} from "@/core/authorization";
import { verifyOwner } from "@/lib/auth/dal";
import { askPathFor, frontDoorReason, type AskOutcome } from "@/lib/askOutcome";
import { shortRef } from "@/lib/format";
import {
  buildTrustEntry,
  nextRuleVersion,
  parseMoneyToMinor,
  startingRules,
  trustProblem,
} from "@/lib/rulesEdit";
import {
  getAgent,
  getActiveRules,
  getService,
  saveRules,
  settleAutoAuthorized,
  surfaceNextCatalog,
} from "@/lib/service";
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
        requestId: output.requestId,
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

  // Trust mode: a filed ALLOW means the owner's list cleared this ask. Settle
  // it now and report what actually happened (paid with a reference, queued
  // because the rules changed, or cleared but not paid), never what was about
  // to happen. Settlement failures are honest outcomes, not outages: the
  // record stays cleared-but-unpaid and the box says exactly that.
  if (outcome.kind === "filed" && outcome.decision === "ALLOW" && outcome.requestId) {
    outcome = await settleFiledAllow(owner.userId, outcome.requestId);
  }

  redirect(askPathFor(outcome));
}

/**
 * Settle a filed ALLOW under trust mode and translate the settled record into
 * the honest ask-box outcome. Never throws.
 */
async function settleFiledAllow(userId: string, requestId: string): Promise<AskOutcome> {
  try {
    const service = getService(userId);
    const record = await service.get(requestId);
    if (!record) {
      return { kind: "stalled" };
    }
    if (record.status !== "AUTHORIZED") {
      // Something already moved it (a second tab, a re-gate). Report the
      // record as it stands rather than guessing.
      return outcomeForSettled(record);
    }
    const settled = await settleAutoAuthorized(userId, record);
    return outcomeForSettled(settled.record, settled.ref);
  } catch {
    return { kind: "stalled" };
  }
}

/** The honest ask-box outcome for a record the rules cleared, after settlement. */
function outcomeForSettled(record: PurchaseRecord, ref?: string): AskOutcome {
  switch (record.status) {
    case "EXECUTED":
      return { kind: "paid", ...(ref ? { ref } : {}) };
    case "PENDING_SETTLEMENT":
      return { kind: "paid" };
    case "PENDING_APPROVAL": {
      // The pre-execution gate re-checked against the rules now in force and
      // dropped it into the queue: report the engine's current reason.
      const latest = record.evaluations.at(-1);
      return {
        kind: "filed",
        decision: "ASK",
        reasonCode: latest?.decision.reasonCode ?? ReasonCode.APPROVAL_REQUIRED,
      };
    }
    case "DENIED": {
      const latest = record.evaluations.at(-1);
      return {
        kind: "filed",
        decision: "DENY",
        reasonCode: latest?.decision.reasonCode ?? ReasonCode.MONTHLY_CAP_EXCEEDED,
      };
    }
    default:
      // Still AUTHORIZED: the provider declined or errored. Cleared, not paid,
      // and no money moved.
      return { kind: "stalled" };
  }
}

/**
 * Save the owner's monthly limit. Every failure path is a plain sentence on
 * the Rules page; nothing is saved unless the amount parses.
 *
 * The AI authorization section has its own form and its own action
 * (`updateTrust`); a save here leaves the toggle, the list, and the auto
 * budget exactly as they are. An existing set keeps its retired per-purchase
 * line untouched (the engine no longer reads it); a first set starts that line
 * at zero, the safest value it could ever have.
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
 * Save the AI authorization section: the toggle, the exact prices of the
 * listed items, and the one auto budget number.
 *
 * SECURITY: item identities (seller, purpose) come from the catalog constant
 * itself, never from form text. A crafted POST can pick catalog items and
 * prices for the signed-in person's own rules, but it cannot smuggle an
 * arbitrary seller onto the list. The monthly limit is left untouched. A save
 * advances the rule version; every failure path is a plain one-line code on
 * the Rules page, and nothing is saved unless every amount parses and the
 * guardrails pass.
 */
export async function updateTrust(formData: FormData): Promise<void> {
  const owner = await verifyOwner();

  const current = await getActiveRules(owner.userId);
  if (!current) {
    redirect("/statute?saved=norules");
  }

  // Switching off keeps the list and the budget stored, so switching back on
  // does not make anyone retype them. The engine ignores both while the flag
  // is off, which is the whole guarantee.
  if (formData.get("auto") !== "on") {
    await saveRules(owner.userId, {
      ...current,
      autoApproveEnabled: false,
      ruleVersion: nextRuleVersion(current.ruleVersion),
    });
    redirect("/statute?saved=trust-off");
  }

  const budgetMinor = parseMoneyToMinor(String(formData.get("auto-budget") ?? ""));
  if (budgetMinor === null) {
    redirect("/statute?saved=bad-budget");
  }

  const entries: AutoAllowlistEntry[] = [];
  for (const item of CATALOG) {
    if (formData.get(`auto-item-${item.id}`) !== "on") continue;
    const entry = buildTrustEntry(
      item.payee,
      item.purpose,
      String(formData.get(`auto-amount-${item.id}`) ?? ""),
    );
    if (entry === null) {
      redirect("/statute?saved=bad-item");
    }
    entries.push(entry);
  }

  const problem = trustProblem(budgetMinor, entries, current.monthlyCapMinor);
  if (problem) {
    redirect(`/statute?saved=${problem.code}`);
  }

  await saveRules(owner.userId, {
    ...current,
    autoApproveEnabled: true,
    autoAllowlist: entries,
    autoBudgetMinor: budgetMinor,
    ruleVersion: nextRuleVersion(current.ruleVersion),
  });
  redirect("/statute?saved=trust-on");
}

/**
 * The live feed's heartbeat.
 *
 * The Gate calls this about every thirty seconds. It files at most one catalog
 * request per person per window (enforced on the server), and returns the new
 * record so the Gate can show it arrive without a reload, or null when nothing
 * is due. The catalog itself never touches money: the engine rules on every
 * arrival exactly like a typed ask. Under trust mode an exact match on the
 * owner's list is settled before this returns, so the result then carries the
 * settled record and the short capture reference: the arrival shows as paid,
 * not waiting.
 */
export async function surfaceNextFromGate(): Promise<GateDecisionResult | null> {
  const owner = await verifyOwner();
  return surfaceNextCatalog(owner.userId);
}

/** The two decisions an owner can take on a card at the gate. */
export type GateDecision = "approve" | "decline";

/**
 * What a Gate decision returns to the card. The same shape carries a feed
 * arrival that trust mode settled before returning it.
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
