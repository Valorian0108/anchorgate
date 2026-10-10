import Link from "next/link";
import { notFound } from "next/navigation";
import { approveAndPayRequest, payRequest, reconcileRequest } from "./actions";
import { displayId, fmtClock, money, shortRef } from "@/lib/format";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";
import { chipFor, decisionWord, isReserved, latestEvaluation, reasonPhrase } from "@/lib/vocab";
import { DecisionButtons, PendingButton } from "@/components/decision-buttons";
import type { ReasonCode } from "@/core/authorization";
import type { PurchaseRecord, RequestStatus } from "@/core/purchases";
import type { SpendingEvent } from "@/core/spending";

export const dynamic = "force-dynamic";

/* The engine's documented decision order, mirrored for display rows.
   The failing reason code tells us which row is the verdict row; every row
   before it passes, every row after it was never reached. This keeps the
   on-screen check faithful to the engine instead of a display re-implementation. */
const REASON_POSITION: Partial<Record<ReasonCode, number>> = {
  INVALID_REQUEST: 1,
  INVALID_AMOUNT: 2,
  CURRENCY_MISMATCH: 3,
  CATEGORY_NOT_PERMITTED: 4,
  MONTHLY_CAP_EXCEEDED: 5,
  PER_PURCHASE_LIMIT_EXCEEDED: 6,
  APPROVAL_REQUIRED: 7,
};

interface Row {
  rule: string;
  det: string;
  verdict: "pass" | "ask" | "deny" | "nr";
}

async function buildRows(args: {
  record: PurchaseRecord;
  rulesCapture: number | null;
  rulesCurrency: string | null;
  rulesCategories: string[];
  perPurchaseLimit: number | null;
  spentMinor: number;
  knownPayees: Set<string>;
}): Promise<{ rows: Row[]; failing: number | null }> {
  const { record, rulesCapture, rulesCurrency, rulesCategories, perPurchaseLimit, spentMinor, knownPayees } = args;
  const ruling = latestEvaluation(record.evaluations);
  const decision = ruling?.decision.decision ?? null;
  const reasonCode = ruling?.decision.reasonCode ?? null;
  const amount = record.request.amountMinor;
  const currency = record.request.currency;

  if (rulesCapture === null) {
    return {
      rows: [{
        rule: "Your rules",
        det: "no rules are set yet, so nothing can be approved",
        verdict: "deny",
      }],
      failing: 0,
    };
  }

  const failing = reasonCode ? (REASON_POSITION[reasonCode] ?? null) : null;
  const bench = (idx: number): Row["verdict"] => {
    if (failing === null) return "pass";
    if (idx < failing) return "pass";
    if (idx === failing) return decision === "ASK" ? "ask" : "deny";
    return "nr";
  };

  const rows: Row[] = [
    {
      rule: "The currency matches your rules",
      det: `${currency} · your rules allow ${rulesCurrency ?? "nothing"}`,
      verdict: bench(3),
    },
    {
      rule: "It is an allowed category",
      det: `${record.request.category} · your list: ${rulesCategories.join(", ") || "empty, so nothing is allowed"}`,
      verdict: bench(4),
    },
    {
      rule: "There is room under your monthly limit",
      det:
        record.status === "EXECUTED"
          ? `${money(spentMinor)} of ${money(rulesCapture)} used · already counted`
          : `${money(spentMinor + amount)} of ${money(rulesCapture)} would be used · counts once confirmed`,
      verdict: bench(5),
    },
    {
      rule: "It is under your auto-approve amount",
      det: `${money(amount)} · your auto line is ${money(perPurchaseLimit ?? 0)}`,
      verdict: bench(6),
    },
    {
      rule: "You have paid this seller before",
      det: `${record.request.payee} is ${knownPayees.has(record.request.payee) ? "a seller you know" : "a new seller, so it needs your okay"}`,
      verdict: bench(7),
    },
  ];

  return { rows, failing };
}

