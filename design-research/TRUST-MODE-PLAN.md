# Trust Mode: the change plan ("AI authorization")

16 oct 2026. Owner said proceed. This document is the plan of record: every
change, every new sentence the product will say, and every promise the feature
must keep. Nothing was implemented when this was written.

The four decisions taken (owner approved the recommendations, 16 oct):

1. Listed items carry an EXACT price. Not "up to".
2. A price that differs from your list lands in the queue as a question, with a
   plain reason. It is never auto-declined.
3. There is ONE extra number: an auto budget for the month. Auto-paying stops
   when it runs out, even if the monthly cap has room.
4. This builds before packaging (README, video, Devpost).

---

## Part one: what this is, in plain words

Today every purchase waits for you, whatever the amount. Trust mode adds one
narrow exception that you control completely:

- On the Rules page you get a new section, **AI authorization**. It starts OFF
  and stays off until you switch it on.
- When it is on, you pick items from the same fourteen real items your feed
  uses, and each one carries the exact price you set. You also set one number:
  your auto budget for the month.
- From then on, a purchase is paid without you ONLY when all of this is true:
  it matches one of your listed items exactly (same seller, same purpose, same
  price to the cent), your auto budget has room, and it passes every hard rule
  that already exists (category, currency, monthly limit).
- Anything else, including a listed item that arrives at a different price,
  comes to you exactly like today, and the record says plainly why.
- Every auto-paid purchase is marked in the Record and in its case file: your
  rules cleared it, under which rule set, for how much. Nothing hides.

The monthly limit still beats everything. Approval of any kind, automatic or
yours, can never cross it. That does not change.

Two consequences worth saying out loud, because they follow from the decisions
above:

- The ask box can auto-pay too. If you type "get me the Notion workspace" and
  the assistant files it at the exact price on your list, your rules clear it
  and it is paid. The box tells you so honestly, with the payment reference.
- The old dormant "auto line" (a per-purchase amount that would have cleared
  anything below it) is retired for good. There is exactly one automatic path:
  your list, at your exact prices. One rule, no fine print.

---

## Part two: the promises (invariants this feature must not break)

1. Toggle off is the default and is indistinguishable from today. With it off,
   every purchase inside the cap asks. No behavior change at all.
2. The list is the ONLY automatic path. Exact match on payee, purpose, and
   price, all three, or it asks.
3. Hard rules win over the list, always: invalid request, bad amount, wrong
   currency, unpermitted category, monthly cap. The engine order does not move;
   the list is checked last, where the old approval check sits.
4. The auto budget is a second ceiling under the cap. Auto spending is counted
   only from confirmed payments, the same honesty as the cap.
5. Fail-safe everywhere: missing list means nothing matches; zero budget means
   nothing auto-pays; unreadable rules deny everything (unchanged).
6. Payment still re-runs the engine immediately before money moves (the
   existing pre-execution gate). If rules changed between proposal and payment,
   the purchase drops back into your queue instead of paying.
7. Every auto-paid purchase is visibly marked: card receipt, record row, case
   file trail, and an immutable ledger entry.
8. The database change is additive only (three new columns with safe
   defaults). The live site keeps running the old code against the new schema
   with zero behavior change until the new code deploys.

---

## Part three: the changes, file by file

### Core (pure, deterministic)

**`src/core/authorization/types.ts`**
- New exported interface `AutoAllowlistEntry { payee: string; purpose: string;
  amountMinor: number }`.
- `SpendingRules` gains `autoAllowlist?: readonly AutoAllowlistEntry[]` and
  `autoBudgetMinor?: number`. Optional on purpose: missing means empty list and
  zero budget, the safe direction, so every existing fixture and stored rule
  set keeps working. `autoApproveEnabled` becomes persisted (docstring
  updated; it stops saying "not persisted yet").
- `ReasonCode` gains four codes: `ON_TRUST_LIST` (the only ALLOW the auto path
  can return), `NOT_ON_TRUST_LIST` (ASK), `AMOUNT_OFF_TRUST_LIST` (ASK),
  `AUTO_BUDGET_USED` (ASK). `PER_PURCHASE_LIMIT_EXCEEDED` and `WITHIN_LIMITS`
  stay in the enum for historical records only.
- `SpendingState` gains `autoSpentThisMonthMinor?: number` (missing = 0).

