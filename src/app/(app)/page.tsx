import { displayId, fmtClockUTC, shortRef } from "@/lib/format";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";
import { GateBoard } from "@/components/gate-board";
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

  // The short capture reference for each settled card, read from the ledger the
  // same way the Record does. Only verified captures carry one.
  const events = await service.allEvents();
  const refs: Record<string, string> = {};
  for (const event of events) {
    if (event.kind === "CAPTURE_VERIFIED" && event.providerRef && !refs[event.requestId]) {
      refs[event.requestId] = shortRef(event.providerRef);
    }
  }

  const capMinor = budget.rules?.monthlyCapMinor ?? null;
  const spentMinor = budget.spentThisMonthMinor;
  const reservedMinor = records
    .filter((record) => isReserved(record.status))
    .reduce((sum, record) => sum + record.request.amountMinor, 0);
  const currency = budget.currency ?? "USD";

  const day = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const latest = records[0];
  const latestDecision = latest ? latestEvaluation(latest.evaluations) : null;

  return (
    <>
      <GateBoard
        records={records}
        refs={refs}
        day={day}
        capMinor={capMinor}
        spentMinor={spentMinor}
        reservedMinor={reservedMinor}
        currency={currency}
        askMessage={message}
      />

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
