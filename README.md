# AnchorGate

**Your AI agent proposes purchases. AnchorGate checks every one against rules that only you can change. Anything else waits for your yes.**

Built for the PayPal AI Hackathon, fall 2026.

**[Open the live gate](https://anchorgate-five.vercel.app)** · free to sign up · runs entirely on PayPal sandbox money, which is practice money, never real money.

<!-- TODO before publishing: add the demo video link here (under 3 minutes) -->

## The problem, in one breath

AI agents can shop now. They can browse, compare, and check out. But nobody sane hands an agent their card and says "be sensible about it." AnchorGate stands between the agent and the money, like a locked gate. The agent can knock all it likes. Your rules open the gate, or your yes opens it. Nothing else does.

## The whole machine in one picture

```
          proposes                 decides                pays
agent ─────────────▶ THE GATE ─────────────▶ PayPal ─────────────▶ record
(any, real or        plain code,             capture               every check,
 simulated)          never a model.          confirmed,            the decision,
                     Checks, in order:       counted once.         whose rules,
                     1 valid request                  │            who approved,
                     2 positive amount                ▼            when.
                     3 right currency         signed webhook:
                     4 allowed category       PayPal's signature,
                     5 room under your        checked against
                       monthly limit          PayPal's certificate,
                     6 your approval          stored on the record.

Three verdicts, and only three:
  REFUSED             names the rule in plain words; stays refused
  ASKS YOU            you approve and it pays, or you decline
  PAID BY YOUR RULES  only with AI authorization on: exact seller,
                      purpose and price on your list, budget left,
                      not already auto-paid this month
```

Three things the picture cannot say:

- The agent has no tool that pays for anything. Proposing is the only thing it can do here, and no model is ever asked whether its own request should pass.
- A payment counts only when PayPal confirms it, and exactly once. A capture still pending is watched until it settles or lets go.
- Your rules are read fresh at every check, never remembered from last time. Each purchase's record page shows every check that ran, the decision, which version of your rules made it, the PayPal reference, and PayPal's signed proof.

## Your rules, and the promises they keep

On the Rules page you set your monthly limit, the kinds of purchases you allow, and the currency. Until you set them, nothing can be approved at all. That is deliberate: the gate fails safe. Only you can save rules, and every decision on record names the version of your rules that made it.

**AI authorization** is optional and off by default. Switched on, it gives you three things:

- **Your list.** Exact items at exact prices, each one auto-paid at most once a month. "Printer paper, restock, $22.00" pays itself; a second identical one the same month waits for you. Printer paper at $22.01 does not pay itself; it comes to you showing both numbers.
- **One auto budget for the month**, always inside your monthly limit. When it runs out, auto-paying stops and the gate says plainly that the budget is why.
- **A meter**, on the Rules page and on the gate's wall, so you are never surprised. One switch turns everything back to asking you.

The promises:

- Nothing pays itself unless it matches your list to the cent, and the same exact purchase never pays itself twice in a month.
- Every auto-paid purchase is marked: on its card, on its record, and on the wall.
- Every refusal and every ask names its reason in plain words. No codes, no shrugs.
- Money counts only when the payment is confirmed, and only once.
- The wall at the top of the gate is your monthly limit as a hard line, with what is spent, what is set aside, what is left, and what your rules auto-paid. Approvals cannot move it. Nothing can, except you changing your rules.

## The demo agent

A built-in agent proposes items from a fixed catalog of fourteen, one at a time: a coffee subscription, printer paper, software seats, all the way up to a team flight. The loop runs from your first minute, with nothing to wire up.

You can also type any purchase into the ask box in your own words. A model writes the proposal. The decision never involves a model. If your message is missing something the gate needs, the box says exactly what is missing. If the model cannot be reached, it says that too. It never stays silent.

## What you can ask for, and how to say it

The ask box understands ordinary sentences, but the gate behind it needs three facts: **who gets paid, the price, and what it is for**. Say all three and the assistant files the proposal itself, sorted into the closest of the eight kinds every gate allows:

| Kind | An ask that works |
| --- | --- |
| software | `A $10 Notion Team workspace for my notes` |
| books | `A $20 gardening book from Book Depository for my herb garden` |
| meals | `A $10 ham sandwich from Subway for team lunch` |
| office supplies | `Printer paper from Office Depot for $22, a restock for the desk` |
| hardware | `A $39 USB-C hub from Amazon for the new laptop` |
| cloud services | `A $20 Vercel Pro monthly plan to host my site` |
| advertising | `A $60 Google Ads top-up for the launch campaign` |
| travel | `A $120 Delta flight for the team offsite, one seat` |

You never name the kind yourself; the assistant picks the closest one. It is sandbox money, so any price within your monthly limit is fair game.

What comes back, in every case:

- **All three facts, kind allowed, room under your limit:** a card files and waits for your yes. Approve and pay, and seconds later the PayPal confirmation is on the record.
- **A fact missing:** the box names exactly what is missing, like "your message didn't say who gets paid," and files nothing. The assistant is forbidden from inventing a seller or a price to fill the gap.
- **Kind not allowed, or no room under your limit:** the request goes on record as blocked, naming the rule that blocked it. Every no says why, in words.
- **With AI authorization on:** an exact match on your list, same seller, purpose and price, inside the auto budget and not already auto-paid this month, pays itself. Everything else still waits for you.

## Run it yourself

You need, all free tier is fine:

- **Node.js 20** or newer
- A **Supabase** project: the database and the sign-in
- A **PayPal Developer sandbox app**: the client ID and secret
- Optionally, an API key for any OpenAI-style model service. It powers the ask box; everything else works without it

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
| `PAYPAL_WEBHOOK_ID` | From the webhook you register for signed proof of captures |
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
npm test         # 335 automated checks: the decision engine, the money math, the whole lifecycle
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
- **PayPal webhook verification**: every capture's signed notification, checked against PayPal's certificate and stored on the record
- **Postgres** with **Drizzle ORM**, hosted on Supabase
- **Supabase Auth**: email plus password, with an optional emailed link
- **Vercel AI SDK**, pointed at any OpenAI-compatible model
- **Vitest** for the automated checks
- Deployed on **Vercel**

## Licence

MIT © 2026 Ife Demi
