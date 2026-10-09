/**
 * The engine line — the one-line instrument whisper under the masthead.
 * Server component: reads the live rule version and the latest evaluation time.
 * Fails visibly (offline line) rather than crashing the page.
 */

import { fmtClockUTC } from "@/lib/format";
import { getService } from "@/lib/service";
import { latestEvaluation } from "@/lib/vocab";

export async function EngineLine() {
  try {
    const service = getService();
    const [budget, records] = await Promise.all([service.budget(), service.list()]);

    let evaluated: string | null = null;
    for (const record of records) {
      const latest = latestEvaluation(record.evaluations);
      if (latest && (!evaluated || latest.evaluatedAt > evaluated)) {
        evaluated = latest.evaluatedAt;
      }
    }

    const ruleSet = budget.rules?.ruleVersion ?? "none — nothing can be authorized";

    return (
      <div className="engine">
        <span className="dot" />
        <span>
          <span className="tag">engine</span>
          deterministic authorizer · rules read fresh, never cached
          {evaluated ? <> · evaluated {fmtClockUTC(evaluated)}</> : null}
          {" · "}rule set <span className="tag">{ruleSet}</span>
        </span>
      </div>
    );
  } catch {
    return (
      <div className="engine">
        <span className="dot" />
        <span>
          <span className="tag">engine</span> offline · database unreachable
        </span>
      </div>
    );
  }
}