import Link from "next/link";
import {
  fmtClock,
  fmtClockUTC,
  money,
  shortFingerprint,
  shortId,
  shortRef,
} from "@/lib/format";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";
import {
  chipFor,
  isReserved,
  latestEvaluation,
  reasonPhrase,
  stateWord,
} from "@/lib/vocab";
import type { PurchaseRecord } from "@/core/purchases";
import type { SpendingEvent } from "@/core/spending";

// The register is the current state of the durable ledger — read fresh.
export const dynamic = "force-dynamic";

/** The one-line outcome in the register's shorthand. */
function outcomeText(record: PurchaseRecord): string {
  switch (record.status) {
    case "PENDING_APPROVAL":
      return `awaiting · since ${fmtClock(record.createdAt)}`;
    case "APPROVED":
      return "executing";
    case "AUTHORIZED":
      return "ready · automatic";
    case "PENDING_SETTLEMENT":
      return "settling";
    case "EXECUTED":
      return "captured · verified once";
    case "REJECTED":
      return "rejected · by owner";
    case "DENIED":
      return "closed";
  }
}

/**
 * The decision trail, rebuilt from the record's own evaluations — not a display
 * guess. It reads proposal verdict → what the owner did → where it landed.
 */
function Trail({ record }: { record: PurchaseRecord }) {
  const first = record.evaluations[0];
  const ruling = latestEvaluation(record.evaluations);
  const firstDecision = first?.decision.decision ?? null;
  const reasonCode = ruling?.decision.reasonCode ?? null;

  if (record.status === "DENIED") {
    return (
      <>
        <span className="d">deny</span> · {reasonCode ? reasonPhrase(reasonCode) : "denied"} ·
        engine, hard
      </>
    );
  }

  if (record.status === "REJECTED") {
    return (
      <>
        {firstDecision === "ASK" ? (
          <span className="a">ask</span>
        ) : (
          <span className="g">allow</span>
        )}{" "}
        {first ? fmtClock(first.evaluatedAt) : ""} → reject · owner{" "}
        {record.rejection ? fmtClock(record.rejection.rejectedAt) : "—"}
      </>
    );
  }

  if (record.status === "PENDING_APPROVAL") {
    return (
      <>
        <span className="a">ask</span> · {reasonCode ? reasonPhrase(reasonCode) : "approval"} ·
        awaiting you
      </>
    );
  }

  if (firstDecision === "ASK" && record.approval) {
    return (
      <>
        <span className="a">ask</span> {first ? fmtClock(first.evaluatedAt) : ""} →{" "}
        <span className="g">allow</span> owner {fmtClock(record.approval.approvedAt)}
        {record.status === "EXECUTED"
          ? " · captured"
          : record.status === "PENDING_SETTLEMENT"
            ? " · capture pending"
            : " · rechecks pass"}
      </>
    );
  }

  // The engine allowed it at proposal (no human involved) — or an approval is
  // still pending execution.
  return (
    <>
      <span className="g">allow</span> · within limits ·{" "}
      {record.status === "EXECUTED"
        ? "captured"
        : record.status === "PENDING_SETTLEMENT"
          ? "capture pending"
          : record.status === "AUTHORIZED" || record.status === "APPROVED"
            ? "automatic"
            : stateWord(record.status)}
    </>
  );
}

