"use client";

/**
 * Ask the assistant — the last column of the queue (canon §10, image-settled
 * 14 oct 2026: the assistant supports, the money leads).
 *
 * The manual-only proposal entry point, set as an open column like every
 * other: caption, underline field, one capsule button, and the honesty line
 * under it. A server action runs the proposal-only agent and returns to the
 * Gate; the button shows a working state while the model thinks so the screen
 * never feels dead. While the ask is in flight the button also raises a
 * module flag (`lib/askFlight`) that keeps the suggestion feed's heartbeat
 * quiet, so the answer's navigation lands immediately instead of fighting
 * poll requests (19 oct 2026).
 */

import Link from "next/link";
import { useEffect } from "react";
import { useFormStatus } from "react-dom";

import { proposeFromGate } from "@/app/(app)/actions";
import { setAskInFlight } from "@/lib/askFlight";

function SubmitButton() {
  const { pending } = useFormStatus();
  // From submission until the answer's navigation commits, the feed heartbeat
  // stays quiet (see lib/askFlight). The cleanup runs on every change and on
  // unmount, so a page swap mid-ask can never leave the flag stuck up.
  useEffect(() => {
    setAskInFlight(pending);
    return () => setAskInFlight(false);
  }, [pending]);
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? "Asking…" : "Ask the assistant"}
    </button>
  );
}

export function AskBox({
  message,
  trustOn = false,
}: {
  message: { text: string; error: boolean } | null;
  /**
   * AI authorization on: the honesty lines must not claim every purchase
   * waits, because an exact list match pays on its own. Off (the default)
   * keeps the standing lines verbatim.
   */
  trustOn?: boolean;
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
      <p className="hint">
        {trustOn
          ? "It only proposes. Your rules decide: the exact items on your list can pay on their own, and everything else waits for you."
          : "It only proposes. Nothing is bought until you approve."}
      </p>
      <p className="hint">
        The order it checks: 1 valid request · 2 positive amount · 3 right currency · 4 allowed
        category · 5 monthly limit · 6 {trustOn ? "your list, then you" : "your approval"}. See{" "}
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
