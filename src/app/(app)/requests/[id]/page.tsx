import Link from "next/link";
import { notFound } from "next/navigation";
import { approveAndPayRequest, declineRequest, payRequest, reconcileRequest } from "./actions";
import { displayId, fmtClock, money } from "@/lib/format";
import { getService } from "@/lib/service";
import { chipFor, isReserved, latestEvaluation, reasonSlug } from "@/lib/vocab";
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
        rule: "Rule set",
        det: "no active rule set — the gate cannot authorize anything",
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
      rule: "Currency matches the statute",
      det: `${currency} → ${rulesCurrency ?? "—"}`,
      verdict: bench(3),
    },
    {
      rule: "Category is permitted",
      det: `${record.request.category} ∈ ${rulesCategories.join(", ") || "— (empty list permits nothing)"}`,
      verdict: bench(4),
    },
    {
      rule: "Monthly cap still holds after capture",
      det:
        record.status === "EXECUTED"
          ? `${money(spentMinor)} ≤ ${money(rulesCapture)} · already counted`
          : `${money(spentMinor + amount)} ≤ ${money(rulesCapture)} · counted only from a verified capture`,
      verdict: bench(5),
    },
    {
      rule: "Under the per-purchase auto limit",
      det: `${money(amount)} ≤ ${money(perPurchaseLimit ?? 0)}`,
      verdict: bench(6),
    },
    {
      rule: "Payee is known",
      det: `${record.request.payee} ${knownPayees.has(record.request.payee) ? "∈" : "∉"} known payees · rule: new payee needs a human`,
      verdict: bench(7),
    },
  ];

  return { rows, failing };
}

