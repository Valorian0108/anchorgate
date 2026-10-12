import type { ReactNode } from "react";
import { money } from "@/lib/format";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";
import { updateRules } from "@/app/(app)/actions";

// Rules are read fresh on every load; the statute is never cached.
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

/**
 * The honest one-line outcome of a save attempt, traveling as a short URL code.
 * On success the page has already re-read the fresh rules, so the sentence
 * quotes the numbers now in force.
 */
function savedMessageFor(
  saved: string | undefined,
  cap: number,
  auto: number,
): { text: string; error: boolean } | null {
  switch (saved) {
    case "ok":
      return {
        text: `Saved. Your monthly limit is now ${money(cap)} and your auto-approve line is now ${money(auto)}.`,
        error: false,
      };
    case "bad-money":
      return {
        text: "Those amounts do not look right. Use a number above zero, like 150 or 150.00. Nothing was saved.",
        error: true,
      };
    case "auto-above-cap":
      return {
        text: "Your auto-approve line cannot sit above your monthly limit. Nothing was saved.",
        error: true,
      };
    default:
      return null;
  }
}

export default async function StatutePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const owner = await verifyOwner();

  const { saved } = await searchParams;

  const service = getService(owner.userId);
  const budget = await service.budget();
  const rules = budget.rules;

  const day = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(" ", " ");

  if (!rules) {
    const firstMessage = savedMessageFor(saved, 0, 0);
    return (
      <>
        <section className="page-head reveal" style={{ "--i": 0 } as React.CSSProperties}>
          <div>
            <div className="ref">Your rules · none set yet · {day}</div>
            <h1>The rules the assistant can&apos;t change.</h1>
          </div>
          <span className="count num">0 rules · nothing can be approved</span>
        </section>

        <p className="preamble reveal" style={{ "--i": 1 } as React.CSSProperties}>
          You have not set any rules yet. Because the gate plays it safe,{" "}
          <b>nothing can be approved</b> until you write your first rule set.
        </p>

        <section className="rules-edit reveal" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="label">Your two numbers</div>
          <form action={updateRules} className="line">
            <div className="field">
              <label htmlFor="cap">Monthly limit</label>
              <div className="in">
                <span className="cur">$</span>
                <input
                  id="cap"
                  name="cap"
                  placeholder="500"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="auto">Auto-approve line</label>
              <div className="in">
                <span className="cur">$</span>
                <input
                  id="auto"
                  name="auto"
                  placeholder="50"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                />
              </div>
            </div>
            <button type="submit">Save</button>
          </form>
          <p className="hint">
            Save once and your first rule set is written: these two numbers, the standard
            categories, and your okay needed for every first-time seller.
          </p>
          {firstMessage ? (
            <p
              className={firstMessage.error ? "msg err" : "msg"}
              role={firstMessage.error ? "alert" : "status"}
            >
              {firstMessage.text}
            </p>
          ) : null}
        </section>

        <div className="note reveal" style={{ "--i": 3 } as React.CSSProperties}>
          No rules means no spending. That is the safe default.
        </div>
      </>
    );
  }

  const currency = rules.currency;
  const auto = rules.perPurchaseAutoLimitMinor;
  const cap = rules.monthlyCapMinor;
  const categories = rules.permittedCategories;
  const newPayee = rules.requireApprovalForNewPayee;
  const symbol = currency === "USD" ? "$" : currency;
  const message = savedMessageFor(saved, cap, auto);

  return (
    <>
      <section className="page-head reveal" style={{ "--i": 0 } as React.CSSProperties}>
        <div>
          <div className="ref">
            Your rules · set {rules.ruleVersion} · {day}
          </div>
          <h1>The rules the assistant can&apos;t change.</h1>
        </div>
        <span className="count num">8 rules · in force</span>
      </section>

      <p className="preamble reveal" style={{ "--i": 1 } as React.CSSProperties}>
        These rules apply to every purchase the assistant suggests. The assistant can
        only suggest. It has no money and no power to approve. <b>Only these rules, and
        then you, decide.</b> Your rules are read fresh every time, and no app can
        override them.
      </p>

      <section className="rules-edit reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="label">Your two numbers</div>
        <form action={updateRules} className="line">
          <div className="field">
            <label htmlFor="cap">Monthly limit</label>
            <div className="in">
              <span className="cur">{symbol}</span>
              <input
                id="cap"
                name="cap"
                defaultValue={money(cap)}
                inputMode="decimal"
                autoComplete="off"
                required
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="auto">Auto-approve line</label>
            <div className="in">
              <span className="cur">{symbol}</span>
              <input
                id="auto"
                name="auto"
                defaultValue={money(auto)}
                inputMode="decimal"
                autoComplete="off"
                required
              />
            </div>
          </div>
          <button type="submit">Save</button>
        </form>
        <p className="hint">
          Changes apply to the next ask. Past decisions keep the rules they were judged
          under.
        </p>
        {message ? (
          <p
            className={message.error ? "msg err" : "msg"}
            role={message.error ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <section className="clauses reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <Clause
          n="1"
          title="Checked three times"
          body="Every purchase is checked against these rules three times: when it is suggested, when you approve it, and again right before it is paid. Until a purchase is approved, no money moves."
        >
          <span className="rv">
            Your rules {rules.ruleVersion} · {currency}
          </span>
          <span>Checked when suggested, when approved, and before paying</span>
          <span className="hard">If your rules can&apos;t be read, nothing is approved</span>
        </Clause>

        <Clause
          n="2"
          title="A valid request"
          body="If a purchase request is broken, missing details, or unclear, it is refused right away. A messy request is never treated as permission."
        >
          <span className="hard">An invalid request is refused</span>
        </Clause>

        <Clause
          n="3"
          title="Amount and currency"
          body={`Amounts must be positive and in ${currency}. We do not convert currencies. Anything zero or negative is refused.`}
        >
          <span className="rv">{currency} only</span>
          <span>Zero or negative is refused</span>
          <span className="hard">A different currency is refused</span>
        </Clause>

        <Clause
          n="4"
          title="Allowed categories"
          body="Only the categories listed here can be paid. If the list is empty, nothing is allowed, so it stays safe by default."
        >
          <span className="rv">
            {categories.length ? categories.join(" · ") : "none listed (nothing allowed)"}
          </span>
          <span className="hard">Anything off the list is refused</span>
        </Clause>

        <Clause
          n="5"
          title="Your monthly limit"
          body={`A hard limit of ${money(cap)} for the month, counted only from confirmed payments. It is checked before anything else, so no approval, not even yours, can go over it.`}
        >
          <span className="rv">Limit {money(cap)} · hard</span>
          <span>Counted only from confirmed payments</span>
          <span className="hard">Going over the limit is refused</span>
        </Clause>

        <Clause
          n="6"
          title="The auto-approve line"
          body={`At or under ${money(auto)}, and if everything else is fine, it can proceed without you. Over ${money(auto)}, it asks you first. This line is never waived.`}
        >
          <span className="rv">Auto-approve up to {money(auto)}</span>
          <span className="warn">Over {money(auto)} needs your okay</span>
        </Clause>

        <Clause
          n="7"
          title="First-time sellers"
          body="A seller you have not paid before comes to you every time. An unfamiliar destination is exactly what this gate slows down."
        >
          {newPayee ? (
            <span className="warn">A new seller needs your okay</span>
          ) : (
            <span className="rv">Off · new sellers are not checked by this rule</span>
          )}
        </Clause>

        <Clause
          n="8"
          title="Otherwise"
          body="Anything that passes all of the above is allowed and can be paid automatically with your saved card."
        >
          <span className="rv">Otherwise it is allowed, within your limits</span>
        </Clause>
      </section>

      <div className="order num reveal" style={{ "--i": 4 } as React.CSSProperties}>
        <span className="seq">
          <b>The order it checks:</b>
        </span>{" "}
        <span className="rule">
          1 valid request · 2 positive amount · 3 right currency · 4 allowed category ·
          5 monthly limit · 6 auto-approve line · 7 known seller · 8 allow
        </span>
        <br />
        <span className="seq">
          <b>Strictest wins:</b>
        </span>{" "}
        <span className="strict">a refusal beats &ldquo;needs you&rdquo;, which beats allow</span>
      </div>

      <div className="note reveal" style={{ "--i": 5 } as React.CSSProperties}>
        Your live rules {rules.ruleVersion} · read fresh every time · changes apply to the
        next decision and never rewrite what is already recorded
      </div>
    </>
  );
}
