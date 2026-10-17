import type { ReactNode } from "react";
import { CATALOG } from "@/agent/catalog";
import type { SpendingRules } from "@/core/authorization";
import { money } from "@/lib/format";
import { TRUST_BUDGET_OVER_CAP, TRUST_ITEM_OVER_CAP } from "@/lib/rulesEdit";
import { getService } from "@/lib/service";
import { verifyOwner } from "@/lib/auth/dal";
import { updateRules, updateTrust } from "@/app/(app)/actions";

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
 * quotes the numbers now in force. Cap saves and AI authorization saves never
 * happen at the same time, so one message covers the page.
 */
function savedMessageFor(
  saved: string | undefined,
  rules: SpendingRules | null,
): { text: string; error: boolean } | null {
  const cap = rules ? rules.monthlyCapMinor : 0;
  switch (saved) {
    case "ok":
      // With AI authorization on, "every purchase still needs your okay" would
      // be a lie, so the sentence says what is actually in force.
      if (rules?.autoApproveEnabled) {
        return {
          text: `Saved. Your monthly limit is now ${money(cap)}. AI authorization stays on: your list still decides what it clears on its own.`,
          error: false,
        };
      }
      return {
        text: `Saved. Your monthly limit is now ${money(cap)}. Every purchase still needs your okay.`,
        error: false,
      };
    case "bad-money":
      return {
        text: "That amount does not look right. Use a number above zero, like 150 or 150.00. Nothing was saved.",
        error: true,
      };
    case "trust-on": {
      const n = rules?.autoAllowlist?.length ?? 0;
      const budget = money(rules?.autoBudgetMinor ?? 0);
      if (n === 0) {
        return {
          text: "Saved. AI authorization is on, but your list is empty, so every purchase still comes to you.",
          error: false,
        };
      }
      return {
        text: `Saved. AI authorization is on: ${n} ${n === 1 ? "item" : "items"} at exact prices, auto budget ${budget}. Everything else still comes to you.`,
        error: false,
      };
    }
    case "trust-off":
      return {
        text: "Saved. AI authorization is off. Every purchase waits for you.",
        error: false,
      };
    case "bad-budget":
      return {
        text: "That budget does not look right. Use a number above zero, like 40 or 40.00. Nothing was saved.",
        error: true,
      };
    case "bad-item":
      return {
        text: "A price on your list does not look right. Use a number above zero. Nothing was saved.",
        error: true,
      };
    case "budget-over-cap":
      return { text: `${TRUST_BUDGET_OVER_CAP} Nothing was saved.`, error: true };
    case "item-over-cap":
      return { text: `${TRUST_ITEM_OVER_CAP} Nothing was saved.`, error: true };
    case "norules":
      return {
        text: "Set your monthly limit first, then come back to this.",
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
    const firstMessage = savedMessageFor(saved, null);
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
          <div className="label">Your number</div>
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
            <button type="submit">Save</button>
          </form>
          <p className="hint">
            Save once and your first rule set is written: this limit, the standard
            categories, and your okay needed for every purchase, from every seller.
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
          No rules means no spending. That is the safe default. AI authorization
          appears here after your first rule set is written.
        </div>
      </>
    );
  }

  const currency = rules.currency;
  const cap = rules.monthlyCapMinor;
  const categories = rules.permittedCategories;
  const symbol = currency === "USD" ? "$" : currency;
  const message = savedMessageFor(saved, rules);

  const trustOn = rules.autoApproveEnabled;
  const listed = rules.autoAllowlist ?? [];
  const autoBudget = rules.autoBudgetMinor ?? 0;
  // Each save message shows under the form that produced it.
  const messageIsCap = saved === "ok" || saved === "bad-money";

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
        only suggest. It has no money and no power to approve.{" "}
        {trustOn ? (
          <b>
            Only these rules decide: your list for the exact things on it, and you for
            everything else.
          </b>
        ) : (
          <b>Only these rules, and then you, decide.</b>
        )}{" "}
        Your rules are read fresh every time, and no app can override them.
      </p>

      <section className="rules-edit reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="label">Your number</div>
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
          <button type="submit">Save</button>
        </form>
        <p className="hint">
          Changes apply to the next ask. Past decisions keep the rules they were judged
          under.
        </p>
        {message && messageIsCap ? (
          <p
            className={message.error ? "msg err" : "msg"}
            role={message.error ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <section
        className="rules-edit trust reveal"
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <div className="label">AI authorization</div>
        <form action={updateTrust} className="trust-form">
          <div className="trust-toggle">
            <input id="auto" name="auto" type="checkbox" defaultChecked={trustOn} />
            <label htmlFor="auto">
              <b>Let your rules pay for the exact things on your list.</b>
              <span className="hint">
                {trustOn
                  ? "On now: listed items at the exact prices below, until the auto budget runs out. Everything else still comes to you."
                  : "Off means every purchase waits for you. That is the default."}
              </span>
            </label>
          </div>

          <div className="field">
            <label htmlFor="auto-budget">Auto budget for the month</label>
            <div className="in">
              <span className="cur">{symbol}</span>
              <input
                id="auto-budget"
                name="auto-budget"
                placeholder="40"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={autoBudget > 0 ? money(autoBudget) : undefined}
              />
            </div>
          </div>
          <p className="hint">
            Auto-paying stops when this runs out, even with room under your monthly
            limit. It counts only confirmed payments, like the limit itself.
          </p>

          <div className="trust-items">
            <div className="sec">Your list · exact prices</div>
            <ul>
              {CATALOG.map((item) => {
                const entry = listed.find(
                  (e) => e.payee === item.payee && e.purpose === item.purpose,
                );
                return (
                  <li key={item.id}>
                    <input
                      id={`item-${item.id}`}
                      name={`auto-item-${item.id}`}
                      type="checkbox"
                      defaultChecked={Boolean(entry)}
                    />
                    <label htmlFor={`item-${item.id}`}>
                      <span className="who">{item.payee}</span>
                      <span className="what">{item.purpose}</span>
                    </label>
                    <div className="in">
                      <span className="cur">{symbol}</span>
                      <input
                        name={`auto-amount-${item.id}`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`Price for ${item.payee}`}
                        defaultValue={money(entry ? entry.amountMinor : item.amountMinor)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="hint">
              Tick what your rules may pay for on their own, at the price you set. A
              purchase that arrives at a different price comes to you. Nothing ticked
              means everything comes to you.
            </p>
          </div>

          <button type="submit">Save</button>
        </form>
        {message && !messageIsCap ? (
          <p
            className={message.error ? "msg err" : "msg"}
            role={message.error ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <section className="clauses reveal" style={{ "--i": 4 } as React.CSSProperties}>
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

        {trustOn ? (
          <Clause
            n="6"
            title="Your list, then you"
            body="The exact purchases on your AI authorization list, at the exact prices you set, are paid automatically until your auto budget runs out. A different price comes to you. Everything else waits for your Approve or Decline, whatever the amount."
          >
            <span className="warn">
              {listed.length} {listed.length === 1 ? "item" : "items"} at exact prices ·
              auto budget {money(autoBudget)}
            </span>
            <span className="hard">A different price always comes to you</span>
          </Clause>
        ) : (
          <Clause
            n="6"
            title="Your approval, every time"
            body="Nothing is paid automatically. Anything that passes the checks above waits for your Approve or Decline, whatever the amount. No purchase is small enough to skip you."
          >
            <span className="warn">Every purchase needs your okay</span>
            <span className="hard">No amount is small enough to skip you</span>
          </Clause>
        )}

        {trustOn ? (
          <Clause
            n="7"
            title="Sellers off your list"
            body="A seller not on your list comes to you every time. A seller on your list is paid only for the exact item and price you listed; anything else from them still comes to you."
          >
            <span className="warn">Off-list sellers always need your okay</span>
          </Clause>
        ) : (
          <Clause
            n="7"
            title="First-time sellers"
            body="A seller you have not paid before comes to you every time. So does every seller you know: while AI authorization is off, nothing skips you."
          >
            <span className="warn">A new seller always needs your okay</span>
          </Clause>
        )}

        {trustOn ? (
          <Clause
            n="8"
            title="Otherwise"
            body="Anything your list does not clear still waits for you. Once you approve, it is checked again and paid with your saved card. Auto-paid purchases are checked again right before paying too, and every one of them is marked in your record."
          >
            <span className="rv">Otherwise it waits for you</span>
            <span>Auto-paid purchases are marked as cleared by your rules</span>
          </Clause>
        ) : (
          <Clause
            n="8"
            title="Otherwise"
            body="Anything that passes all of the above still waits for you. Once you approve, it is checked again and paid with your saved card. Nothing is ever paid without your decision."
          >
            <span className="rv">Otherwise it waits for you</span>
          </Clause>
        )}
      </section>

      <div className="order num reveal" style={{ "--i": 5 } as React.CSSProperties}>
        <span className="seq">
          <b>The order it checks:</b>
        </span>{" "}
        <span className="rule">
          1 valid request · 2 positive amount · 3 right currency · 4 allowed category ·
          5 monthly limit · 6 {trustOn ? "your list or your approval" : "your approval"}
        </span>
        <br />
        <span className="seq">
          <b>Strictest wins:</b>
        </span>{" "}
        <span className="strict">a refusal beats &ldquo;needs you&rdquo;, and nothing passes on its own</span>
      </div>

      <div className="note reveal" style={{ "--i": 6 } as React.CSSProperties}>
        Your live rules {rules.ruleVersion} · read fresh every time · changes apply to the
        next decision and never rewrite what is already recorded
      </div>
    </>
  );
}
