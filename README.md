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

Early development. The **authorization core** (deterministic decision engine and
its tests) is implemented. Database, PayPal execution, the AI agent, and the UI
are not built yet. The UI has not been designed or approved.

## Tech stack

- **Next.js + TypeScript** (full-stack, single repo)
- **Vitest** for tests

## Getting started

Requires **Node.js 20+**.

```bash
npm install
npm test        # run the authorization test suite
npm run dev     # start the app (placeholder page only, for now)
```

## Project layout

```
src/
  core/
    authorization/     # the independent, deterministic decision engine
      types.ts         # core vocabulary (requests, rules, decisions)
      validation.ts    # runtime parsing of untrusted input
      engine.ts        # evaluatePurchase(...) — the security boundary
      engine.test.ts   # tests mapped to the acceptance criteria
  app/                 # Next.js shell (placeholder only)
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
