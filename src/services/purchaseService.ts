/**
 * Purchase application service (Phase 4 completion).
 *
 * This is the layer that turns the pure core into a runnable product flow:
 *
 *   propose (agent) -> PENDING_APPROVAL
 *     approve  -> re-check current rules/budget -> APPROVED
 *     reject   -> REJECTED
 *     pay      -> final hard-constraint gate -> provider -> verified capture -> counted
 *     reconcile-> re-read a pending capture; count it once when it settles
 *
 * It composes the deterministic core with the injected stores and the payment
 * gateway. It contains NO policy of its own: every decision is made by the core
 * functions it calls. The gateway is provided lazily so read/approval commands
 * work even when PayPal credentials are absent.
 */

import type {
  DecisionResult,
  PurchaseRequest,
  SpendingRules,
  SpendingRulesStore,
} from "../core/authorization";
import { evaluatePurchase } from "../core/authorization";
import {
  approvePurchase,
  rejectPurchase,
  type PurchaseRecord,
  type PurchaseStore,
  type RequestStatus,
  type TransitionOutcome,
} from "../core/purchases";
import {
  executeAuthorizedPurchase,
  reconcilePendingPurchase,
  type ExecutionOutcome,
  type PaymentGateway,
} from "../core/execution";
import {
  SpendingLedger,
  type SpendingEvent,
  type SpendingStore,
} from "../core/spending";
import { readSpendingState } from "./spendingState";

export interface PurchaseServiceDeps {
  purchases: PurchaseStore;
  spending: SpendingStore;
  rules: SpendingRulesStore;
  /** Built lazily: only `pay`/`reconcile` need the payment provider. */
  paymentGateway: () => PaymentGateway;
  /** Clock. Injectable for deterministic tests. Defaults to the real clock. */
  now?: () => Date;
}

/** A snapshot of the budget, for display. */
export interface BudgetSnapshot {
  rules: SpendingRules | null;
  spentThisMonthMinor: number;
  /**
   * Verified spending this month that belongs to purchases the rules cleared
   * on their own (trust mode). The same figure the engine reads against the
   * auto budget, from the same single computation, so a meter can never
   * disagree with a decision.
   */
  autoSpentThisMonthMinor: number;
  /** `null` when no rules are configured (nothing can be authorized). */
  remainingMinor: number | null;
  currency: string | null;
}

/** The result of a `pay` attempt. `reconciled` is true if a pending capture was re-read. */
export interface PayResult {
  outcome: ExecutionOutcome;
  reconciled: boolean;
}

export class PurchaseService {
  private readonly now: () => Date;
  private readonly ledger: SpendingLedger;

  constructor(private readonly deps: PurchaseServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.ledger = new SpendingLedger(deps.spending);
  }

  /** Current rules plus the verified spending this UTC month. */
  async budget(): Promise<BudgetSnapshot> {
    const now = this.now();
    const rules = await this.deps.rules.getActive();
    // The same read the decisions use (readSpendingState): one place computes
    // spending and auto spending, so the wall and the meters can never drift
    // from the figures the engine enforces.
    const state = await readSpendingState(this.deps, now);
    const { spentThisMonthMinor, autoSpentThisMonthMinor } = state;
    if (!rules) {
      return {
        rules: null,
        spentThisMonthMinor,
        autoSpentThisMonthMinor,
        remainingMinor: null,
        currency: null,
      };
    }
    return {
      rules,
      spentThisMonthMinor,
      autoSpentThisMonthMinor,
      remainingMinor: Math.max(rules.monthlyCapMinor - spentThisMonthMinor, 0),
      currency: rules.currency,
    };
  }

  async get(id: string): Promise<PurchaseRecord | null> {
    return this.deps.purchases.getById(id);
  }

  async list(status?: RequestStatus): Promise<PurchaseRecord[]> {
    return status
      ? this.deps.purchases.listByStatus(status)
      : this.deps.purchases.list();
  }

  /** Requests awaiting a human decision. */
  async listPending(): Promise<PurchaseRecord[]> {
    return this.deps.purchases.listByStatus("PENDING_APPROVAL");
  }

