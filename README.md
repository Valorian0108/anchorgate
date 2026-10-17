# AnchorGate

**Your AI agent proposes purchases. AnchorGate checks every one against rules that only you can change. Anything else waits for your yes.**

Built for the PayPal AI Hackathon, fall 2026.

**[Open the live gate](https://anchorgate-five.vercel.app)** · free to sign up · runs entirely on PayPal sandbox money, which is practice money, never real money.

<!-- TODO before publishing: add the demo video link here (under 3 minutes) -->

## The problem, in one breath

AI agents can shop now. They can browse, compare, and check out. But nobody sane hands an agent their card and says "be sensible about it." AnchorGate stands between the agent and the money, like a locked gate. The agent can knock all it likes. Your rules open the gate, or your yes opens it. Nothing else does.

## What happens to a purchase

1. **The agent proposes.** A seller, a purpose, a category, an exact amount. Proposing is the only thing an agent can do here. It has no tool that pays for anything.
2. **The gate checks, in a fixed order.** Is the request complete and sensible? Is the currency one you allowed? Is the kind of purchase one you allowed? Is there room under your monthly limit? These checks are plain code, not AI. No model is ever asked whether its own request should pass.
3. **One of three things happens.**
   - **Allowed and paid by your rules.** Only when you switched on AI authorization, and only when the item matches your list exactly: same seller, same purpose, same amount to the cent, and room left in this month's auto budget.
   - **Refused**, naming the rule that refused it, in plain words. A hard refusal stays refused. No approval button can move it.
   - **It comes to you.** Everything else waits for a person: you approve and it pays, or you decline.
4. **Payment runs through PayPal.** Money counts only when PayPal confirms it, and a confirmed payment counts exactly once. A capture still pending is watched until it settles or lets go.
5. **Everything goes on the record.** Every purchase has a page showing each check that ran, the decision, which version of your rules made it, and the PayPal reference. The checks run when a purchase is suggested, and again right before it pays. Your rules are never remembered from last time. They are read fresh, every time.

## The rules only you can change

On the Rules page you set your monthly limit, the kinds of purchases you allow, and the currency. Until you write your first rule set, nothing can be approved at all. That is deliberate. The gate fails safe.

**AI authorization** is the optional part, and it is off by default. When you switch it on, you get three things:

- **Your list.** Exact items at exact prices. "Printer paper, restock, $22.00" pays itself. Printer paper at $22.01 does not. It comes to you showing both numbers.
- **One auto budget for the month**, always inside your monthly limit. When it runs out, auto-paying stops and the gate asks you again, saying plainly that the budget is why.
- **A meter**, so you are never surprised. The Rules page shows how much of the budget has been used, and the gate's wall carries the same figure. Switch the feature off and everything returns to asking you. It is one switch.

Only you can save rules. Every decision on record names the version of your rules that made it, so you can always see which rulebook was in force.

## The promises the gate keeps

- Nothing pays itself unless it matches your list to the cent.
- Every auto-paid purchase is marked, on its card, on its record, and on the wall.
- Every refusal and every ask names its reason in plain words. No codes, no shrugs.
- Money is counted only when the payment is confirmed, and only once.
- At the top of the gate sits **the wall**: your monthly limit as a hard line, with what is spent, what is set aside for waiting purchases, what is left, and what your rules auto-paid. Approvals cannot move the limit line. Nothing can, except you changing your rules.

## The demo agent

A built-in agent proposes items from a fixed catalog of fourteen, one at a time: a coffee subscription, printer paper, software seats, all the way up to a team flight. The loop runs from your first minute, with nothing to wire up.

You can also type any purchase into the ask box in your own words. That uses whichever AI model you configure. The model writes the proposal. The decision never involves a model.

<!-- TODO before publishing: replace these slots with real screenshots
     1. the gate: the wall on top, a card waiting on you, the ask box
     2. a paid card: "your rules cleared it · paid once" with its PayPal reference
     3. a record page: every check, the decision, the ALLOWED stamp
     4. the Rules page: your limit, your exact-price list, the auto budget meter -->

## Run it yourself

You need, all free tier is fine:

- **Node.js 20** or newer
- A **Supabase** project. It provides the database (Postgres) and the email plus password sign-in.
- A **PayPal Developer sandbox app**, for the client ID and secret.
- Optionally, an API key for any AI model service that speaks the common OpenAI-style API. This powers the ask box. The rest of the app works without it.

```bash
git clone https://github.com/Valorian0108/anchorgate.git
cd anchorgate
npm install
```

Copy `.env.example` to `.env` and fill in:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Supabase connection string, the pooled one on port 6543 |
| `DATABASE_URL_DIRECT` | Supabase direct connection on port 5432, used once for migrations |
| `PAYPAL_ENV` | Leave it as `sandbox`. Any other value is refused at startup |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | From your PayPal sandbox app |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | From your Supabase project settings |
| `SESSION_SECRET` | Any long random string |
| `AGENT_BASE_URL`, `AGENT_API_KEY`, `AGENT_MODEL` | Optional. For the ask box |
| `OWNER_EMAIL` | Optional. Emailed sign-in links are limited to this one address so nobody can use the app to mail strangers. Everyone else signs in with a password |

Then:

```bash
npm run db:migrate   # creates the tables
npm run dev          # open http://localhost:3000
```

Sign up with an email and a password. Depending on your Supabase settings you may confirm by email first. The app tells you honestly which case you are in.

To check the code before trusting it:

```bash
npm test         # 313 automated checks: the decision engine, the money math, the whole lifecycle
npm run typecheck
npm run build
```

One safety sentence: the PayPal adapter refuses to start against any environment that is not sandbox, so this app cannot move real money, even by accident.

## What this is not

- **Not real-money software.** Sandbox only, enforced in code, permanently.
- **Not audited.** It is a hackathon build that proves a pattern: a deterministic gate between agents and payments.
- **One person per gate.** Each account is one owner's rules, one owner's wall.
- **Not tied to the demo agent.** The built-in feed proposes from a fixed catalog, but any agent, real or simulated, meets the same gate and the same rules. The gate does not care who knocks.

## Built with

- **Next.js 16, React 19, TypeScript** for the app
- **PayPal Server SDK**: orders, captures, and a vaulted sandbox card, with pending captures reconciled until confirmed
- **Postgres** with **Drizzle ORM**, hosted on Supabase
- **Supabase Auth**: email plus password, with an optional emailed link
- **Vercel AI SDK**, pointed at any OpenAI-compatible model
- **Vitest** for the automated checks
- Deployed on **Vercel**

## Licence

MIT © 2026 Ife Demi
