/**
 * The engine line — the one-line instrument whisper under the masthead.
 * Server component: reads the live rule version and the latest evaluation time.
 * Fails visibly (offline line) rather than crashing the page.
 */

import { fmtClockUTC } from "@/lib/format";
import { getService } from "@/lib/service";
import { latestEvaluation } from "@/lib/vocab";

export async function EngineLine({ userId }: { userId: string }) {
  try {
    const service = getService(userId);
    const [budget, records] = await Promise.all([service.budget(), service.list()]);

    let evaluated: string | null = null;
    for (const record of records) {
      const latest = latestEvaluation(record.evaluations);
      if (latest && (!evaluated || latest.evaluatedAt > evaluated)) {
        evaluated = latest.evaluatedAt;
      }
    }

    const ruleSet = budget.rules?.ruleVersion ?? "none set, so nothing can be approved";

    return (
      <div className="engine">
        <span className="dot" />
        <span>
          <span className="tag">rules</span>
          checked fresh every time, never from memory
          {evaluated ? <> · last decision {fmtClockUTC(evaluated)}</> : null}
          {" · "}your rules <span className="tag">{ruleSet}</span>
        </span>
      </div>
    );
  } catch {
    return (
      <div className="engine">
        <span className="dot" />
        <span>
          <span className="tag">rules</span> offline · can&apos;t reach your records right now
        </span>
      </div>
    );
  }
}