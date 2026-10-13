"use client";

import Link from "next/link";

import type { PurchaseRecord } from "@/core/purchases";
import { money } from "@/lib/format";
import { currencySymbol, gateCardStatus, sourcePhrase } from "@/lib/gateCard";
import { latestEvaluation } from "@/lib/vocab";

import { Age } from "./age";

/**
 * One request as a queue column (canon §10).
 *
 * A column on open ground with a thin left rule (accent while it needs you),
 * never a box. Top line: the status mark with its breathing dot and a live
 * elapsed time. Then the payee, what it is, what it costs, and either the two
 * decisions or the settled line with its receipt. The last element sits on the
 * shared bottom edge of the row of columns, so all columns end together.
 *
 * The card is presentational: it reads a record plus the small amount of local
 * state the board owns (is a decision in flight, did it fail) and reports
 * clicks upward. The board does the talking to the server.
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

  // What the elapsed time counts from: created while waiting, the owner's
  // decision (or the engine's last word) once settled.
  const lastEval = latestEvaluation(record.evaluations);
  const ageSince = needsYou
    ? record.createdAt
    : (record.approval?.approvedAt ??
      record.rejection?.rejectedAt ??
      lastEval?.evaluatedAt ??
      record.createdAt);

  const toneClass =
    status.tone === "allow" ? "t-allow" : status.tone === "deny" ? "t-deny" : "t-ask";

  return (
    <article
      className={`col${needsYou ? " needs" : ""}${entering ? " enter" : ""}`}
      aria-busy={working || undefined}
    >
      <span className="status">
        <span className="lab">
          <span
            className={`gdot${status.tone === "allow" ? " ok" : status.tone === "deny" ? " no" : ""}${needsYou ? " pulse" : ""}`}
          />
          <span className={`cap ${toneClass}`}>{working ? "Authorizing" : status.mark}</span>
        </span>
        <Age since={ageSince} kind={needsYou ? "waiting" : "settled"} />
      </span>

      <h3>{record.request.payee}</h3>
      <p className="body">
        {record.request.category.toLowerCase()} · {record.request.purpose}
      </p>
      <p className="receiptline">{sourcePhrase(record.request.agentId)}</p>
      <div className="amount num">
        {sym.trim()}
        {money(record.request.amountMinor)}
      </div>

      {needsYou ? (
        <>
          <div className="grow" />
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={working}
              onClick={() => onDecide(record.id, "approve")}
            >
              Approve and pay
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-block"
              disabled={working}
              onClick={() => onDecide(record.id, "decline")}
            >
              Decline
            </button>
          </div>
          <Link className="link" href={`/requests/${record.id}`}>
            See the full case
          </Link>
        </>
      ) : (
        <>
          <p className="receiptline">
            {status.receipt}
            {refText ? <span> · {refText}</span> : null}
          </p>
          <div className="grow" />
          <Link className="link" href={`/requests/${record.id}`}>
            Open the record
          </Link>
        </>
      )}

      {working ? (
        <p className="receiptline">Talking to PayPal. Nothing moves until it answers.</p>
      ) : null}
      {failed ? (
        <p className="receiptline failed" role="status">
          That did not go through. Open the full case to try again.
        </p>
      ) : null}
    </article>
  );
}
