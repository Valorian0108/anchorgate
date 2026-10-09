/**
 * Request fingerprints.
 *
 * A fingerprint is a deterministic hash of a request's MATERIAL details — the
 * facts that must not change without voiding an approval: amount, currency,
 * payee, purpose, and category.
 *
 * Approval is bound to a fingerprint. If any material detail changes, the
 * fingerprint changes, and the old approval no longer applies.
 */

import { createHash } from "node:crypto";

import type { PurchaseRequest } from "../authorization";

/**
 * Compute the stable fingerprint of a request.
 *
 * The canonical form fixes the field order explicitly, so the same material
 * details always produce the same hash regardless of property order elsewhere.
 * `request` must be a validated `PurchaseRequest`.
 */
export function computeFingerprint(request: PurchaseRequest): string {
  const canonical = JSON.stringify({
    amountMinor: request.amountMinor,
    currency: request.currency,
    payee: request.payee,
    purpose: request.purpose,
    category: request.category,
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * True when a request's material details match an existing record's fingerprint.
 * Used to confirm that a record still refers to the same immutable request.
 */
export function matchesFingerprint(
  fingerprint: string,
  request: PurchaseRequest,
): boolean {
  return computeFingerprint(request) === fingerprint;
}
