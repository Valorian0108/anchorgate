# Spending Authorization

An application that lets a person give an AI agent limited authority to make
purchases through PayPal, while an independent authorization layer checks each
proposed purchase against the person's rules.

> **The AI may propose an action, but it must not decide or expand its own
> authority.**

The defining behavior is the **independent authorization check** between a
purchase request and payment execution. Decisions come from deterministic
application logic — never from asking the AI whether its own request should be
allowed.

## Status

Early development but functionally complete through the core flow. The
**authorization core** (deterministic decision engine), the **purchase
lifecycle** (approval handling and revalidation), **spending accounting**
(counts only verified captures, exactly once), **durable storage** (PostgreSQL,
including the persisted spending rules), the **authorization-gated payment
execution**, and the **PayPal Sandbox adapter** (orders create + capture against
a vaulted payment method) are implemented and tested. The PayPal path is
**live-verified against Sandbox** (`npm run sandbox:verify`): a card vault was
`ALLOW`ed, captured, and counted exactly once.

The **AI agent** (Phase 5) is implemented: it can only *propose* purchases,
through a single tool named `propose_purchase`, and every proposal is decided by
the existing deterministic engine. The agent has **no payment tool**. The **UI**
has not been designed or approved, and is intentionally not built yet.

## Tech stack

- **Next.js + TypeScript** (full-stack, single repo)
- **PostgreSQL** (Supabase) with **Drizzle ORM** for durable storage
- **PayPal Server SDK** (`@paypal/paypal-server-sdk`), Sandbox only
- **Vercel AI SDK** (`ai`) with an **OpenAI-compatible** provider
  (`@ai-sdk/openai-compatible`) — the agent talks to Experiential Labs'
  OpenAI-compatible gateway (or any compatible endpoint)
- **Vitest** for tests; **PGlite** (in-process PostgreSQL) for persistence tests

## Getting started

Requires **Node.js 20+**.

```bash
npm install
npm test        # run the test suite (no database required)
npm run typecheck
npm run dev     # start the app (placeholder page only, for now)
```

### Database setup (only needed to run against a real database)

The tests run against an **in-process PostgreSQL engine**, so `npm test` needs no
database. To point the app at your Supabase database:

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and
   `DATABASE_URL_DIRECT` from your Supabase project (click **Connect** in the
   dashboard; choose the **Transaction pooler** for `DATABASE_URL` and the
   **Session pooler** for `DATABASE_URL_DIRECT`, then replace
   `[YOUR-PASSWORD]` — including the brackets — with your database password).
   **Never commit `.env`** — it is gitignored.
2. Apply the committed migrations: `npm run db:migrate`
   (regenerate them after schema changes with `npm run db:generate`).
3. Verify the connection and schema: `npm run db:check` — prints the tables and
   their row counts, and fails if a migration is missing.

### PayPal Sandbox setup (only needed to run real payments)

PayPal is **Sandbox-only**. The code refuses any non-Sandbox environment.
Create a Sandbox app in the PayPal Developer Dashboard (Apps & Credentials →
Sandbox), then set `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, and
`PAYPAL_CLIENT_SECRET` in your local `.env`. To let the agent pay without a human
present, the user also completes a one-time **vault enrollment** (saving a
payment method); without it, payments fail safe.

> **Enable Vault on the app:** open the app and go to **Sandbox App Settings →
> App Feature Options**, check **Accept payments**, expand **Advanced options**,
> and enable **Vault**. Vaulting must be on, or setup-token calls fail with
> HTTP 403 `NOT_AUTHORIZED`. (Vaulting is supported in the US, Canada, much of
> Europe, Australia, and parts of Asia; use a US Sandbox business account if
> unsure.)

> **Filename matters:** the file must be named exactly `.env`. On Windows,
> Notepad may silently save it as `.env.txt`, which the app will not read. Turn on
> "File name extensions" in File Explorer to check.

#### Verify the PayPal path against Sandbox

Once the PayPal Sandbox variables are in `.env`, run:

```bash
npm run sandbox:verify          # card vault (server-side, no browser)
npm run sandbox:verify:wallet   # PayPal wallet vault (browser approval)
```

Either mode drives the real code path once: it enrolls a **vault**, proposes a
tiny purchase, runs the deterministic authorization engine, and — only if the
engine returns `ALLOW` — creates and captures a real Sandbox payment, verifies
the receipt, and counts it exactly once in the spending ledger. It prints the
provider capture id and the ledger total. Credentials and the vault token are
never printed. The script is Sandbox-only and uses an in-memory vault for this
one-shot check; the app stores vault tokens durably in PostgreSQL.

- **Default (card):** enrolls PayPal's standard Sandbox **test card** server-side.
  PayPal settles the capture immediately, so this is the green end-to-end check.
- **`--wallet`:** you approve saving a PayPal wallet in the browser with your
  Sandbox *personal* (buyer) account. In Sandbox, PayPal often holds the resulting
  capture as `PENDING_REVIEW`; the runner reports **`PENDING`** and counts
  **nothing**, which is the correct behavior — a capture is only counted once it
  has actually settled. (Reconciliation re-reads the capture and counts it once it
  settles.)

### AI agent setup (only needed to run the agent)

The agent **proposes** purchases; the deterministic engine decides. It talks to
an **OpenAI-compatible** chat endpoint (the default is Experiential Labs, an
OpenAI-compatible gateway/router). Set these in your local `.env`:

- `AGENT_API_KEY` — your key. **Never paste it into chat, code, screenshots, or
  commits.**
- `AGENT_MODEL` — the model id/alias to use. List choices with
  `npm run agent:models` (it calls the provider with your local key and prints
  the ids), or copy one from the provider's Models page.
- `AGENT_BASE_URL` — optional; defaults to
  `https://api.experientiallabs.ai/v1`.
