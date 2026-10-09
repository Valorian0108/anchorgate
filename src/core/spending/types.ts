/**
 * Spending-accounting vocabulary (Phase 3).
 *
 * Accounting is deliberately an EVENT LOG, not a mutable counter. Each thing
 * that happens to a purchase is appended as an event. Totals are then DERIVED
 * from the events. This gives us three things the spec requires:
 *
 *   - Completed spending is counted only from a *verified* capture.
 *   - A retry / duplicate callback is a no-op (events are keyed by a unique id).
 *   - The full history is explainable (proposed vs. authorized vs. captured).
 *
 * No event except `CAPTURE_VERIFIED` contributes to completed spending.
 * `RESERVED` / `RELEASED` track budget held for in-flight payments; they do NOT
 * count as spent. Reservations are not yet wired into the authorization engine,
 * because the reservation *policy* (expiry, concurrency) is an open decision.
 *
 * Money is an INTEGER in the currency's minor units (e.g. cents), matching the
 * authorization core.
 */

/**
 * The kinds of events the ledger understands.
 *
 * Informational kinds record lifecycle without affecting any total:
 *   PROPOSED, AUTHORIZED, PENDING_APPROVAL, APPROVED, REJECTED, DENIED,
 *   SUBMITTED, CAPTURE_PENDING, CAPTURE_FAILED, CANCELLED.
 *
 * Money-affecting kinds:
 *   CAPTURE_VERIFIED -> counts toward completed spending (exactly once).
 *   RESERVED         -> holds budget for an in-flight payment.
 *   RELEASED         -> frees a previously held reservation.
 */
export type SpendingEventKind =
  | "PROPOSED"
  | "AUTHORIZED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "DENIED"
  | "SUBMITTED"
  | "RESERVED"
  | "RELEASED"
  | "CAPTURE_VERIFIED"
  | "CAPTURE_PENDING"
  | "CAPTURE_FAILED"
  | "CANCELLED";

/** Every kind the ledger recognises, used for runtime validation. */
export const SPENDING_EVENT_KINDS: readonly SpendingEventKind[] = [
  "PROPOSED",
  "AUTHORIZED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "DENIED",
  "SUBMITTED",
  "RESERVED",
  "RELEASED",
  "CAPTURE_VERIFIED",
  "CAPTURE_PENDING",
  "CAPTURE_FAILED",
  "CANCELLED",
];

/**
 * A single, immutable spending event.
 *
 * `id` is the IDEMPOTENCY KEY. If the same logical event is submitted twice
 * (a retried callback, a replayed webhook), the second append is ignored, so
 * spending can never be counted twice.
 */
export interface SpendingEvent {
  /** Unique id; the idempotency key. */
  id: string;
  /** The purchase request this event belongs to. */
  requestId: string;
  kind: SpendingEventKind;
  /** Non-negative integer amount in minor units. */
  amountMinor: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** When the event occurred, ISO 8601 (UTC). */
  occurredAt: string;
  /**
   * Provider reference (e.g. PayPal order or capture id). REQUIRED for
   * `CAPTURE_VERIFIED`, so a capture can always be tied back to a verified
   * provider response.
   */
  providerRef?: string;
  /** Optional human-readable note for the audit trail. */
  note?: string;
}

/** A half-open time window `[startIso, endIso)` used to total a monthly period. */
export interface SpendingPeriod {
  /** Inclusive start, ISO 8601. */
  startIso: string;
  /** Exclusive end, ISO 8601. */
  endIso: string;
}

/**
 * Derived totals for a set of events (optionally within a period).
 *
 * - `capturedMinor` is the money ACTUALLY completed (verified captures). This is
 *   the figure fed to the engine as `spentThisMonthMinor`.
 * - `reservedMinor` is money held for in-flight payments. It is NOT spent.
 * - `committedMinor = captured + reserved`; provided for a future concurrency
 *   policy, not currently used by the engine.
 */
export interface SpendingSummary {
  capturedMinor: number;
  reservedMinor: number;
  committedMinor: number;
}
