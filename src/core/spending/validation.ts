/**
 * Runtime validation for spending events.
 *
 * Events may originate from a payment provider callback, which is untrusted.
 * Anything entering the ledger is parsed here first. Malformed input fails
 * closed: it is rejected rather than recorded.
 */

import {
  isNonEmptyString,
  isRecord,
  type ParseResult,
} from "../authorization/validation";
import {
  SPENDING_EVENT_KINDS,
  type SpendingEvent,
  type SpendingEventKind,
} from "./types";

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isEventKind(value: unknown): value is SpendingEventKind {
  return (
    typeof value === "string" &&
    (SPENDING_EVENT_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Parse an untrusted value into a `SpendingEvent`.
 *
 * A `CAPTURE_VERIFIED` or `CAPTURE_PENDING` event MUST carry a `providerRef`, so
 * that a capture can always be traced to a provider-verifiable transaction
 * (and a pending capture can later be reconciled by its provider id).
 */
export function parseSpendingEvent(input: unknown): ParseResult<SpendingEvent> {
  if (!isRecord(input)) {
    return { ok: false, reason: "Spending event must be an object." };
  }

  const { id, requestId, kind, amountMinor, currency, occurredAt, providerRef, note } = input;

  if (!isNonEmptyString(id)) return { ok: false, reason: "event id is required." };
  if (!isNonEmptyString(requestId)) return { ok: false, reason: "requestId is required." };
  if (!isEventKind(kind)) return { ok: false, reason: "event kind is unknown." };
  if (!isNonNegativeSafeInteger(amountMinor)) {
    return { ok: false, reason: "amountMinor must be a non-negative integer." };
  }
  if (!isNonEmptyString(currency)) return { ok: false, reason: "currency is required." };
  if (!isIsoTimestamp(occurredAt)) {
    return { ok: false, reason: "occurredAt must be an ISO 8601 timestamp." };
  }
  if (
    (kind === "CAPTURE_VERIFIED" || kind === "CAPTURE_PENDING") &&
    !isNonEmptyString(providerRef)
  ) {
    return {
      ok: false,
      reason: `${kind} requires a providerRef (the provider capture id).`,
    };
  }
  if (providerRef !== undefined && !isNonEmptyString(providerRef)) {
    return { ok: false, reason: "providerRef, when present, must be a non-empty string." };
  }
  if (note !== undefined && typeof note !== "string") {
    return { ok: false, reason: "note, when present, must be a string." };
  }

  return {
    ok: true,
    value: {
      id,
      requestId,
      kind,
      amountMinor,
      currency,
      occurredAt,
      ...(providerRef !== undefined ? { providerRef } : {}),
      ...(note !== undefined ? { note } : {}),
    },
  };
}

/**
 * Deterministic idempotency key for a verified capture, derived from the
 * provider's capture id. A repeated callback carrying the same capture id
 * produces the same key and is therefore ignored on the second append.
 */
export function captureEventId(providerCaptureId: string): string {
  return `capture:${providerCaptureId}`;
}
