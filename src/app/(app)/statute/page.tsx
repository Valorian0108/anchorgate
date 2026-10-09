import type { ReactNode } from "react";
import { money } from "@/lib/format";
import { getService } from "@/lib/service";

// Rules are read fresh on every load — the statute is never cached.
export const dynamic = "force-dynamic";

function Clause({
  n,
  title,
  body,
  children,
}: {
  n: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="clause">
      <div className="snum num">§ {n}</div>
      <div className="txt">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className="op">{children}</div>
    </div>
  );
}

export default async function StatutePage() {
  const service = getService();
  const budget = await service.budget();
  const rules = budget.rules;

  const day = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(" ", " ");

  if (!rules) {
    return (
      <>
        <section className="page-head">
          <div>
            <div className="ref">Statute · no rule set · {day}</div>
            <h1>The rules the agent can&apos;t move.</h1>
          </div>
          <span className="count num">0 clauses · nothing can be authorized</span>
        </section>

        <p className="preamble">
          No active rule set is configured. Because the gate fails closed,{" "}
          <b>nothing may be authorized</b> until a rule set is written.
        </p>

        <div className="note">Fail closed · no rules means no permission</div>
      </>
    );
  }

  const currency = rules.currency;
  const auto = rules.perPurchaseAutoLimitMinor;
  const cap = rules.monthlyCapMinor;
  const categories = rules.permittedCategories;
  const newPayee = rules.requireApprovalForNewPayee;

  return (
    <>
      <section className="page-head">
        <div>
          <div className="ref">
            Statute · rule set {rules.ruleVersion} · {day}
          </div>
          <h1>The rules the agent can&apos;t move.</h1>
        </div>
        <span className="count num">8 clauses · in force</span>
      </section>

      <p className="preamble">
        This set governs every proposed purchase. The AI may propose — it has one tool and no money.{" "}
        <b>Only these rules, and then the owner (you), decide.</b> The rules are read fresh for every
        evaluation, and none of them can be overridden by a model.
      </p>

      <section className="clauses">
        <Clause
          n="1"
          title="Standing"
          body="Every request is evaluated against this rule set at proposal, again at approval, and again immediately before execution. A request that has no decision yet is simply not spent."
        >
          <span className="rv">
            rule set {rules.ruleVersion} · {currency}
          </span>
          <span>evaluated at PROPOSAL · APPROVAL · PRE_EXECUTION</span>
          <span className="hard">unreadable rules or state → fails closed, no spend</span>
        </Clause>

        <Clause
          n="2"
          title="A valid request"
          body="Malformed, missing, or ambiguous requests are refused at the boundary — before any rule is applied, a garbage request is never permission."
        >
          <span className="hard">invalid request → deny</span>
        </Clause>

        <Clause
          n="3"
          title="Amount and currency"
          body={`Amounts are positive integers in the currency's minor units; only ${currency} is accepted — the MVP performs no exchange. Zero or negative amounts have no standing.`}
        >
          <span className="rv">{currency} only</span>
          <span>amount ≤ 0 → deny</span>
          <span className="hard">currency mismatch → deny</span>
        </Clause>

        <Clause
          n="4"
          title="Permitted categories"
          body="Only categories written here may be paid. An empty list permits nothing — the rule set fails safe by construction."
        >
          <span className="rv">
            {categories.length ? categories.join(" · ") : "none (permits nothing)"}
          </span>
          <span className="hard">outside the list → deny</span>
        </Clause>

        <Clause
          n="5"
          title="The monthly cap"
          body={`A hard ceiling of ${money(cap)} on verified captures for the month. It is checked before any approval condition, so no approval — human or otherwise — can override it.`}
        >
          <span className="rv">cap {money(cap)} · hard</span>
          <span>counted from verified captures only</span>
          <span className="hard">would exceed the cap → deny</span>
        </Clause>

        <Clause
          n="6"
          title="The per-purchase line"
          body="At or below the automatic limit, with everything else in order, no human is needed. Above it, a human is asked — the engine never waives its own line."
        >
          <span className="rv">auto-allow ≤ {money(auto)}</span>
          <span className="warn">above {money(auto)} → ask</span>
        </Clause>

        <Clause
          n="7"
          title="First-time payees"
          body="A payee we have not paid before goes to a human, every time — the unknown destination is exactly what the gate exists to slow down."
        >
          {newPayee ? (
            <span className="warn">new payee → ask</span>
          ) : (
            <span className="rv">off · new payees are not gated by this clause</span>
          )}
        </Clause>

        <Clause
          n="8"
          title="Otherwise"
          body="Everything that passes all of the above is allowed by the engine and may execute automatically under the vault-once card."
        >
          <span className="rv">else → allow · within limits</span>
        </Clause>
      </section>

      <div className="order num">
        <span className="seq">
          <b>Decision order:</b>
        </span>{" "}
        <span className="rule">
          1 valid request · 2 positive amount · 3 currency · 4 category · 5 hard cap · 6
          per-purchase line · 7 known payee · 8 allow
        </span>
        <br />
        <span className="seq">
          <b>Strictest wins:</b>
        </span>{" "}
        <span className="strict">DENY &gt; ASK &gt; ALLOW</span>
      </div>

      <div className="note">
        Live rule set {rules.ruleVersion} · read fresh for every evaluation · amendments apply to the
        next evaluation — nothing already written is rewritten
      </div>
    </>
  );
}
