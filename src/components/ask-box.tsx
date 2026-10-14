"use client";

/**
 * Ask the assistant — the last column of the queue (canon §10, image-settled
 * 14 oct 2026: the assistant supports, the money leads).
 *
 * The manual-only proposal entry point, set as an open column like every
 * other: caption, underline field, one capsule button, and the honesty line
 * under it. A server action runs the proposal-only agent and returns to the
 * Gate; the button shows a working state while the model thinks so the screen
 * never feels dead.
 */

import Link from "next/link";
import { useFormStatus } from "react-dom";

import { proposeFromGate } from "@/app/(app)/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? "Asking…" : "Ask the assistant"}
    </button>
  );
}

export function AskBox({
  message,
}: {
  message: { text: string; error: boolean } | null;
}) {
  return (
    <form className="col ask" action={proposeFromGate}>
      <label className="sec" htmlFor="ask">
        Ask the assistant
      </label>
      <input
        id="ask"
        name="request"
        placeholder="for example: a $20 gardening book"
        autoComplete="off"
        required
      />
      <div className="grow" />
      <div className="actions">
        <SubmitButton />
      </div>
      <p className="hint">It only proposes. Nothing is bought until you approve.</p>
      <p className="hint">
        The order it checks: 1 valid request · 2 positive amount · 3 right currency · 4 allowed
        category · 5 monthly limit · 6 your approval. See{" "}
        <Link href="/statute">your rules</Link>.
      </p>
      {message ? (
        <p className={message.error ? "msg err" : "msg"} role="status">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
