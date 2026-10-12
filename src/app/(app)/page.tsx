import { displayId, fmtClockUTC } from "@/lib/format";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";
import { CountUp } from "@/components/count-up";
import { AskBox } from "@/components/ask-box";
import { GateRegister } from "@/components/gate-register";
import { askMessageFor } from "@/lib/askOutcome";
import { decisionWord, isReserved, latestEvaluation } from "@/lib/vocab";

// Live data on every load — this screen IS the current state of the gate.
export const dynamic = "force-dynamic";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string; why?: string }>;
}) {
  const owner = await verifyOwner();

  const { ask, why } = await searchParams;
  const message = askMessageFor(ask, why);

  const service = getService(owner.userId);
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

  const spentPct = cap === null || cap === 0 ? 0 : (captured / cap) * 100;
  const reservedPct = cap === null || cap === 0 ? 0 : (reserved / cap) * 100;
  // The gauge is one bar of 100%. When captures alone fill it, the set-aside
  // segment is clamped to the room that is left (possibly none) so the bar
  // never draws past the limit tick.
  const spentShownPct = Math.min(spentPct, 100);
  const reservedShownPct = Math.max(0, Math.min(reservedPct, 100 - spentShownPct));
  const cur = budget.currency ?? "USD";
  const sym = cur === "USD" ? "$" : `${cur} `;

  const day = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(" ", " ");

  const latest = records[0];
  const latestDecision = latest ? latestEvaluation(latest.evaluations) : null;

  return (
    <>
      {/* budget rule */}
      <section className="budget reveal" style={{ "--i": 0 } as React.CSSProperties} aria-label="Your money this month">
        <div className="top">
          <span>Your money this month</span>
          {cap !== null ? (
            <span className="fig num">
              spent <b>{sym}<CountUp value={captured / 100} /></b>
              <span className="sep">/</span>
              set aside <b>{sym}<CountUp value={reserved / 100} /></b>
              <span className="sep">/</span>
              left <b className="hl">{sym}<CountUp value={(headroom ?? 0) / 100} /></b>
              <span className="sep">/</span>
              limit <b>{sym}<CountUp value={cap / 100} /></b>
            </span>
          ) : (
            <span className="fig num">no rules set yet, so nothing can be approved</span>
          )}
        </div>
        {cap !== null && cap > 0 ? (
          <div
            className="gauge num"
            style={
              {
                "--spent": `${spentShownPct}%`,
                "--reserved": `${reservedShownPct}%`,
              } as React.CSSProperties
            }
          >
            <div className="base" />
            <div className="spent" style={{ left: 0 }} />
            <div
              className="reserved"
              style={{ left: `${spentShownPct}%`, width: `${reservedShownPct}%` }}
            />
            <div className="cap" style={{ left: "100%" }} />
            <span className="lbl sp-ent">spent</span>
            {reservedShownPct > 0 ? (
              <span
                className={`lbl rs-ent${spentShownPct > 78 ? " below" : ""}`}
                style={{ left: `${spentShownPct}%` }}
              >
                set aside
              </span>
            ) : null}
            <span className="lbl cp-ent" style={{ left: "100%" }}>
              limit
            </span>
          </div>
        ) : null}
      </section>

      {/* ask the assistant (manual-only proposals) */}
      <div className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
        <AskBox message={message} />
      </div>

      {/* the register — one dominant element, now live */}
      <GateRegister records={records} day={day} />

      {/* footer record strip */}
      <footer className="record-foot reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <span>
          latest decision{" "}
          <span className="rv">
            {latest && latestDecision
              ? `${displayId(latest.id)} ${decisionWord(latestDecision.decision.decision)} · ${fmtClockUTC(latestDecision.evaluatedAt)}`
              : "none yet"}
          </span>
        </span>
        <span>
          your rules{" "}
          <span className="rv">
            {budget.rules ? `${budget.rules.ruleVersion} · ${budget.rules.currency}` : "none set"}
          </span>
        </span>
      </footer>
      <div className="note">
        Live sandbox data · demo purchases · the assistant proposes, your rules decide, you approve
      </div>
    </>
  );
}