**`src/core/authorization/validation.ts`**
- `parseRules`: validates `autoAllowlist` when present (array of entries, each
  with non-empty payee/purpose and a positive safe-integer amount; malformed
  fails the whole parse, which denies everything, same philosophy as today) and
  `autoBudgetMinor` when present (non-negative safe integer). Parsed output
  always carries normalized values (array present, number present).
- `parseState`: accepts optional `autoSpentThisMonthMinor`, non-negative safe
  integer, defaults to 0.

**`src/core/authorization/engine.ts`**
- Steps 1 through 5 untouched. Step 6 (flag off asks) untouched.
- Steps 6a/6b/7 (the old per-purchase line and new-payee check) are REPLACED
  by the trust-list branch, which runs only when the flag is on:
  - 6a. Find a list entry with the same payee AND purpose. None: ASK
    `NOT_ON_TRUST_LIST`.
  - 6b. Entry exists but its amount differs from the request: ASK
    `AMOUNT_OFF_TRUST_LIST` (reason quotes both amounts).
  - 6c. `autoSpent + amount > autoBudget`: ASK `AUTO_BUDGET_USED` (reason
    quotes budget and spent). A zero budget always asks.
  - 7. Otherwise ALLOW `ON_TRUST_LIST`.
- `perPurchaseAutoLimitMinor` and `requireApprovalForNewPayee` remain stored
  and parsed but the engine no longer reads them. The header comment documents
  the retirement and the owner decision.

**`src/core/spending/types.ts` + `validation.ts`**
- New informational ledger kind `AUTO_APPROVED` (added to the union and to
  `SPENDING_EVENT_KINDS`). It never affects any total; it marks which requests
  your rules cleared, which is how the auto budget is computed and how the
  case file can say "your rules cleared this" forever after.

### Services

**`src/services/spendingState.ts`**
- `readSpendingState` also returns `autoSpentThisMonthMinor`: one pass over the
  ledger events, summing `CAPTURE_VERIFIED` amounts in the current UTC month
  whose request carries an `AUTO_APPROVED` event. Same period semantics as the
  cap; pending captures do not count until they settle.

**`src/services/purchaseService.ts`**
- No semantic change. `pay()` already handles `AUTHORIZED` records through the
  pre-execution re-gate. (Existing behavior, newly reachable.)

### Persistence

**`src/infra/persistence/schema.ts`** (`spending_rules` gains three columns)
- `auto_approve_enabled boolean NOT NULL DEFAULT false`
- `auto_allowlist jsonb NOT NULL DEFAULT '[]'`
- `auto_budget_minor bigint NOT NULL DEFAULT 0`

**`drizzle/0006_*.sql`** generated by `npm run db:generate` from the schema
change, reviewed by hand, applied with `npm run db:migrate` (direct session-mode
connection). Additive with defaults: the live old code never reads these
columns and keeps behaving exactly as now. PGlite (tests) applies the same
migration.

**`src/infra/persistence/mappers.ts`**
- `toRulesRow` writes the three columns (`autoAllowlist ?? []`,
  `autoBudgetMinor ?? 0`). `toSpendingRules` passes the stored values into
  `parseRules`. Both "no column yet" comments are retired.

### Wiring (server)

**`src/lib/service.ts`**
- New `settleAutoAuthorized(userId, record)`: for a record the engine just
  cleared (`AUTHORIZED`), it records the `AUTO_APPROVED` ledger event (id
  `auto-approved:<requestId>`, idempotent), then calls the existing
  `pay(id, { reconcilePending: true })`, and returns the final record plus the
  short capture reference when there is one. If payment fails, the record stays
  cleared-but-unpaid and every screen says so honestly; nothing retries on its
  own.
- `surfaceNextCatalog`: when a feed proposal comes back `AUTHORIZED`, settle it
  and return the settled record, so the Gate shows the arrival already paid.

**`src/app/(app)/actions.ts`**
- `proposeFromGate`: after the agent run, a filed ALLOW is settled through
  `settleAutoAuthorized`, and the redirect carries the true outcome:
  `ask=paid` (with `ref` when a capture was verified), `ask=stalled` (cleared
  but the payment did not go through), `ask=needs&why=...` (rules changed
  mid-flight and it dropped into your queue), `ask=blocked&why=...` (unchanged
  shape).
