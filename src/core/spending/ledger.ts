/**
 * Spending ledger (Phase 3).
 *
 * Turns a stream of spending events into a trustworthy monthly total. The rules
 * it enforces come straight from the spec:
 *
 *   - Only a VERIFIED capture counts as completed spending.
 *   - Proposed / allowed / approved / submitted / failed / cancelled never count.
 *   - The same capture counted twice is impossible (idempotent append).
 *   - Reservations are tracked but are NOT counted as spending.
 *
 * Everything here is a pure function of the events handed to it. The optional
 * `SpendingLedger` class adds validated, idempotent *writing* on top of a
 * `SpendingStore`; reading/summarising stays pure.
 */

import { captureEventId, parseSpendingEvent } from "./validation";
import type {
  SpendingEvent,
  SpendingPeriod,
  SpendingSummary,
} from "./types";
import type { SpendingStore } from "./store";

/** True for the kinds that move the captured or reserved totals. */
export function isMoneyAffecting(kind: SpendingEvent["kind"]): boolean {
  return kind === "CAPTURE_VERIFIED" || kind === "RESERVED" || kind === "RELEASED";
}

function withinPeriod(occurredAt: string, period: SpendingPeriod): boolean {
  const t = Date.parse(occurredAt);
  return t >= Date.parse(period.startIso) && t < Date.parse(period.endIso);
}

/**
 * Derive totals from events.
 *
 * When a `period` is supplied, only events in `[start, end)` are counted. The
 * caller decides the period boundary, so the undecided "monthly reset timezone"
 * question does not get silently answered here.
 *
 * `reservedMinor` is clamped at zero: if a `RELEASED` ever exceeds its matching
 * `RESERVED` (a data anomaly), we never report a negative reservation, which
 * would otherwise *understate* how much budget is committed.
 */
export function summarizeSpending(
  events: readonly SpendingEvent[],
  period?: SpendingPeriod,
): SpendingSummary {
  let capturedMinor = 0;
  let reservedRaw = 0;

  for (const event of events) {
    if (period && !withinPeriod(event.occurredAt, period)) {
      continue;
    }
    switch (event.kind) {
      case "CAPTURE_VERIFIED":
        capturedMinor += event.amountMinor;
        break;
      case "RESERVED":
        reservedRaw += event.amountMinor;
        break;
      case "RELEASED":
        reservedRaw -= event.amountMinor;
        break;
      default:
        break;
    }
  }

  const reservedMinor = Math.max(reservedRaw, 0);
  return {
    capturedMinor,
    reservedMinor,
    committedMinor: capturedMinor + reservedMinor,
  };
}

/** The completed-spending figure for a period (what the engine calls "spent"). */
export function capturedMinorIn(
  events: readonly SpendingEvent[],
  period?: SpendingPeriod,
): number {
  return summarizeSpending(events, period).capturedMinor;
}

/** The result of trying to record an event. */
export interface RecordOutcome {
  /** True if this event was newly stored; false if it was invalid or a duplicate. */
  recorded: boolean;
  reason: string;
}

/**
 * A validated, idempotent writer over a `SpendingStore`.
 *
 * It validates every incoming event, enforces the idempotency guarantee, and
 * exposes derived totals. It performs no I/O beyond the store it is given.
 */
export class SpendingLedger {
  constructor(private readonly store: SpendingStore) {}

  /**
   * Validate and append one event. Duplicate ids (retries, replays) are ignored
   * and reported as not recorded, never as an error.
   *
   * For a `CAPTURE_VERIFIED` event the idempotency key is derived from the
   * provider capture id (`captureEventId`), regardless of the caller-supplied
   * id. This makes duplicate-capture protection structural: a replayed callback
   * cannot double-count spending even if it arrives with a different envelope id.
   */
  async record(input: unknown): Promise<RecordOutcome> {
    const parsed = parseSpendingEvent(input);
    if (!parsed.ok) {
      return { recorded: false, reason: `Rejected invalid event: ${parsed.reason}` };
    }

    const event: SpendingEvent =
      parsed.value.kind === "CAPTURE_VERIFIED"
        ? { ...parsed.value, id: captureEventId(parsed.value.providerRef as string) }
        : parsed.value;

    const appended = await this.store.append(event);
    return appended
      ? { recorded: true, reason: "Recorded." }
      : { recorded: false, reason: `Duplicate event ignored (id: ${event.id}).` };
  }

  async events(): Promise<SpendingEvent[]> {
    return this.store.list();
  }

  async eventsForRequest(requestId: string): Promise<SpendingEvent[]> {
    return this.store.listByRequest(requestId);
  }

  /** Totals across all recorded events (optionally within a period). */
  async summary(period?: SpendingPeriod): Promise<SpendingSummary> {
    return summarizeSpending(await this.store.list(), period);
  }

  /** Completed spending for a period; feeds the engine's `spentThisMonthMinor`. */
  async capturedMinor(period?: SpendingPeriod): Promise<number> {
    return (await this.summary(period)).capturedMinor;
  }
}
