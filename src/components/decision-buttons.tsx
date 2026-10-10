"use client";

/**
 * Decision buttons with an honest "working" state.
 *
 * Approve and pay, or decline. While the server action runs (it re-checks the
 * rules and may call PayPal, which takes a moment) the pressed button shows a
 * plain working label and both are disabled so nothing double-submits. Success
 * is silent: the page reloads into the new state, and that is the confirmation.
 * No celebratory toast.
 */

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  approveAndPayRequest,
  declineRequest,
} from "@/app/(app)/requests/[id]/actions";

export function DecisionButtons({
  currency,
  amount,
}: {
  currency: string;
  amount: string;
}) {
  const { pending } = useFormStatus();
  const [choice, setChoice] = useState<"approve" | "decline" | null>(null);

  return (
    <>
      <button
        className="prime"
        type="submit"
        formAction={approveAndPayRequest}
        disabled={pending}
        onClick={() => setChoice("approve")}
      >
        {pending && choice === "approve" ? (
          "Approving and paying…"
        ) : (
          <>
            Approve and pay
            <span className="amt num">
              {currency} {amount}
            </span>
          </>
        )}
      </button>
      <button
        className="decline"
        type="submit"
        formAction={declineRequest}
        disabled={pending}
        onClick={() => setChoice("decline")}
      >
        {pending && choice === "decline" ? "Declining…" : "Decline"}
      </button>
    </>
  );
}

/**
 * A single-action submit button with the same honest working state, for the
 * "Pay" and "Check with PayPal again" forms.
 */
export function PendingButton({
  className,
  idle,
  busy,
}: {
  className: string;
  idle: ReactNode;
  busy: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}
