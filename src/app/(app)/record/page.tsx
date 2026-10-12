import Link from "next/link";
import {
  fmtClock,
  fmtClockUTC,
  money,
  shortId,
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
      return `waiting on you · since ${fmtClock(record.createdAt)}`;
    case "APPROVED":
      return "paying";
    case "AUTHORIZED":
      // Legacy state: older rules cleared it without asking. It cannot pay
      // like this anymore; the gate re-checks and asks first.
      return "from older rules · needs a re-check";
    case "PENDING_SETTLEMENT":
      return "confirming";
    case "EXECUTED":
      return "paid · confirmed";
    case "REJECTED":
      return "you said no";
    case "DENIED":
      return "refused";
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
        <span className="d">refused</span> · {reasonCode ? reasonPhrase(reasonCode) : "refused"} ·
        by your rules
      </>
    );
  }

  if (record.status === "REJECTED") {
    return (
      <>
        {firstDecision === "ASK" ? (
          <span className="a">needs you</span>
        ) : (
          <span className="g">allowed</span>
        )}{" "}
        {first ? fmtClock(first.evaluatedAt) : ""} → you said no{" "}
        {record.rejection ? fmtClock(record.rejection.rejectedAt) : ""}
      </>
    );
  }

  if (record.status === "PENDING_APPROVAL") {
    return (
      <>
        <span className="a">needs you</span> · {reasonCode ? reasonPhrase(reasonCode) : "your okay"} ·
        waiting on you
      </>
    );
  }

  if (firstDecision === "ASK" && record.approval) {
    return (
      <>
        <span className="a">needs you</span> {first ? fmtClock(first.evaluatedAt) : ""} →{" "}
        <span className="g">you approved</span> {fmtClock(record.approval.approvedAt)}
        {record.status === "EXECUTED"
          ? " · paid"
          : record.status === "PENDING_SETTLEMENT"
            ? " · confirming"
            : " · checked again"}
      </>
    );
  }

  // Legacy trail: the rules allowed it at proposal, back when small purchases
  // could skip the owner. Option 1 ended that, so this branch only ever
  // describes older records, and it says so plainly. If one was later demoted
  // and approved by hand, the approval is shown too.
  return (
    <>
      <span className="g">allowed</span> · within your limits
      {record.approval ? (
        <> → <span className="g">you approved</span> {fmtClock(record.approval.approvedAt)}</>
      ) : null}{" "}
      · {record.status === "EXECUTED"
        ? "paid"
        : record.status === "PENDING_SETTLEMENT"
          ? "confirming"
          : record.status === "AUTHORIZED"
            ? "from older rules · needs a re-check"
            : stateWord(record.status)}
    </>
  );
}

export default async function RecordPage() {
  const owner = await verifyOwner();

  const service = getService(owner.userId);
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
      <section className="page-head reveal" style={{ "--i": 0 } as React.CSSProperties}>
        <div>
          <div className="ref">Your record · every decision · {day}</div>
          <h1>Every purchase, and how it turned out.</h1>
        </div>
        <span className="count num">
          {records.length} purchases · every decision · as of {snapshot}
        </span>
      </section>

      <div className="integrity reveal" style={{ "--i": 1 } as React.CSSProperties}>
        <span className="it num">
          <em>your limit</em>
          {cap === null ? "no rules yet, so nothing can be approved" : `${money(cap)} · can't be raised`}
        </span>
        <span className="it num">
          <em>counting</em>confirmed payments only
        </span>
        <span className="it num">
          <em>decisions</em>by your rules, never by the app
        </span>
        <span className="it num">
          <em>record</em>saved once · never edited
        </span>
      </div>

      <section className="record reveal" style={{ "--i": 2 } as React.CSSProperties}>
        {ordered.length > 0 ? (
          <div className="colhead">
            <span>When</span>
            <span>Who it&apos;s for</span>
            <span>What happened</span>
            <span className="amt">Amount</span>
            <span>Where it stands</span>
            <span>Proof</span>
          </div>
        ) : null}

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
                    ref <span className="ref full">{capture.providerRef ?? capture.id}</span>
                    <br />
                  </>
                ) : null}
                seal <span className="full">{record.fingerprint}</span>
              </div>
            </div>
          );
        })}

        {ordered.length === 0 ? (
          <div className="empty">
            <h2>Nothing recorded yet.</h2>
            <p>
              Once the assistant suggests a purchase and it is decided, the full
              history lands here. This page is your paper trail: every decision, who
              made it, and when.
            </p>
            <Link href="/" className="next">
              Go to your purchases to ask the assistant about one.
            </Link>
          </div>
        ) : null}

        {ordered.length > 0 ? (
          <div className="totals num">
            <span>
              {records.length} purchases · {outstanding} still in progress{" "}
              <b>
                ({awaiting} waiting on you · {executing} paying)
              </b>
            </span>
            <span>
              spent <b>{money(captured)}</b> · set aside <b>{money(reserved)}</b> · limit{" "}
              <b>{cap === null ? "none" : money(cap)}</b> · left{" "}
              <b className="hl">{headroom === null ? "none" : money(headroom)}</b>
            </span>
          </div>
        ) : null}
      </section>

      <div className="note reveal" style={{ "--i": 3 } as React.CSSProperties}>
        Live sandbox data · your rules {budget.rules?.ruleVersion ?? "none"} · every row is
        saved once and never edited · this page reads the record fresh each time
      </div>
    </>
  );
}
