"use client";

/**
 * Ask the assistant — the manual-only proposal entry point on the Gate.
 *
 * The owner types what they want looked at; a server action runs the
 * proposal-only agent and returns to the Gate. Shows a working state while the
 * model thinks so the screen never feels dead.
 */

import Link from "next/link";
import { useFormStatus } from "react-dom";

import { proposeFromGate } from "@/app/(app)/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
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
    <form className="askbox" action={proposeFromGate}>
      <label htmlFor="ask">Ask the assistant to look at a purchase</label>
      <div className="line">
        <input
          id="ask"
          name="request"
          placeholder="for example: a $20 gardening book from Book Depository"
          autoComplete="off"
          required
        />
        <SubmitButton />
      </div>
      <p className="hint">
        The assistant only proposes. Your rules decide, and you approve anything that needs it.
      </p>
      <p className="hint checks">
        The order it checks: 1 valid request · 2 positive amount · 3 right currency · 4 allowed
        category · 5 monthly limit · 6 auto-approve line · 7 known seller · 8 allow. See{" "}
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
