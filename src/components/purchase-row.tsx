import Link from "next/link";

import type { PurchaseRecord } from "@/core/purchases";
import { displayId, fmtClock, money } from "@/lib/format";
import { checkText, checkTextForStatus, chipFor, latestEvaluation } from "@/lib/vocab";

/**
 * One line of the register, shared by the server-rendered ledger and the live
 * feed so a request looks identical whether it was already on the page or just
 * arrived. Pure: it reads only the record and the display vocabulary.
 *
 * `entering` runs the one arrival animation (transform + opacity, honouring
 * reduced motion via the global rule). React keys by record id, so the node
 * only animates the first time it appears; later re-renders reuse it in place.
 */
export function PurchaseRow({
  record,
  entering = false,
}: {
  record: PurchaseRecord;
  entering?: boolean;
}) {
  const latest = latestEvaluation(record.evaluations);
  const decision = latest?.decision.decision ?? null;
  const chip = chipFor(decision, record.status);
  const pendingRow = record.status === "PENDING_APPROVAL";

  return (
    <div className={entering ? "row row-enter" : "row"}>
      <Link
        className="row-hit"
        href={`/requests/${record.id}`}
        aria-label={`Open this purchase: ${record.request.payee}`}
      />
      <div className="t num">
        <span className="id">{displayId(record.id)}</span>
        {/* Times are local; the server and the browser can sit in different
            zones, so let the browser's reading stand without a mismatch warning. */}
        <time suppressHydrationWarning>{fmtClock(record.createdAt)}</time>
      </div>
      <div className="who">
        <div className="payee">{record.request.payee}</div>
        <div className="purpose">
          {record.request.category.toLowerCase()} · {record.request.purpose}
        </div>
      </div>
      <div className="check">
        {record.status === "PENDING_APPROVAL" || record.status === "DENIED"
          ? latest
            ? checkText(latest.decision.decision, latest.decision.reasonCode)
            : checkTextForStatus(record.status)
          : checkTextForStatus(record.status)}
      </div>
      <div className="amt num">
        <span className="cur">{record.request.currency}</span>
        {money(record.request.amountMinor)}
      </div>
      <div className="status">
        {chip ? (
          <span className={`chip ${chip.className}`}>{chip.label}</span>
        ) : (
          <span className="muted">you said no</span>
        )}
      </div>
      {pendingRow ? (
        <Link className="act" href={`/requests/${record.id}`}>
          Decide
        </Link>
      ) : (
        <span className="open-link">Open</span>
      )}
    </div>
  );
}