const H = {
  PENDING_APPROVAL: "A purchase <pay>waiting on your word.</pay>",
  APPROVED: "Approved — <pay>your word, on the record.</pay>",
  AUTHORIZED: "Authorized — <pay>within limits, ready to move.</pay>",
  PENDING_SETTLEMENT: "Capturing — <pay>settling with the provider.</pay>",
  EXECUTED: "<pay>Allowed, paid, on the record.</pay>",
  REJECTED: "Closed — <pay>on your word.</pay>",
  DENIED: "Refused — <pay>by the rule, not the model.</pay>",
} as const;

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <Link href="/" className="back">
        ← Today&apos;s register
      </Link>

      {/* case header */}
      <section className="case-head">
        <div>
          <div className="ref num">Request · {displayId(id)} · {day}</div>
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
            <span className="waiting">rejected · not a verdict chip</span>
          )}
          {status === "PENDING_APPROVAL" ? (
            <>
              <span className="waiting num">awaiting you · since <span className="open-ask">{fmtClock(record.createdAt)}</span></span>
              <span className="waiting num">proposed by <span className="open-ask">{record.request.agentId}</span></span>
            </>
          ) : status === "EXECUTED" ? (
            <>
              <span className="waiting num">decided <span className="open-allow">{approval ? fmtClock(approval.approvedAt) : "—"}</span> · by {approval?.approvedBy ?? "owner"}</span>
              <span className="waiting num">captured {fmtClock(captureEvent?.occurredAt ?? record.createdAt)} · verified once</span>
            </>
          ) : (
            <>
              <span className="waiting num">{stateWordLine(status)}</span>
              <span className="waiting num">proposed by {record.request.agentId}</span>
            </>
          )}
        </div>
      </section>

      {/* file + rail */}
      <div className="body">
        <div>
          {/* the facts */}
          <section className="facts">
            <div className="label">The file</div>
            <div className="frow"><span className="k">payee</span><span className="v num">{record.request.payee}</span></div>
            <div className="frow"><span className="k">purpose</span><span className="v">{record.request.category.toLowerCase()} · {record.request.purpose}</span></div>
            <div className="frow"><span className="k">category</span><span className="v">{record.request.category}</span></div>
            <div className="frow"><span className="k">amount</span><span className="v num">{record.request.currency} {money(record.request.amountMinor)}</span></div>
            <div className="frow"><span className="k">currency</span><span className="v">{record.request.currency}</span></div>
            <div className="frow"><span className="k">agent</span><span className="v">{record.request.agentId}</span></div>
            {approval ? (
              <div className="frow"><span className="k">approved by</span><span className="v num">{approval.approvedBy} · {fmtClock(approval.approvedAt)}</span></div>
            ) : null}
            {rejection ? (
              <div className="frow"><span className="k">rejected by</span><span className="v num">{rejection.rejectedBy} · {fmtClock(rejection.rejectedAt)}</span></div>
            ) : null}
            {captureRefEvent ? (
              <div className="frow">
                <span className="k">capture ref</span>
                <span className="v num">
                  <span className="fp">{truncateRef(captureRefEvent.providerRef ?? captureRefEvent.id)}</span>{" "}
                  <span className="fp">(PayPal{captureEvent ? "" : " · pending"} · full in the Record)</span>
                </span>
              </div>
            ) : null}
            <div className="frow">
              <span className="k">fingerprint</span>
              <span className="v num">
                <span className="fp">{record.fingerprint.slice(0, 8)}…{record.fingerprint.slice(-4)}</span>{" "}
                <span className="fp">(full in the Record)</span>
              </span>
            </div>
          </section>

          {/* the check */}
          <section className="check">
            <div className="label">
              The check · re-run at approval, and again at execution
            </div>

            {rows.map((row) => (
              <div className="crow" key={row.rule}>
                <div>
                  <div className="rule">{row.rule}</div>
                  <div className="det num">{row.det}</div>
                </div>
                <span className={`result num ${row.verdict === "pass" ? "pass" : row.verdict === "ask" ? "ask-x" : row.verdict === "deny" ? "deny" : "nr"}`}>
                  {row.verdict === "nr" ? "—" : row.verdict === "ask" ? "ask" : row.verdict === "deny" ? "deny" : "pass"}
                </span>
              </div>
            ))}

            <div className="verdict">
              <span className="label">Verdict</span>
              <span className="vd num">
                <b>{ruling?.decision.decision ?? "—"}</b> · {ruling?.decision.reasonCode ?? "—"} · rule set {ruling?.decision.ruleVersion ?? rules?.ruleVersion ?? "—"}
              </span>
            </div>
            <div className="story num">
              Re-run just now, at {fmtClock(new Date().toISOString())} → <b>{now.decision}</b> · {now.reasonCode} (the gate evaluates fresh, every time)
            </div>
            {approval && firstEval && ruling && firstEval.decision.decision !== ruling.decision.decision ? (
              <div className="story num">
                Proposal was {firstEval.decision.decision} · {firstEval.decision.reasonCode}; the gate now reads {ruling.decision.decision} · {ruling.decision.reasonCode} — the facts moved and a human cleared the ASK. No rule was bent.
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
              <p className="slip-sub">Only you can move this one. The engine never decides, and it never approves itself.</p>
              <button className="prime" type="submit">
                Approve &amp; pay<span className="amt num">{record.request.currency} {money(record.request.amountMinor)} →</span>
              </button>
              <button className="decline" type="submit" formAction={declineRequest}>
                Decline
              </button>
              <div className="note">
                <span className="k">Recheck:</span> the gate re-runs the whole file before anything sticks.<br />
                <span className="k">Cap:</span> {rules ? money(cap ?? 0) : "—"} is a hard limit — no approval can override it.<br />
                <span className="k">Pay:</span> charged to your saved card over PayPal Sandbox.<br />
                <span className="k">Counting:</span> nothing counts until the provider verifies the capture.
              </div>
              <div className="posture">
                <div className="pro">Current posture</div>
                <div className="pl num"><span>captured</span><b>{money(captured)}</b></div>
                <div className="pl num"><span>reserved</span><b>{money(reserved)}</b></div>
                <div className="pl num"><span>headroom</span><b className="hl">{money(headroom ?? 0)}</b></div>
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
              <div className="what">Nothing further needed.</div>
              <div className="rows allowrows">
                <div className="pl num"><span>approved by</span><b>{approval?.approvedBy ?? "owner"} · {approval ? fmtClock(approval.approvedAt) : "—"}</b></div>
                <div className="pl num"><span>recheck at approval</span><b>pass</b></div>
                <div className="pl num"><span>recheck at execution</span><b>{preExecEval ? "pass" : "—"}</b></div>
                <div className="pl num"><span>captured &amp; verified</span><b>{captureEvent ? fmtClock(captureEvent.occurredAt) : "—"}</b></div>
                <div className="pl num"><span>counted once</span><b>yes</b></div>
              </div>
              <Link href="/record" className="rec">Row in the Record →</Link>
            </div>
          ) : status === "APPROVED" || status === "AUTHORIZED" ? (
            <div className="stampbox">
              <div className="what">Approved — ready to pay.</div>
              <div className="rows">
                <div className="pl num"><span>approved by</span><b>{approval?.approvedBy ?? "owner"} · {approval ? fmtClock(approval.approvedAt) : "—"}</b></div>
                <div className="pl num"><span>recheck at approval</span><b>{record.evaluations.some((e) => e.context === "APPROVAL") ? "pass" : "—"}</b></div>
                <div className="pl num"><span>counted</span><b>not yet — counting starts at the capture</b></div>
                {captureFailedEvent ? (
                  <div className="pl num"><span>last attempt</span><b>{captureFailedEvent.note ?? "the provider declined it"}</b></div>
                ) : null}
              </div>
              <form action={payRequest}>
                <input type="hidden" name="id" value={id} />
                <button className="prime" type="submit">
                  {captureFailedEvent ? "Try payment again" : "Pay"}<span className="amt num">{record.request.currency} {money(record.request.amountMinor)} →</span>
                </button>
              </form>
              <Link href="/" className="rec">Back to the register →</Link>
            </div>
          ) : status === "PENDING_SETTLEMENT" ? (
            <div className="stampbox">
              <div className="what">Capturing — settling with the provider.</div>
              <div className="rows">
                <div className="pl num"><span>initiated</span><b>{pendingEvent ? fmtClock(pendingEvent.occurredAt) : "—"}</b></div>
                <div className="pl num"><span>capture ref</span><b className="hl">{pendingEvent?.providerRef ? truncateRef(pendingEvent.providerRef) : "—"}</b></div>
                <div className="pl num"><span>counted</span><b>nothing yet — not until it settles</b></div>
              </div>
              <form action={reconcileRequest}>
                <input type="hidden" name="id" value={id} />
                <button className="prime" type="submit">Re-check with PayPal</button>
              </form>
              <Link href="/" className="rec">Back to the register →</Link>
            </div>
          ) : status === "REJECTED" ? (
            <div className="stampbox">
              <div className="what">Closed on your word.</div>
              <div className="rows">
                <div className="pl num"><span>rejected by</span><b>{rejection?.rejectedBy ?? "owner"}</b></div>
                <div className="pl num"><span>at</span><b>{rejection ? fmtClock(rejection.rejectedAt) : "—"}</b></div>
                {rejection?.reason ? (
                  <div className="pl num"><span>reason</span><b>{rejection.reason}</b></div>
                ) : null}
              </div>
              <Link href="/" className="rec">Back to the register →</Link>
            </div>
          ) : (
            <div className="stampbox">
              <div className="what">Refused by the rule.</div>
              <div className="rows">
                <div className="pl num"><span>reason</span><b>{ruling?.decision.reasonCode ?? "—"}</b></div>
                <div className="pl num"><span>why</span><b>{ruling?.decision.reason ?? "—"}</b></div>
                <div className="pl num"><span>rule set</span><b>{ruling?.decision.ruleVersion ?? rules?.ruleVersion ?? "—"}</b></div>
                <div className="pl num"><span>headroom then</span><b>{money(Math.max((cap ?? 0) - captured, 0))}</b></div>
              </div>
              <Link href="/" className="rec">Back to the register →</Link>
            </div>
          )}
        </aside>
      </div>

      {/* receipt strip — the print moment */}
      <section className="receipt">
        <div className="rh">Receipt strip · request {displayId(id)} · {stateWordLine(status)}</div>

        <div className="st">
          <div className="sn">01 · Proposed</div>
          <div className="sv">
            {record.request.agentId} filed the request
            <time>{fmtClock(record.createdAt)}</time>
          </div>
        </div>

        <div className="st">
          <div className="sn">02 · Decided</div>
          <div className="sv">
            engine {firstEval?.decision.decision === "ALLOW" ? "allowed it" : firstEval?.decision.decision === "DENY" ? "refused it" : "asked, kept its hands off"}
            <time>{firstEval ? `${fmtClock(firstEval.evaluatedAt)} · ${reasonSlug(firstEval.decision.reasonCode)}` : "—"}</time>
          </div>
        </div>

        {status === "PENDING_APPROVAL" ? (
          <div className="st">
            <div className="sn">03 · Submitted — awaiting you</div>
            <div className="sv askb">
              no money has moved
              <time>open since {fmtClock(record.createdAt)}</time>
            </div>
          </div>
        ) : status === "APPROVED" || status === "AUTHORIZED" ? (
          <div className="st">
            <div className="sn">03 · Approved</div>
            <div className="sv">
              your word, on the record
              <time>{approval ? fmtClock(approval.approvedAt) : "—"} · by {approval?.approvedBy ?? "owner"}</time>
            </div>
          </div>
        ) : status === "EXECUTED" ? (
          <div className="st">
            <div className="sn">03 · Submitted</div>
            <div className="sv">
              recheck passed · sent to provider
              <time>{preExecEval ? fmtClock(preExecEval.evaluatedAt) : "—"}</time>
            </div>
          </div>
        ) : status === "DENIED" ? (
          <div className="st">
            <div className="sn">03 · Refused — hard rule</div>
            <div className="sv askb">
              nothing moved, nothing counted
              <time>{ruling ? fmtClock(ruling.evaluatedAt) : "—"} · {ruling?.decision.reasonCode ?? ""}</time>
            </div>
          </div>
        ) : (
          <div className="st">
            <div className="sn">03 · {stateWordLine(status)}</div>
            <div className="sv">
              {rejection ? `closed on ${rejection.rejectedBy}’s word` : "status recorded"}
              <time>{approval ? fmtClock(approval.approvedAt) : rejection ? fmtClock(rejection.rejectedAt) : fmtClock(record.createdAt)}</time>
            </div>
          </div>
        )}

        {status === "EXECUTED" && captureEvent ? (
          <div className="st">
            <div className="sn">04 · Captured · verified</div>
            <div className="sv cap">
              counted exactly once
              <time>
                {fmtClock(captureEvent.occurredAt)} · <span className="ref">ref {truncateRef(captureEvent.providerRef ?? captureEvent.id)}</span>
              </time>
            </div>
          </div>
        ) : status === "PENDING_SETTLEMENT" ? (
          <div className="st">
            <div className="sn">04 · Capturing — pending</div>
            <div className="sv askb">
              initiated, not yet counted
              <time>never counted until it settles</time>
            </div>
          </div>
        ) : status === "APPROVED" && captureFailedEvent ? (
          <div className="st">
            <div className="sn">04 · Capture failed</div>
            <div className="sv denyb">
              nothing counted
              <time>{captureFailedEvent.note ?? "the provider declined it"}</time>
            </div>
          </div>
        ) : (
          <div className="st">
            <div className="sn">04 · Captured</div>
            <div className="sv" style={{ color: "var(--dark-soft)" }}>
              — once verified, counted
              <time>not yet</time>
            </div>
          </div>
        )}

        <div className="stamp-line">
          {status === "PENDING_APPROVAL" ? (
            <><span className="in">The stamp</span> is earned here the moment you decide — your word is the seal, the engine&apos;s check is the ink.</>
          ) : status === "EXECUTED" ? (
            <>Receipt closed · nothing outstanding. The record keeps the full evaluation history — this row is immutable from here.</>
          ) : status === "REJECTED" ? (
            <>Closed on your word. Nothing moved, nothing counted.</>
          ) : status === "DENIED" ? (
            <>Closed by the rule — no human and no model moved it.</>
          ) : (
            <>Approved — your word is on it. The stamp is earned when the capture verifies.</>
          )}
        </div>
      </section>

      <div className="note">
        Live sandbox data · decision server-side only · this screen proposes nothing
      </div>
    </>
  );
}

function stateWordLine(status: RequestStatus): string {
  switch (status) {
    case "PENDING_APPROVAL": return "awaiting";
    case "APPROVED": return "executing";
    case "AUTHORIZED": return "ready";
    case "PENDING_SETTLEMENT": return "settling";
    case "EXECUTED": return "closed";
    case "REJECTED": return "rejected";
    case "DENIED": return "closed";
  }
}

function truncateRef(ref: string): string {
  return ref.length > 10 ? `${ref.slice(0, 8)}…` : ref;
}