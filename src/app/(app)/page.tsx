import { shortRef } from "@/lib/format";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";
import { GateBoard } from "@/components/gate-board";
import { askMessageFor } from "@/lib/askOutcome";
import { isReserved, latestEvaluation } from "@/lib/vocab";

// Live data on every load — this screen IS the current state of the gate.
export const dynamic = "force-dynamic";

// The ask box's action gives the model call a hard 45-second clock
// (AGENT_RUN_TIMEOUT_MS) and may then settle a trust-mode payment. 60 seconds
// lets the action finish on its own terms, with its honest sentence, before
// any platform limit kills it mid-flight: a killed function cannot redirect,
// and a silent box is the one thing this product promises never to be. Per the
// bundled Next.js docs, Server Actions take maxDuration from the page.
export const maxDuration = 60;

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string; why?: string; ref?: string; missing?: string }>;
}) {
  const owner = await verifyOwner();

  const { ask, why, ref, missing } = await searchParams;
  const message = askMessageFor(ask, why, ref, missing);

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

  // When the engine last evaluated anything: the status strip ticks from here.
  let evaluatedAt: string | null = null;
  for (const record of records) {
    const latest = latestEvaluation(record.evaluations);
    if (latest && (!evaluatedAt || latest.evaluatedAt > evaluatedAt)) {
      evaluatedAt = latest.evaluatedAt;
    }
  }

  const capMinor = budget.rules?.monthlyCapMinor ?? null;
  const spentMinor = budget.spentThisMonthMinor;
  const reservedMinor = records
    .filter((record) => isReserved(record.status))
    .reduce((sum, record) => sum + record.request.amountMinor, 0);
  const currency = budget.currency ?? "USD";
  const trustOn = budget.rules?.autoApproveEnabled ?? false;

  return (
    <>
      <GateBoard
        records={records}
        refs={refs}
        capMinor={capMinor}
        spentMinor={spentMinor}
        reservedMinor={reservedMinor}
        currency={currency}
        askMessage={message}
        evaluatedAt={evaluatedAt}
        ruleVersion={budget.rules?.ruleVersion ?? null}
        trustOn={trustOn}
        autoSpentMinor={trustOn ? budget.autoSpentThisMonthMinor : null}
        autoBudgetMinor={trustOn ? (budget.rules?.autoBudgetMinor ?? null) : null}
      />

      <div className="note">
        Live sandbox data · demo purchases · the assistant proposes, your rules decide, you approve
      </div>
    </>
  );
}