export default async function RecordPage() {
  await verifyOwner();

  const service = getService();
  const [budget, records, events] = await Promise.all([
    service.budget(),
    service.list(),
    service.allEvents(),
  ]);

  // Newest first, by filing time.
  const ordered = records
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // One capture ref per request (a verified capture is counted exactly once).
  const captureByRequest = new Map<string, SpendingEvent>();
  for (const event of events) {
    if (event.kind === "CAPTURE_VERIFIED") captureByRequest.set(event.requestId, event);
  }

  const cap = budget.rules?.monthlyCapMinor ?? null;
  const captured = budget.spentThisMonthMinor;
  const reserved = records
    .filter((r) => isReserved(r.status))
    .reduce((sum, r) => sum + r.request.amountMinor, 0);
  const headroom = cap === null ? null : Math.max(cap - captured - reserved, 0);

  const awaiting = records.filter((r) => r.status === "PENDING_APPROVAL").length;
  const executing = records.filter(
    (r) => r.status === "APPROVED" || r.status === "AUTHORIZED",
  ).length;
  const settling = records.filter((r) => r.status === "PENDING_SETTLEMENT").length;
  const outstanding = awaiting + executing + settling;

  const day = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(" ", " ");
  const snapshot = fmtClockUTC(new Date().toISOString());

  return (
    <>
      <section className="page-head">
        <div>
          <div className="ref">Record · audit register · {day}</div>
          <h1>Everything the gate decided, in order.</h1>
        </div>
        <span className="count num">
          {records.length} requests · all verdicts · snapshot {snapshot}
        </span>
      </section>

      <div className="integrity">
        <span className="it num">
          <em>hard cap</em>
          {cap === null ? "no rules — nothing can be authorized" : `${money(cap)} · no override`}
        </span>
        <span className="it num">
          <em>counting</em>verified captures only
        </span>
        <span className="it num">
          <em>engine</em>deterministic · no approvals from the model
        </span>
        <span className="it num">
          <em>record</em>written once · approved once · re-read only
        </span>
      </div>

      <section className="record">
        <div className="colhead">
          <span>Request</span>
          <span>Payee / purpose</span>
          <span>Decision trail</span>
          <span className="amt">Amount</span>
          <span>Outcome</span>
          <span>Proof</span>
        </div>

        {ordered.map((record) => {
          const ruling = latestEvaluation(record.evaluations);
          const decision = ruling?.decision.decision ?? null;
          const chip = chipFor(decision, record.status);
          const capture = captureByRequest.get(record.id);

          return (
            <div className="row" key={record.id}>
              <div className="t num">
                <Link href={`/requests/${record.id}`} className="id">
                  {shortId(record.id)}
                </Link>
                <time>{fmtClock(record.createdAt)}</time>
              </div>
              <div className="who">
                <Link href={`/requests/${record.id}`} className="payee">
                  {record.request.payee}
                </Link>
                <div className="purpose">
                  {record.request.category.toLowerCase()} · {record.request.purpose}
                </div>
              </div>
              <div className="trail num">
                <Trail record={record} />
              </div>
              <div className="amt num">
                <span className="cur">{record.request.currency}</span>
                {money(record.request.amountMinor)}
              </div>
              <div className="outcome">
                {chip ? (
                  <span className={`chip ${chip.className}`}>{chip.label}</span>
                ) : null}
                <span className="state">{outcomeText(record)}</span>
              </div>
              <div className="proof num">
                {capture ? (
                  <>
                    ref <span className="ref">{shortRef(capture.providerRef ?? capture.id)}</span>
                    <br />
                  </>
                ) : null}
                fp {shortFingerprint(record.fingerprint)}
              </div>
            </div>
          );
        })}

        {ordered.length === 0 ? (
          <div className="row">
            <div className="who">
              <div className="payee">No requests yet</div>
              <div className="purpose">
                the register is empty — the agent has proposed nothing
              </div>
            </div>
          </div>
        ) : null}

        <div className="totals num">
          <span>
            {records.length} requests · {outstanding} outstanding{" "}
            <b>
              ({awaiting} awaiting · {executing} executing)
            </b>
          </span>
          <span>
            captured <b>{money(captured)}</b> · reserved <b>{money(reserved)}</b> · cap{" "}
            <b>{cap === null ? "—" : money(cap)}</b> · headroom{" "}
            <b className="hl">{headroom === null ? "—" : money(headroom)}</b>
          </span>
        </div>
      </section>

      <div className="note">
        Live sandbox data · rule set {budget.rules?.ruleVersion ?? "none"} · every row is immutable
        once written · the register re-reads the ledger on every load
      </div>
    </>
  );
}