- `AGENT_ID` — optional label recorded on each proposed purchase.

Then run a proposal:

```bash
npm run agent -- "buy a 49 dollar software license from Acme"
# or interactively:
npm run agent
```

The agent interprets the request, calls `propose_purchase`, and prints the
engine's `ALLOW` / `ASK` / `DENY` decision. **It never pays**: payment happens
through the authorization-gated execution layer, never the model. If
`DATABASE_URL` is set, proposals (and their decisions) are stored in your durable
database; otherwise an in-memory store is used. If no spending rules exist yet, a
clearly-labelled demo rule set (`demo-1`, a hard $200/month cap) is saved so the
demo runs.

## Project layout

```
src/
  core/
    authorization/     # the independent, deterministic decision engine
      types.ts         # core vocabulary (requests, rules, decisions)
      validation.ts    # runtime parsing of untrusted input
      engine.ts        # evaluatePurchase(...) — the security boundary
      engine.test.ts   # tests mapped to the acceptance criteria
    purchases/         # purchase lifecycle and approval handling
      types.ts         # record, status, evaluation, approval vocabulary
      fingerprint.ts   # binds approvals to a request's material details
      lifecycle.ts     # propose / approve / reject / revalidate
      store.ts         # storage interface + in-memory implementation
      lifecycle.test.ts
    spending/          # spending accounting (event log)
      types.ts         # spending event vocabulary + summary
      validation.ts    # validates events; capture idempotency key
      ledger.ts        # totals from verified captures; idempotent writer
      store.ts         # storage interface + in-memory implementation
      ledger.test.ts
    execution/         # authorizer-gated payment execution
      types.ts         # PaymentGateway port + payment vocabulary
      execute.ts       # re-check -> pay -> verify -> record (exactly once);
                       # pending captures + reconciliation
      execute.test.ts
    payments/          # saved (vaulted) payment methods
      types.ts         # SavedPaymentMethod vocabulary (sourceType: paypal/card)
      store.ts         # storage interface + in-memory implementation
  infra/
    persistence/       # durable storage (Drizzle ORM + PostgreSQL/Supabase)
      schema.ts        # purchases, evaluations, spending events, rules, payment methods
      client.ts        # pooled Postgres client factory
      purchaseStore.ts # PurchaseStore backed by PostgreSQL
      spendingStore.ts # SpendingStore backed by PostgreSQL
      ruleStore.ts      # SpendingRulesStore backed by PostgreSQL
      paymentMethodStore.ts # vault tokens backed by PostgreSQL
      persistence.test.ts
    paypal/            # PayPal Sandbox adapter (server-only)
      config.ts        # SDK client + env config (refuses production)
      ports.ts         # narrow SDK ports (orders, payments, vault)
      gateway.ts       # PaymentGateway implementation (create + capture,
                       # card/wallet source, PENDING + checkCapture)
      vault.ts         # vault enrollment (PayPal wallet + server-side card)
      money.ts         # minor units <-> PayPal decimal strings
  agent/               # the AI agent (proposal only)
    config.ts          # env config; reports missing var NAMES, never values
    model.ts           # OpenAI-compatible model construction
    proposal.ts        # deterministic bridge into the authorization engine
    tools.ts           # the ONLY tool: propose_purchase (no payment tool)
    agent.ts           # instructions + generateText composition
    agent.test.ts
  app/                 # Next.js shell (placeholder only)
scripts/
  sandbox-verify.ts    # one-command live PayPal Sandbox verification (real payments)
  db-check.ts          # connect to the durable DB and confirm the schema
  agent-cli.ts         # npm run agent: propose a purchase via the AI agent
  agent-models.ts      # npm run agent:models: list models from the endpoint
```

## Authorization decisions

| Decision | Meaning |
| --- | --- |
| `ALLOW` | Satisfies the rules; may proceed to payment execution. |
| `ASK` | Needs explicit human approval for this specific request. |
| `DENY` | Violates a hard constraint; must not reach payment execution. |

Decision order (strictest answer wins: `DENY` > `ASK` > `ALLOW`):

1. Validate the request (malformed/missing fails safe → `DENY`)
2. Reject zero / negative amounts
3. Reject a currency that does not match the configured rules
4. Reject a category that is not explicitly permitted
5. Reject if it would exceed the hard monthly cap (approval cannot override)
6. `ASK` if above the per-purchase limit, or another approval condition applies
7. Otherwise `ALLOW`

## Notes

- Money is handled as integer **minor units** (e.g. cents) to avoid
  floating-point errors. The MVP does not perform currency exchange.
- PayPal is used in **Sandbox only** for this project.

See `architecture.md` for the full specification and `OPEN-DECISIONS.md` for the
running record of decisions and open questions.

## License

[MIT](./LICENSE) — see the `LICENSE` file at the root of the repository.