const H = {
  PENDING_APPROVAL: "This purchase is <pay>waiting on you.</pay>",
  APPROVED: "You approved this. <pay>It is on the record.</pay>",
  AUTHORIZED: "Ready to pay. <pay>It is within your limits.</pay>",
  PENDING_SETTLEMENT: "Paying now. <pay>Confirming with PayPal.</pay>",
  EXECUTED: "<pay>Paid, and on the record.</pay>",
  REJECTED: "You declined this. <pay>Nothing was paid.</pay>",
  DENIED: "Your rules said no. <pay>Not the app, your rules.</pay>",
} as const;

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await verifyOwner();
  const { id } = await params;
  const service = getService();

  const record = await service.get(id);
  if (!record) notFound();

  const [budget, records, events] = await Promise.all([
    service.budget(),
    service.list(),
    service.eventsByRequest(id),
  ]);

  const rules = budget.rules;
  const cap = rules?.monthlyCapMinor ?? null;
  const captured = budget.spentThisMonthMinor;
  const reserved = records
    .filter((r) => isReserved(r.status) && r.id !== id)
    .reduce((sum, r) => sum + r.request.amountMinor, 0);
  const headroom = cap === null ? null : Math.max(cap - captured - reserved, 0);

  const knownPayees = new Set(
    records
      .filter((r) => r.status === "APPROVED" || r.status === "EXECUTED")
      .map((r) => r.request.payee),
  );

  const ruling = latestEvaluation(record.evaluations);
  const decision = ruling?.decision.decision ?? null;
  const reasonCode = ruling?.decision.reasonCode ?? null;
  const firstEval = record.evaluations[0];

  const now = await service.evaluateNow(record.request);

  const { rows } = await buildRows({
    record,
    rulesCapture: cap,
    rulesCurrency: rules?.currency ?? null,
    rulesCategories: rules?.permittedCategories ?? [],
    perPurchaseLimit: rules?.perPurchaseAutoLimitMinor ?? null,
    spentMinor: captured,
    knownPayees,
  });

  const captureEvent: SpendingEvent | undefined = events.find(
    (e) => e.kind === "CAPTURE_VERIFIED",
  );
  const pendingEvent: SpendingEvent | undefined = [...events]
    .reverse()
    .find((e) => e.kind === "CAPTURE_PENDING");
  const captureFailedEvent: SpendingEvent | undefined = [...events]
    .reverse()
    .find((e) => e.kind === "CAPTURE_FAILED");
  const captureRefEvent = captureEvent ?? pendingEvent;
  const approval = record.approval;
  const rejection = record.rejection;
  const preExecEval = record.evaluations
    .slice()
    .reverse()
    .find((e) => e.context === "PRE_EXECUTION");

  const day = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(" ", " ");

  const headline = H[record.status as keyof typeof H] ?? H.PENDING_APPROVAL;
  const status = record.status;

  return (
    <>
      <Link href="/" className="back reveal" style={{ "--i": 0 } as React.CSSProperties}>
        ← Back to your purchases
      </Link>

      {/* case header */}
      <section className="case-head reveal" style={{ "--i": 1 } as React.CSSProperties}>
        <div>
          <div className="ref num">Purchase · {displayId(id)} · {day}</div>
          <h1
            dangerouslySetInnerHTML={{
              __html: headline.replace(
                "<pay>",
                "<span class='pay'>",
              ).replace(
                "</pay>",
                "</span>",
              ),
            }}
          />
        </div>
        <div className="meta num">
          {chipFor(decision, status) ? (
            <span className={`chip ${chipFor(decision, status)!.className}`}>
              {chipFor(decision, status)!.label}
            </span>
          ) : (
            <span className="waiting">you said no</span>
          )}
          {status === "PENDING_APPROVAL" ? (
            <>
              <span className="waiting num">waiting on you · since <span className="open-ask">{fmtClock(record.createdAt)}</span></span>
              <span className="waiting num">suggested by <span className="open-ask">the assistant</span></span>
            </>
          ) : status === "EXECUTED" ? (
            <>
              <span className="waiting num">you approved <span className="open-allow">{approval ? fmtClock(approval.approvedAt) : ""}</span> · by {approval?.approvedBy ?? "owner"}</span>
              <span className="waiting num">paid {fmtClock(captureEvent?.occurredAt ?? record.createdAt)} · confirmed</span>
            </>
          ) : (
            <>
              <span className="waiting num">{stateWordLine(status)}</span>
              <span className="waiting num">suggested by the assistant</span>
            </>
          )}
        </div>
      </section>

      {/* file + rail */}
      <div className="body reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <div>
          {/* the facts */}
          <section className="facts">
            <div className="label">The details</div>
            <div className="frow"><span className="k">seller</span><span className="v num">{record.request.payee}</span></div>
            <div className="frow"><span className="k">what it&apos;s for</span><span className="v">{record.request.category.toLowerCase()} · {record.request.purpose}</span></div>
            <div className="frow"><span className="k">category</span><span className="v">{record.request.category}</span></div>
            <div className="frow"><span className="k">amount</span><span className="v num">{record.request.currency} {money(record.request.amountMinor)}</span></div>
            <div className="frow"><span className="k">currency</span><span className="v">{record.request.currency}</span></div>
            <div className="frow"><span className="k">assistant</span><span className="v">{record.request.agentId}</span></div>
            {approval ? (
              <div className="frow"><span className="k">approved by</span><span className="v num">{approval.approvedBy} · {fmtClock(approval.approvedAt)}</span></div>
            ) : null}
            {rejection ? (
              <div className="frow"><span className="k">declined by</span><span className="v num">{rejection.rejectedBy} · {fmtClock(rejection.rejectedAt)}</span></div>
            ) : null}
            {captureRefEvent ? (
              <div className="frow">
                <span className="k">payment ref</span>
                <span className="v num">
                  <span className="fp">{shortRef(captureRefEvent.providerRef ?? captureRefEvent.id)}</span>{" "}
                  <span className="fp">(PayPal{captureEvent ? "" : " · pending"} · full copy in the record)</span>
                </span>
              </div>
            ) : null}
            <div className="frow">
              <span className="k">fingerprint</span>
              <span className="v num">
                <span className="fp">{record.fingerprint.slice(0, 8)}…{record.fingerprint.slice(-4)}</span>{" "}
                <span className="fp">(full copy in the record)</span>
              </span>
            </div>
          </section>

          {/* the check */}
          <section className="check">
            <div className="label">
              The checks · run again when you approve, and again before it pays
            </div>

            {rows.map((row) => (
              <div className="crow" key={row.rule}>
                <div>
                  <div className="rule">{row.rule}</div>
                  <div className="det num">{row.det}</div>
                </div>
                <span className={`result num ${row.verdict === "pass" ? "pass" : row.verdict === "ask" ? "ask-x" : row.verdict === "deny" ? "deny" : "nr"}`}>
                  {row.verdict === "nr" ? "not reached" : row.verdict === "ask" ? "needs you" : row.verdict === "deny" ? "no" : "yes"}
                </span>
              </div>
            ))}

            <div className="verdict">
              <span className="label">The decision</span>
              <span className="vd num">
                <b>{ruling ? decisionWord(ruling.decision.decision) : "none yet"}</b>
                {ruling ? ` · ${reasonPhrase(ruling.decision.reasonCode)}` : ""} · your rules {ruling?.decision.ruleVersion ?? rules?.ruleVersion ?? "none"}
              </span>
            </div>
            <div className="story num">
              Checked again just now at {fmtClock(new Date().toISOString())}: <b>{decisionWord(now.decision)}</b> · {reasonPhrase(now.reasonCode)}. Your rules are checked fresh every time.
            </div>
            {approval && firstEval && ruling && firstEval.decision.decision !== ruling.decision.decision ? (
              <div className="story num">
                When first suggested it read {decisionWord(firstEval.decision.decision)} · {reasonPhrase(firstEval.decision.reasonCode)}. Now it reads {decisionWord(ruling.decision.decision)} · {reasonPhrase(ruling.decision.reasonCode)}. The situation changed and you approved it. No rule was bypassed.
              </div>
            ) : null}
          </section>
        </div>

        {/* right rail: decision slip or closed box */}
        <aside>
          {status === "PENDING_APPROVAL" ? (
            <form action={approveAndPayRequest} className="slip">
              <input type="hidden" name="id" value={id} />
              <h2 className="slip-title">Your decision</h2>
              <p className="slip-sub">Only you can decide this one. The app never approves on its own.</p>
              <DecisionButtons
                currency={record.request.currency}
                amount={money(record.request.amountMinor)}
              />
              <div className="note">
                <span className="k">Double-check:</span> everything is checked again before it becomes final.<br />
                <span className="k">Your limit:</span> {rules ? money(cap ?? 0) : "none"} is a hard ceiling. No approval can go over it.<br />
                <span className="k">Payment:</span> charged to your saved card through PayPal Sandbox.<br />
                <span className="k">Counting:</span> it only counts against your limit once PayPal confirms it.
              </div>
              <div className="posture">
                <div className="pro">Where you stand</div>
                <div className="pl num"><span>spent</span><b>{money(captured)}</b></div>
                <div className="pl num"><span>set aside</span><b>{money(reserved)}</b></div>
                <div className="pl num"><span>left</span><b className="hl">{money(headroom ?? 0)}</b></div>
              </div>
            </form>
          ) : status === "EXECUTED" ? (
            <div className="stampbox">
              <div className="stampwrap">
                <span className="stamp">
                  <span className="sw">allowed</span>
                  <span className="sd">AnchorGate · {day} · No. {displayId(id)}</span>
                </span>
              </div>
              <div className="what">Nothing else to do.</div>
              <div className="rows allowrows">
                <div className="pl num"><span>approved by</span><b>{approval?.approvedBy ?? "owner"} · {approval ? fmtClock(approval.approvedAt) : ""}</b></div>
                <div className="pl num"><span>checked when you approved</span><b>yes</b></div>
                <div className="pl num"><span>checked before paying</span><b>{preExecEval ? "yes" : "not needed"}</b></div>
                <div className="pl num"><span>paid and confirmed</span><b>{captureEvent ? fmtClock(captureEvent.occurredAt) : "pending"}</b></div>
                <div className="pl num"><span>counted once</span><b>yes</b></div>
              </div>
              <Link href="/record" className="rec">See it in the record →</Link>
            </div>
          ) : status === "APPROVED" || status === "AUTHORIZED" ? (
            <div className="stampbox">
              <div className="what">Approved. Ready to pay.</div>
              <div className="rows">
                <div className="pl num"><span>approved by</span><b>{approval?.approvedBy ?? "owner"} · {approval ? fmtClock(approval.approvedAt) : ""}</b></div>
                <div className="pl num"><span>checked when you approved</span><b>{record.evaluations.some((e) => e.context === "APPROVAL") ? "yes" : "not yet"}</b></div>
                <div className="pl num"><span>counted</span><b>not yet · it counts once PayPal confirms</b></div>
                {captureFailedEvent ? (
                  <div className="pl num"><span>last try</span><b>{captureFailedEvent.note ?? "PayPal declined it"}</b></div>
                ) : null}
              </div>
              <form action={payRequest}>
                <input type="hidden" name="id" value={id} />
                <PendingButton
                  className="prime"
                  busy="Paying…"
                  idle={
                    <>
                      {captureFailedEvent ? "Try payment again" : "Pay"}
                      <span className="amt num">{record.request.currency} {money(record.request.amountMinor)}</span>
                    </>
                  }
                />
              </form>
              <Link href="/" className="rec">Back to your purchases →</Link>
            </div>
          ) : status === "PENDING_SETTLEMENT" ? (
            <div className="stampbox">
              <div className="what">Paying now. Confirming with PayPal.</div>
              <div className="rows">
                <div className="pl num"><span>started</span><b>{pendingEvent ? fmtClock(pendingEvent.occurredAt) : ""}</b></div>
                <div className="pl num"><span>payment ref</span><b className="hl">{pendingEvent?.providerRef ? shortRef(pendingEvent.providerRef) : "pending"}</b></div>
                <div className="pl num"><span>counted</span><b>nothing yet · not until it confirms</b></div>
              </div>
              <form action={reconcileRequest}>
                <input type="hidden" name="id" value={id} />
                <PendingButton className="prime" busy="Checking…" idle="Check with PayPal again" />
              </form>
              <Link href="/" className="rec">Back to your purchases →</Link>
            </div>
          ) : status === "REJECTED" ? (
            <div className="stampbox">
              <div className="what">You declined this.</div>
              <div className="rows">
                <div className="pl num"><span>declined by</span><b>{rejection?.rejectedBy ?? "owner"}</b></div>
                <div className="pl num"><span>when</span><b>{rejection ? fmtClock(rejection.rejectedAt) : ""}</b></div>
                {rejection?.reason ? (
                  <div className="pl num"><span>reason</span><b>{rejection.reason}</b></div>
                ) : null}
              </div>
              <Link href="/" className="rec">Back to your purchases →</Link>
            </div>
          ) : (
            <div className="stampbox">
              <div className="what">Your rules said no.</div>
              <div className="rows">
                <div className="pl num"><span>why</span><b>{ruling ? reasonPhrase(ruling.decision.reasonCode) : "your rules said no"}</b></div>
                <div className="pl num"><span>your rules</span><b>{ruling?.decision.ruleVersion ?? rules?.ruleVersion ?? "none"}</b></div>
                <div className="pl num"><span>room left then</span><b>{money(Math.max((cap ?? 0) - captured, 0))}</b></div>
              </div>
              <Link href="/" className="rec">Back to your purchases →</Link>
            </div>
          )}
        </aside>
      </div>

      {/* receipt strip — the print moment */}
      <section className="receipt reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <div className="rh">Your receipt · purchase {displayId(id)} · {stateWordLine(status)}</div>

        <div className="st">
          <div className="sn">01 · Suggested</div>
          <div className="sv">
            The assistant suggested it
            <time>{fmtClock(record.createdAt)}</time>
          </div>
        </div>

        <div className="st">
          <div className="sn">02 · Decided</div>
          <div className="sv">
            {firstEval?.decision.decision === "ALLOW" ? "Your rules allowed it" : firstEval?.decision.decision === "DENY" ? "Your rules refused it" : "Your rules asked you first"}
            <time>{firstEval ? fmtClock(firstEval.evaluatedAt) : ""}</time>
          </div>
        </div>

        {status === "PENDING_APPROVAL" ? (
          <div className="st">
            <div className="sn">03 · Waiting on you</div>
            <div className="sv askb">
              no money has moved
              <time>open since {fmtClock(record.createdAt)}</time>
            </div>
          </div>
        ) : status === "APPROVED" || status === "AUTHORIZED" ? (
          <div className="st">
            <div className="sn">03 · Approved</div>
            <div className="sv">
              you approved it
              <time>{approval ? fmtClock(approval.approvedAt) : ""} · by {approval?.approvedBy ?? "owner"}</time>
            </div>
          </div>
        ) : status === "EXECUTED" ? (
          <div className="st">
            <div className="sn">03 · Sent to pay</div>
            <div className="sv">
              checked again · sent to PayPal
              <time>{preExecEval ? fmtClock(preExecEval.evaluatedAt) : ""}</time>
            </div>
          </div>
        ) : status === "DENIED" ? (
          <div className="st">
            <div className="sn">03 · Refused by your rules</div>
            <div className="sv askb">
              nothing moved, nothing counted
              <time>{ruling ? fmtClock(ruling.evaluatedAt) : ""}</time>
            </div>
          </div>
        ) : (
          <div className="st">
            <div className="sn">03 · {stateWordLine(status)}</div>
            <div className="sv">
              {rejection ? "you declined it" : "status recorded"}
              <time>{approval ? fmtClock(approval.approvedAt) : rejection ? fmtClock(rejection.rejectedAt) : fmtClock(record.createdAt)}</time>
            </div>
          </div>
        )}

        {status === "EXECUTED" && captureEvent ? (
          <div className="st">
            <div className="sn">04 · Paid · confirmed</div>
            <div className="sv cap">
              counted exactly once
              <time>
                {fmtClock(captureEvent.occurredAt)} · <span className="ref">ref {shortRef(captureEvent.providerRef ?? captureEvent.id)}</span>
              </time>
            </div>
          </div>
        ) : status === "PENDING_SETTLEMENT" ? (
          <div className="st">
            <div className="sn">04 · Paying · not confirmed</div>
            <div className="sv askb">
              started, not counted yet
              <time>not counted until it confirms</time>
            </div>
          </div>
        ) : status === "APPROVED" && captureFailedEvent ? (
          <div className="st">
            <div className="sn">04 · Payment failed</div>
            <div className="sv denyb">
              nothing counted
              <time>{captureFailedEvent.note ?? "PayPal declined it"}</time>
            </div>
          </div>
        ) : (
          <div className="st">
            <div className="sn">04 · Payment</div>
            <div className="sv" style={{ color: "var(--dark-soft)" }}>
              counted once PayPal confirms
              <time>not yet</time>
            </div>
          </div>
        )}

        <div className="stamp-line">
          {status === "PENDING_APPROVAL" ? (
            <><span className="in">The stamp</span> is earned the moment you decide. Your word is the seal, and your rules are the ink.</>
          ) : status === "EXECUTED" ? (
            <>Receipt closed · nothing left to do. The record keeps the full history, and this row can never be changed.</>
          ) : status === "REJECTED" ? (
            <>You declined it. Nothing moved, nothing counted.</>
          ) : status === "DENIED" ? (
            <>Your rules refused it. No person and no app moved it.</>
          ) : (
            <>You approved it, and your word is on it. The stamp is earned once PayPal confirms the payment.</>
          )}
        </div>
      </section>

      <div className="note reveal" style={{ "--i": 4 } as React.CSSProperties}>
        Live sandbox data · decisions happen on the server · this screen never spends on its own
      </div>
    </>
  );
}

function stateWordLine(status: RequestStatus): string {
  switch (status) {
    case "PENDING_APPROVAL": return "waiting on you";
    case "APPROVED": return "paying";
    case "AUTHORIZED": return "ready";
    case "PENDING_SETTLEMENT": return "confirming";
    case "EXECUTED": return "paid";
    case "REJECTED": return "you said no";
    case "DENIED": return "blocked";
  }
}