- New `updateTrust` server action for the AI authorization form: toggle, auto
  budget, and the checked items with their prices. Item identities (payee,
  purpose) come from the CATALOG constant, never from form text; only the
  checkbox and the price come from the form, and the price must parse. Saving
  bumps the rule version. Failure paths are plain one-line codes:
  `bad-budget`, `bad-item`, `norules`. The existing cap form (`updateRules`)
  is untouched and keeps trust fields as they are (it already spreads the
  current set).

### Copy (every new sentence the product says, pinned here)

**`src/lib/vocab.ts`**
- `reasonPhrase`: `ON_TRUST_LIST` "on your list"; `NOT_ON_TRUST_LIST` "not on
  your list"; `AMOUNT_OFF_TRUST_LIST` "price differs from your list";
  `AUTO_BUDGET_USED` "auto budget used up".
- `checkText` ALLOW: `ON_TRUST_LIST` "It matches your trust list exactly, so
  your rules cleared it." ASK: `NOT_ON_TRUST_LIST` "It is not on your trust
  list, so it needs your okay."; `AMOUNT_OFF_TRUST_LIST` "The price differs
  from the one on your trust list, so it needs your okay."; `AUTO_BUDGET_USED`
  "Your auto budget for the month is used up, so it needs your okay."
- The `AUTHORIZED` status copy stops claiming "older rules" and "the gate asks
  you first now" (both become false). New: `checkTextForStatus` "Your rules
  cleared this. It has not been paid."; `stateWord` "cleared, not paid".

**`src/lib/gateCard.ts`**
- `EXECUTED` receipt branches on whether a human approved: "you approved ·
  paid once" (unchanged) vs "your rules cleared it · paid once".
- `PENDING_SETTLEMENT` auto variant: "your rules cleared it · waiting for it
  to settle".
- `AUTHORIZED` card: mark "Cleared", receipt "your rules cleared it · not
  paid yet". (Honest for legacy rows too: rules cleared them, they were never
  paid.)

**`src/lib/askOutcome.ts`**
- New outcome kinds `paid` (optional `ref`) and `stalled`; paths `/?ask=paid`
  (plus `&ref=` when verified) and `/?ask=stalled`.
