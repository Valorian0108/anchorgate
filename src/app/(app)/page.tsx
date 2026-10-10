import Link from "next/link";
import { displayId, fmtClock, fmtClockUTC, money } from "@/lib/format";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";
import {
  checkText,
  checkTextForStatus,
  chipFor,
  isReserved,
  latestEvaluation,
  reasonSlug,
  stateWord,
} from "@/lib/vocab";

// Live data on every load — this screen IS the current state of the gate.
export const dynamic = "force-dynamic";

export default async function GatePage() {
  await verifyOwner();

  const service = getService();
  const budget = await service.budget();
  const records = (await service.list()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  const cap = budget.rules?.monthlyCapMinor ?? null;
  const captured = budget.spentThisMonthMinor;
  const reserved = records
    .filter((r) => isReserved(r.status))
    .reduce((sum, r) => sum + r.request.amountMinor, 0);
  const headroom = cap === null ? null : Math.max(cap - captured - reserved, 0);
  const pending = records.filter((r) => r.status === "PENDING_APPROVAL");

  const spentPct = cap === null || cap === 0 ? 0 : (captured / cap) * 100;
  const reservedPct = cap === null || cap === 0 ? 0 : (reserved / cap) * 100;

  const day = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(" ", " ");

  const latest = records[0];
  const latestDecision = latest ? latestEvaluation(latest.evaluations) : null;
  const firstRecord = records.find((r) => r.evaluations.length > 0);

  return (
    <>
      {/* budget rule */}
      <section className="budget" aria-label="Monthly budget posture">
        <div className="top">
          <span>Budget · {new Date().toLocaleDateString("en-GB", { month: "long" })}</span>
          {cap !== null ? (
            <span className="fig num">
              captured <b>{money(captured)}</b>
              <span className="sep">/</span>
              reserved <b>{money(reserved)}</b>
              <span className="sep">/</span>
              headroom <b className="hl">{money(headroom ?? 0)}</b>
              <span className="sep">/</span>
              cap <b>{money(cap)}</b>
            </span>
          ) : (
            <span className="fig num">no rules configured — nothing can be authorized</span>
          )}
        </div>
        {cap !== null && cap > 0 ? (
          <div
            className="gauge num"
            style={
              {
                "--spent": `${spentPct}%`,
                "--reserved": `${reservedPct}%`,
              } as React.CSSProperties
            }
          >
            <div className="base" />
            <div className="spent" style={{ left: 0 }} />
            <div className="reserved" style={{ left: `${spentPct}%`, width: `${reservedPct}%` }} />
            <div className="cap" style={{ left: "100%" }} />
            <span className="lbl sp-ent">captured</span>
            <span className="lbl rs-ent" style={{ left: `${spentPct}%` }}>
              reserved
            </span>
            <span className="lbl cp-ent" style={{ left: "100%" }}>
              cap
            </span>
          </div>
        ) : null}
      </section>

      {/* the register — one dominant element */}
      <section className="register" aria-label="Today's decision register">
        <div className="reg-head">
          <h1>Today's register</h1>
          <span className="count num">
            {day} · {records.length} records · {pending.length} need you
          </span>
        </div>

        <div className="ledger">
          <div className="colhead">
            <span>Request</span>
            <span>Payee / purpose</span>
            <span>Check</span>
            <span className="amt">Amount</span>
            <span>Status</span>
            <span />
          </div>

          {records.map((record) => {
            const latest = latestEvaluation(record.evaluations);
            const decision = latest?.decision.decision ?? null;
            const reasonCode = latest?.decision.reasonCode ?? null;
            const chip = chipFor(decision, record.status);
            const pendingRow = record.status === "PENDING_APPROVAL";

            return (
              <div className="row" key={record.id}>
                <div className="t num">
                  <span className="id">{displayId(record.id)}</span>
                  <time>{fmtClock(record.createdAt)}</time>
                </div>
                <div className="who">
                  <div className="payee">{record.request.payee}</div>
                  <div className="purpose">
                    {record.request.category.toLowerCase()} · {record.request.purpose}
                  </div>
                </div>
                <div className="check">
                  {record.status === "PENDING_APPROVAL" || record.status === "DENIED"
                    ? (
                        latest
                          ? checkText(latest.decision.decision, latest.decision.reasonCode)
                          : checkTextForStatus(record.status)
                      )
                    : checkTextForStatus(record.status)}
                  {record.status === "PENDING_APPROVAL" || record.status === "DENIED"
                    ? latest
                      ? <span className="rc">{latest.decision.reasonCode}</span>
                      : null
                    : null}
                </div>
                <div className="amt num">
                  <span className="cur">{record.request.currency}</span>
                  {money(record.request.amountMinor)}
                </div>
                <div className="status">
                  {chip ? (
                    <span className={`chip ${chip.className}`}>{chip.label}</span>
                  ) : (
                    <span className="muted">rejected</span>
                  )}
                </div>
                {pendingRow ? (
                  <Link className="act" href={`/requests/${record.id}`}>
                    Decide →
                  </Link>
                ) : (
                  <div className="muted">{stateWord(record.status)}</div>
                )}
              </div>
            );
          })}

          {records.length === 0 ? (
            <div className="row">
              <div className="who">
                <div className="payee">No requests yet</div>
                <div className="purpose">the register is empty — the agent has proposed nothing</div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* footer record strip */}
      <footer className="record-foot">
        <span>
          record · latest decision{" "}
          <span className="rv">
            {latest && latestDecision
              ? `${displayId(latest.id)} ${latestDecision.decision.decision} · ${reasonSlug(latestDecision.decision.reasonCode)} · ${fmtClockUTC(latestDecision.evaluatedAt)}`
              : firstRecord && latestDecision
                ? `${displayId(firstRecord.id)} ${latestDecision.decision.decision} · ${reasonSlug(latestDecision.decision.reasonCode)}`
                : "none yet"}
          </span>
        </span>
        <span>
          rules{" "}
          <span className="rv">
            {budget.rules ? `${budget.rules.ruleVersion} · ${budget.rules.currency}` : "none"}
          </span>
        </span>
      </footer>
      <div className="note">
        Live sandbox data · demo purchases · the model proposes, the gate decides
      </div>
    </>
  );
}