"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";

/**
 * The single-owner gate — decisions and payments, server-side only.
 *
 * Identity: the signed-in owner, resolved server-side by the DAL on every call.
 * Each decision is stamped with the owner's email in `approvedBy` /
 * `rejectedBy`. There is no client-side identity anywhere.
 *
 * SECURITY: Server Functions are reachable by direct POST, NOT only through this
 * UI — so none of these trust the request:
 *   - `approve` re-runs the engine (fingerprint, CURRENT rules and budget) and
 *     persists a hard refusal as `DENIED`.
 *   - `pay` runs the core's final pre-execution gate. It can only reach the
 *     provider for an AUTHORIZED/APPROVED request whose hard constraints still
 *     hold; anything else is BLOCKED before a payment is created. A repeat POST
 *     for an already-executed record is therefore a no-op, not a second charge
 *     (PayPal's per-request idempotency key covers a concurrent double-submit).
 *   - `reconcile` is read-only at the provider: it never creates a payment.
 */

function readId(formData: FormData): string | null {
  const id = formData.get("id");
  return typeof id === "string" && id.length > 0 ? id : null;
}

function refresh(id: string): void {
  revalidatePath("/");
  revalidatePath(`/requests/${id}`);
}

/**
 * The owner's one-click decision on an ASK: approve (engine re-checks), then
 * execute immediately. If the approval is refused (a hard constraint no longer
 * holds) no payment is attempted.
 */
export async function approveAndPayRequest(formData: FormData): Promise<void> {
  const id = readId(formData);
  if (!id) return;

  const owner = await verifyOwner();
  const service = getService();
  const approval = await service.approve(id, owner.email);
  refresh(id);

  if (approval.record.status === "APPROVED") {
    await service.pay(id, { reconcilePending: true });
    refresh(id);
  }

  redirect(`/requests/${id}`);
}

/** Reject a pending request. Rejection is final. */
export async function declineRequest(formData: FormData): Promise<void> {
  const id = readId(formData);
  if (!id) return;

  const owner = await verifyOwner();
  await getService().reject(id, owner.email);
  refresh(id);
  redirect(`/requests/${id}`);
}

/**
 * Execute an already-approved request (also the retry path after a provider
 * failure). The core re-gates it immediately before paying.
 */
export async function payRequest(formData: FormData): Promise<void> {
  const id = readId(formData);
  if (!id) return;

  await verifyOwner();
  await getService().pay(id, { reconcilePending: true });
  refresh(id);
  redirect(`/requests/${id}`);
}

/** Re-check a pending capture with the provider. Read-only; never re-pays. */
export async function reconcileRequest(formData: FormData): Promise<void> {
  const id = readId(formData);
  if (!id) return;

  await verifyOwner();
  await getService().reconcile(id);
  refresh(id);
  redirect(`/requests/${id}`);
}