- Messages: paid "Your rules cleared this at the exact price on your list, and
  it is paid." plus "Reference XXXX." when there is one; stalled "Your rules
  cleared it, but the payment did not go through. No money moved."; the old
  `allow` message loses its "ready to pay when you press pay" claim (it would
  be a lie now) and reads "Added below. Your rules cleared it."; `needs`
  appends the reason phrase when the URL carries one ("Added below. It needs
  your okay: price differs from your list.").
- `REASON_CODES` gains the four new codes for slug round-tripping.

**`src/agent/proposal.ts` (`describeRules`)**
- Flag off: unchanged ("Auto-approve is OFF...").
- Flag on: the model is told the truth, entry by entry: "AI authorization is
  ON. These exact purchases clear automatically (seller, purpose, price):" one
  line per entry, then "Auto budget for the month: $X." then "Anything not on
  that list, at a different price, or after the budget runs out waits for the
  owner." Empty list: "AI authorization is ON but the list is empty: every
  proposal still waits for the owner." This is also what makes a typed ask
  match: the model sees the exact strings your list carries.

### Rules page (`src/app/(app)/statute/page.tsx` + `globals.css`)

- New "AI authorization" section between the number and the clauses, styled
  with the existing rules-edit/clause patterns (paper tier, no new visual
  vocabulary): the toggle, the fourteen items as checkbox rows with editable
  prices prefilled from the catalog, the auto budget field, its own Save.
  Off-state hint: "Off means every purchase waits for you. That is the
  default." Budget hint: "Auto-paying stops when this runs out. Everything
  else still comes to you." Item list may be empty; the page says plainly that
  an empty list sends everything to you.
- Clauses 6, 7, 8 and the order line render honest trust-mode variants when
  the toggle is on (list first, then you; sellers off your list always come to
  you; the hard checks unchanged). Toggle off renders today's copy verbatim.
- `savedMessageFor` gains the trust codes, quoting the fresh numbers:
  trust-on "Saved. AI authorization is on: N items, auto budget $X. Everything
  else still comes to you."; trust-off "Saved. AI authorization is off. Every
  purchase waits for you."; plus `bad-budget`, `bad-item`, `norules` ("Set
  your monthly limit first, then come back to this.").

### Record and case file

- `record/page.tsx`: rows for confirmed payments say who decided: "you
  approved" (has an approval) vs "your rules" (none). The data is already
  there; this only surfaces it.
- `requests/[id]/page.tsx`: the trail already lists evaluations (the new
  reason codes render through vocab) and ledger events; the `AUTO_APPROVED`
  event gets a display line "your rules cleared this".
- Gate (`(app)/page.tsx`): reads the new `ref` search param for the paid
  message. The feed arrival of an auto-paid item renders through the existing
  paid card (gate-card already switches on record status; the settled column
  placement is verified during the build).
- Away badge unchanged: it counts what waits on you, and an auto-paid item by
  definition does not. The Record and the feed's settled column carry that
  story.

### Rules-edit helpers (`src/lib/rulesEdit.ts`)

- `startingRules` gains `autoAllowlist: []`, `autoBudgetMinor: 0` (toggle
  already false).
- New pure helpers, unit-tested: `buildTrustEntry` (validates one form row into
  an entry) and `trustProblem(budgetMinor, entries, capMinor)` returning plain
  sentences: budget above cap "Your auto budget cannot sit above your monthly
  limit."; a list price above cap "A price on your list cannot sit above your
  monthly limit.". The dormant `ruleEditProblem` stays as is.

### Canon (`design-research/CONSTRAINTS.md`)

- New §6(k) logging this decision set (16 oct 2026): exact prices, mismatch
  asks, one auto budget under the cap, toggle off by default, the list as the
  only automatic path, the per-purchase auto line retired, the `AUTHORIZED`
  copy change, the new reason codes, ledger kind, and every pinned string
  above. Frozen lines that say auto-approve ships off are amended to "off by
  default" with dated history untouched.

---

## Part four: tests

- **Engine** (the heart): flag off behaves exactly as today; flag on with no
  match asks `NOT_ON_TRUST_LIST`; match at a different price asks
  `AMOUNT_OFF_TRUST_LIST`; exact match inside budget allows `ON_TRUST_LIST`;
  budget exhausted asks `AUTO_BUDGET_USED`; zero budget asks; cap and category
  beat the list (DENY unchanged); malformed list denies everything. The old
  auto-line tests are replaced by these (deliberate semantic change, logged in
  canon).
- **Validation**: new fields parsed, defaulted, and rejected correctly; old
  fixtures without them still parse.
- **Spending**: `AUTO_APPROVED` accepted, informational, never counted.
- **Spending state**: auto spending sums only verified captures of
  auto-approved requests, only inside the current month.
- **Service composition** (in-memory stores): propose under trust rules →
  cleared → pay → executed, with the `AUTO_APPROVED` event recorded and the
  budget reflected on the next evaluation; mid-flight rule change drops the
  record into the queue instead of paying.
- **Copy**: vocab, gateCard, askOutcome pinned strings above.
- **Rules edit**: entries, guardrails, version bump.
- **Persistence**: rules round-trip with the three new columns through PGlite.

---

## Part five: order of work and deployment

1. Implement everything above locally; typecheck, full test suite, build.
2. Apply the migration to the live database (additive only). Verify the live
   site is still healthy on the OLD code (it must be: nothing reads the new
   columns yet).
3. Local verification against the live database through a short-lived prod
   server (minutes, not hours): sign in on the test account, turn AI
   authorization on, list two items (one at its catalog price, one at a
   different price), set a small budget; watch a matching ask auto-pay with a
   reference; watch the mismatched feed item land in the queue with its honest
   reason; watch the budget stop the next match; toggle off and confirm
   everything asks again. Kill the server, check live health.
4. Commit. Push only on the owner's word; Vercel redeploys; verify live.

Judge/demo note: the toggle ships OFF for every account, including the judge
demo account. The demo video is where it gets switched on, on camera.

## Known limits (honest)

- Two auto proposals racing could both pass the budget check before either
  capture lands. The hard cap still bounds the worst case, and the feed is
  paced at one arrival per twenty seconds, so this is demo-scale negligible.
  Documented, not silently ignored.
- If the provider declines an auto-cleared payment, the record stays
  "cleared, not paid" with honest copy and no money moved. There is no
  automatic retry; a retry affordance can be added later if it ever matters.
- A typed ask auto-pays only when the model's filed seller and purpose match
  your list exactly. `describeRules` hands the model the exact strings; a near
  miss simply comes to you, which is the safe direction.