  /**
   * Approve a pending request. The core re-checks it against the CURRENT rules
   * and budget first: a hard constraint (e.g. the monthly cap) still refuses it,
   * and that refusal is persisted as `DENIED`.
   */
  async approve(id: string, approver: string): Promise<TransitionOutcome> {
    const record = await this.require(id);
    const now = this.now();
    const rules = await this.deps.rules.getActive();
    const state = await readSpendingState(this.deps, now);

    const outcome = approvePurchase(record, approver, rules, state, now);
    await this.deps.purchases.save(outcome.record);

    if (outcome.ok) {
      await this.recordLifecycle(outcome.record, "APPROVED", now);
    } else if (outcome.record.status === "DENIED") {
      await this.recordLifecycle(outcome.record, "DENIED", now, outcome.reason);
    }

    return outcome;
  }

  /** Reject a pending request. Rejection is final. */
  async reject(id: string, rejecter: string, reason?: string): Promise<TransitionOutcome> {
    const record = await this.require(id);
    const now = this.now();
    const outcome = rejectPurchase(record, rejecter, now, reason);
    await this.deps.purchases.save(outcome.record);

    if (outcome.ok) {
      await this.recordLifecycle(outcome.record, "REJECTED", now, reason);
    }

    return outcome;
  }

  /**
   * Re-evaluate a request against the CURRENT rules and spending state.
   *
   * This is the same evaluation the approval gate performs — shown on the case
   * file so the "re-run just now" line is the engine's real output, never a
   * display guess.
   */
  async evaluateNow(request: PurchaseRequest): Promise<DecisionResult> {
    const now = this.now();
    const [rules, state] = await Promise.all([
      this.deps.rules.getActive(),
      readSpendingState(this.deps, now),
    ]);
    return evaluatePurchase(request, rules, state);
  }

  /** Immutable ledger events for one request (capture refs, lifecycle). */
  async eventsByRequest(requestId: string): Promise<SpendingEvent[]> {
    return this.deps.spending.listByRequest(requestId);
  }

  /** Every ledger event, oldest first — read once by the audit register. */
  async allEvents(): Promise<SpendingEvent[]> {
    return this.deps.spending.list();
  }

  /**
   * Execute an approved/authorized request through the payment gateway.
   *
   * The core re-runs the deterministic gate immediately before paying, persists
   * the updated record, and counts a verified capture exactly once (idempotent
   * by provider capture id). If the provider holds the capture as pending and
   * `reconcilePending` is set, it is reconciled once (read-only) so a settled
   * capture is counted without a second command.
   */
  async pay(id: string, options: { reconcilePending?: boolean } = {}): Promise<PayResult> {
    const record = await this.require(id);
    const now = this.now();
    const rules = await this.deps.rules.getActive();
    const state = await readSpendingState(this.deps, now);

    let outcome = await executeAuthorizedPurchase({
      record,
      rules,
      state,
      now,
      gateway: this.deps.paymentGateway(),
      ledger: this.ledger,
    });
    await this.deps.purchases.save(outcome.record);

    let reconciled = false;
    if (outcome.status === "PENDING" && options.reconcilePending) {
      const settled = await reconcilePendingPurchase({
        record: outcome.record,
        gateway: this.deps.paymentGateway(),
        ledger: this.ledger,
        now: this.now(),
      });
      await this.deps.purchases.save(settled.record);
      outcome = settled;
      reconciled = true;
    }

    return { outcome, reconciled };
  }

  /**
   * Reconcile a request whose capture the provider left pending. Read-only at the
   * provider: it never creates a payment, it only checks whether one settled.
   */
  async reconcile(id: string): Promise<ExecutionOutcome> {
    const record = await this.require(id);
    const outcome = await reconcilePendingPurchase({
      record,
      gateway: this.deps.paymentGateway(),
      ledger: this.ledger,
      now: this.now(),
    });
    await this.deps.purchases.save(outcome.record);
    return outcome;
  }

  private async require(id: string): Promise<PurchaseRecord> {
    const record = await this.deps.purchases.getById(id);
    if (!record) {
      throw new Error(`No purchase request found with id ${JSON.stringify(id)}.`);
    }
    return record;
  }

  /** Record an informational lifecycle event so the ledger shows the full story. */
  private async recordLifecycle(
    record: PurchaseRecord,
    kind: "APPROVED" | "REJECTED" | "DENIED",
    now: Date,
    note?: string,
  ): Promise<void> {
    await this.ledger.record({
      id: `${kind.toLowerCase()}:${record.id}`,
      requestId: record.id,
      kind,
      amountMinor: record.request.amountMinor,
      currency: record.request.currency,
      occurredAt: now.toISOString(),
      ...(note ? { note } : {}),
    });
  }
}
