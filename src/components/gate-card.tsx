"use client";

import Link from "next/link";

import type { PurchaseRecord } from "@/core/purchases";
import { money } from "@/lib/format";
import { currencySymbol, gateCardStatus, sourcePhrase } from "@/lib/gateCard";

/**
 * One request as a decision card.
 *
 * A request that still needs the owner keeps its two actions in place; every
 * other card is settled and carries its stamp and its one-line receipt. The card
 * is presentational: it reads a record plus the small amount of local state the
 * board owns (is a decision in flight, did it fail) and reports clicks upward.
 * The board does the talking to the server.
 *
 * The arrival beat is the shared `.gcard.enter` animation, so a request looks the
 * same whether it was on the page at load or arrived while the owner watched.
 */
export function GateCard({
  record,
  entering,
  working,
  failed,
  refText,
  onDecide,
}: {
  record: PurchaseRecord;
  entering: boolean;
  working: boolean;
  failed: boolean;
  refText?: string;
  onDecide: (id: string, action: "approve" | "decline") => void;
}) {
  const status = gateCardStatus(record);
  const needsYou = status.kind === "needs-you";
  const sym = currencySymbol(record.request.currency);

  return (
    <article
      className={`gcard ${status.kind}${entering ? " enter" : ""}${working ? " working" : ""}`}
      aria-busy={working || undefined}
    >
      <div className="gcard-main">
        <div className="gcard-left">
          <div className="status-mark">
            <span
              className={`gdot${status.tone === "allow" ? " ok" : status.tone === "deny" ? " no" : ""}`}
            />
            {working ? "Authorizing" : status.mark}
          </div>
          <div className="seller">{record.request.payee}</div>
          <div className="what">
            {record.request.category.toLowerCase()} · {record.request.purpose}
          </div>
          <div className="why">{sourcePhrase(record.request.agentId)}</div>
        </div>
        <div className="gamount num">
          <span className="cur">{sym.trim()}</span>
          {money(record.request.amountMinor)}
        </div>
      </div>

      {needsYou ? (
        <div className="gcard-actions">
          <button
            type="button"
            className="gbtn primary"
            disabled={working}
            onClick={() => onDecide(record.id, "approve")}
          >
            Approve and pay
          </button>
          <button
            type="button"
            className="gbtn quiet"
            disabled={working}
            onClick={() => onDecide(record.id, "decline")}
          >
            Decline
          </button>
          <Link className="gcard-open" href={`/requests/${record.id}`}>
            See the full case
          </Link>
        </div>
      ) : (
        <div className="gverdict">
          {status.stamp ? (
            <span className={`gstamp ${status.stamp.tone}`}>{status.stamp.text}</span>
          ) : null}
          <div className="greceipt">
            {status.receipt}
            {refText ? <span className="ref"> · {refText}</span> : null}
          </div>
          <Link className="gcard-open" href={`/requests/${record.id}`}>
            See the full case
          </Link>
        </div>
      )}

      {working ? (
        <div className="greceipt working-line">
          Talking to PayPal. Nothing moves until it answers.
        </div>
      ) : null}
      {failed ? (
        <div className="greceipt failed-line" role="status">
          That did not go through. Open the full case to try again.
        </div>
      ) : null}
    </article>
  );
}
