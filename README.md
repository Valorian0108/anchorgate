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

Early development. The **authorization core** (deterministic decision engine),
the **purchase lifecycle** (approval handling and revalidation), **spending
accounting** (counts only verified captures, exactly once), **durable
storage** (PostgreSQL, including the persisted spending rules), and the
**authorization-gated payment execution** plus the **PayPal Sandbox adapter**
(orders create + capture against a vaulted payment method) are implemented and
tested. The PayPal adapter is unit-tested with fakes and has a one-command live
Sandbox verification (`npm run sandbox:verify`); a real Sandbox run is still
pending Sandbox credentials. The AI agent and the UI are not built yet. The UI
has not been designed or approved.

## Tech stack

- **Next.js + TypeScript** (full-stack, single repo)
- **PostgreSQL** (Supabase) with **Drizzle ORM** for durable storage
- **PayPal Server SDK** (`@paypal/paypal-server-sdk`), Sandbox only
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
   `DATABASE_URL_DIRECT` from your Supabase project
   (Project Settings → Database). **Never commit `.env`** — it is gitignored.
2. Apply the committed migrations: `npm run db:migrate`
   (regenerate them after schema changes with `npm run db:generate`).

### PayPal Sandbox setup (only needed to run real payments)

PayPal is **Sandbox-only**. The code refuses any non-Sandbox environment.
Create a Sandbox app in the PayPal Developer Dashboard (Apps & Credentials →
Sandbox), then set `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, and
`PAYPAL_CLIENT_SECRET` in your local `.env`. To let the agent pay without a human
present, the user also completes a one-time **vault enrollment** (saving a
payment method); without it, payments fail safe.

#### Verify the PayPal path against Sandbox

Once the PayPal Sandbox variables are in `.env`, run:

```bash
npm run sandbox:verify
```

This drives the real code path once: it starts a **vault enrollment** (you approve
saving a payment method in the browser with your Sandbox *personal* account),
then proposes a tiny purchase, runs the deterministic authorization engine, and —
only if the engine returns `ALLOW` — creates and captures a real Sandbox payment,
verifies the receipt, and counts it exactly once in the spending ledger. It
prints the provider capture id and the ledger total. Credentials and the vault
token are never printed. The script is Sandbox-only and uses an in-memory vault
for this one-shot check; the app stores vault tokens durably in PostgreSQL.

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
      execute.ts       # re-check -> pay -> verify -> record (exactly once)
      execute.test.ts
    payments/          # saved (vaulted) payment methods
      types.ts         # SavedPaymentMethod vocabulary
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
      ports.ts         # narrow SDK ports (orders, vault)
      gateway.ts       # PaymentGateway implementation (create + capture)
      vault.ts         # one-time vault enrollment
      money.ts         # minor units <-> PayPal decimal strings
  app/                 # Next.js shell (placeholder only)
scripts/
  sandbox-verify.ts    # one-command live PayPal Sandbox verification (real payments)
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
