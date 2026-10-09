# AnchorGate — Design Charter (DRAFT)

> **Status: PROPOSAL ONLY — nothing here is built.** Per `architecture.md`
> (Phase 6), the UI is not designed or approved. This charter is the starting
> point for the owner discussion. Every section is a proposal awaiting a
> decision; the owner approves items one at a time before any code.

**Working name:** AnchorGate (owner's suggestion) — see shortlist below.
**Audience:** small business / team (owner decision).
**Guardrails:** anti-generic; designed across four disciplines (creative
direction, information architecture, visual design, engineering); the final
visual language is bespoke — no stock dashboard templates.

---

## 1. Name shortlist

| Name | What it communicates | Trade-offs | Collision check |
| --- | --- | --- | --- |
| **AnchorGate** | Rules are the anchor (fixed); every purchase passes the gate (boundary). Names the core mechanic. | Compound pattern is common; "gate" leans guardian (on-brand). | Owed — quick check before public submission |
| **Fixedpoint** | Engineering exactness (a fixed point never drifts; also the integer-minor-unit way money is handled — no floating point). | Reads technical; needs the story explained. | Owed |
| **Plumbline** | The builder's reference that keeps everything true — craft, precision, calm authority. | Poetic, less literal. | Owed |
| **The Verdict** | Every decision is a verdict; the product is a verdict engine with receipts. | Single-word ordinary noun (harder to own); slightly legal. | Owed |
| **Passgate** | Plain and literal: nothing passes without the gate. | Least personality; sounds functional. | Owed |
| **Meridian** | A fixed reference line — elegant, grown-up, precise. | Abstract; some collision risk in health/tech. | Owed |

Owner's current pick: **AnchorGate** (as working name unless the shortlist
changes the decision).

---

## 2. Thesis (draft)

> **AnchorGate is the gate every purchase passes through. The AI can knock;
> the rules are the anchor; the owner holds the keys.**

The interface exists to make three things obvious at a glance:

1. **What the agent is allowed to do** (its leash is visible, and it never
   decides).
2. **Why a specific request is ALLOW / ASK / DENY** (a rule-by-rule
   rationale — an answer, not a mood).
3. **That money only moved on a verified capture** (a provable record).

---

## 3. Audience: small business / team — implications

- The owner/admin is the primary user; the interface should read like **the
  business's own decision desk**, not a personal finance app.
- Approvals carry a name (`approvedBy` is already in the data model), so the
  UI must naturally answer *"who approved that?"* — the Activity ledger is
  filterable by approver.
- A login is in scope (owner decision) and will be planned properly
  (`AUTH.md`); the identity *model* is parked (see `OPEN-DECISIONS.md`).

---

## 4. Concept vocabulary (shared by both flavors)

- **The anchor** — rules rendered as something *fixed* (a wall / a settled
  line). The monthly cap visibly reads *"this does not move."*
- **The gate** — the pending queue is *at the gate*; every verdict is a
  **stamp** (restrained, ink-on-paper: ALLOW / ASK / DENY; DENY shows the rule
  that refused under the stamp).
- **The receipt** — every request has a time-strip: proposed → decided →
  approved → submitted → captured, with names and timestamps.
- **Signature element (proposal): the stamp.** Runs through list, detail,
  and empty states. Killed early if it reads gimmicky.

---

## 5. Information architecture — first pass

1. **Control room** (home) — who is at the gate (pending queue), the anchor
   line (budget vs. hard cap), recent verdicts.
2. **Request detail** — the stamped file: facts, rule-by-rule *why*, who
   approved, and after payment the capture receipt.
3. **Rules** — the anchor: categories, per-purchase limit, monthly cap,
   new-payee approval; the cap reads "cannot be overridden."
4. **Activity** — the ledger: every request and event, filterable by date /
   status / approver.
5. **Try the agent** (optional) — a plain-English propose box showing the
   live stamp (demo asset).

---

## 6. Concept flavors — two sketches (rough; hierarchy only)

The two flavors share the vocabulary above; they differ in **what the hero
is** — the *decision* (Gatehouse) vs. the *record* (Ledger at the Gate).

### Flavor G — "Gatehouse" (gate-forward)

Home leads with the queue *at the gate* and the budget **wall** always
visible. Approve = turn the key. Archival view is secondary.

```
┌───────────────────────────────────────────────────────────────┐
│ ANCHORGATE                                        ◦ Acme Ltd   │
├───────────────────────────────────────────────────────────────┤
│ THE ANCHOR — budget wall                                      │
│ monthly cap $100.00   ▓▓▓▓▓▓░░░░░░   spent $42.00 · 58% left │
│   "Approval cannot move this line."                           │
├───────────────────────────────────────────────────────────────┤
│ AT THE GATE  (2 awaiting)                                     │
│ ┌────────────────────────────┐   ┌─────────────────────────┐  │
│ │ ACME · $49.00 · software   │   │       ╔═════════╗       │  │
│ │ why: first-time merchant   │   │       ║   ASK   ║       │  │
│ │  [ Approve ]   [ Deny ]    │   │       ╚═════════╝       │  │
│ └────────────────────────────┘   │        (the stamp)      │  │
│                                 └─────────────────────────┘  │
├───────────────────────────────────────────────────────────────┤
│ The Record (archive)   → every judged request, filed          │
└───────────────────────────────────────────────────────────────┘
```

**Communicates:** passage and decision; authority; the gate metaphor is the
whole experience. **Strengths:** clearest demo, most ownable. **Trade-off:**
the evidence trail is secondary (still present, one click away).

### Flavor L — "Ledger at the Gate" (record-forward)

Home leads with the chronological **book**; decisions are annotations inside
each entry; the budget is a running balance line.

```
┌───────────────────────────────────────────────────────────────┐
│ ANCHORGATE · The Book                             ◦ Acme Ltd   │
├───────────────────────────────────────────────────────────────┤
│ 09:12  PROPOSED  ACME · $49.00 · software                     │
│ 09:12  ASK       first-time merchant → awaiting you            │
│           •••••  [ Review & decide ]                           │
│ 08:47  PROPOSED  WIRE · $40.00 · travel                       │
│ 08:47  APPROVED  by Ada                                       │
│ 09:01  SUBMITTED → PayPal                                     │
│ 09:03  CAPTURED  ✓ receipt #… · counted once                  │
├───────────────────────────────────────────────────────────────┤
│ month to date  $40.00   ·  cap $100.00  ·  60% left           │
└───────────────────────────────────────────────────────────────┘
```

**Communicates:** provable record; everything is recoverable and replayable.
**Strengths:** the strongest trust/audit story; still has the stamp, the
anchor, the gate as a *column*. **Trade-off:** less visceral as a first
impression for a demo.

> Optional hybrid (my eventual recommendation): **Gatehouse as the home,
> with the Ledger's receipt strip inside every request detail** — decision
> first impression, evidence one click away.

---

## 7. Benchmark mix (assembly method)

Owner's approved approach: **combine** useful bones from the category leaders
(Ramp, Brex, BILL Spend & Expense) into one layout, then add our own signature
layer. To avoid a Frankenstein, each layer has exactly **one winning source**,
and the "spine" layer governs everything.

| Layer | What it decides | Source (APPROVED) | Notes |
| --- | --- | --- | --- |
| **A. Spine / mood** | The dominant feel + structure everything else must obey | **Ramp** | Neutral ink canvas, bold type, one accent, airy density. |
| **B. Home layout** | What the screen leads with | **Ramp + BILL** | Ramp's live "agents at work" ticker + BILL's approval card. |
| **C. Data & tables** | Row/status/filter density and how records read | **BILL** | Clear labeled rows + status chips; add Ramp mono money. |
| **D. Components** | Cards, chips, buttons, nav, empty states | **BILL** (re-skinned) | Approval cards, friendly icons, clear CTAs. |
| **E. Color & type** | Palette behavior + typography mood | **Ramp/Brex boldness; our own color** | Accent: ~~Indigo~~ **retired (AI-default hue — see §7c)**; re-selected from studied refs. Never copy a brand identity. |
| **F. Signature (ours)** | The stamp, the anchor line, the receipt strip | **AnchorGate only** | Always ours; never borrowed. |

Rules: (1) one source per layer; (2) A is the spine — a borrowed element that
fights the spine loses; (3) F is always ours; (4) never copy logos, exact
screens, copy, or a brand's specific color identity.

**Reference captures:** `design-research/ramp.png`, `design-research/brex.png`,
`design-research/bill.png` (screenshots taken from each site, reviewed by a
vision-capable model).

### 7a. Design language (tokens)

**Color**
- Ink `#14161A` (primary text/brand), Ink-soft `#5B6470`, Paper `#FFFFFF`,
  Surface `#F5F6F8`, Line `#E4E7EC`.
- ~~Indigo (brand accent)~~ **RETIRED — see §7c.** Primary `#4138D6` was used in
  comps v1–v3 only; it is the documented AI-default hue (Tailwind `indigo-500`).
  New accent: pending study of references (Mercury · Stripe · FT print).
- **Verdict signals (functional; used only in stamps):** ALLOW green
  `#0E7C66` (tint `#E6F5F1`), ASK amber `#B26A00` (tint `#FDF0DC`),
  DENY red `#B3261E` (tint `#FCE8E6`).

**Type** — Display: bold grotesque, tight tracking. Body: regular. Money/data:
mono with tabular numerals. Micro-labels: uppercase, letter-spaced.

**Shape & motion** — Radius 14px cards / 999px pills; soft low shadows;
motion minimal — the stamp "lands" once.

**Signature treatment**
- **Stamp:** slightly rotated, uppercase, thin double border, verdict color,
  with the refusing rule in small mono beneath.
- **Anchor wall:** committed fill + a hard end cap; note "cannot be overridden".
- **Receipt strip:** proposed → decided → approved → submitted → captured,
  with timestamps and names.

### 7b. Critique review (external review of home comp v1)

An external review flagged "prototype tells" in the v1 comp. Accepted
refinements (to fold into v2):

1. **No internal identifiers in user copy.** Rules stated in plain language;
   the exact rule id moves into a secondary "rule applied" detail (keeps
   traceability without developer voice).
2. **One clear hierarchy:** attention → agent intent → why → action.
3. **One consistent status system:** separate *decision status* (what the
   engine concluded) from *available action* (what the human may do).
4. **One visual system:** mono reserved for money / ids / metadata, never for
   explanatory prose; every treatment has a defined purpose.
5. **Show consequences:** state that approval authorizes *this single payment
   only*; show the outcome (submitted → captured); guard double-submission.
6. **Define the numbers:** "captured this month" (counts) vs "pending" /
   "in flight" (do not count) — aligns with spend-counted-on-verified-capture.
7. **Place depth deliberately:** home vs Record vs Rules vs Request detail.

Where the review overreached: it judged a design comp against production
criteria (it acknowledges this), and it advised removing the stamp — which
would trade our signature for generic-enterprise blandness. Resolved below.

**Open:** the stamp — reform as the canonical status token vs replace with a
plain status chip vs hybrid (chip in lists, one earned stamp in request
detail).

### 7c. Direction lock — "Ledger & Print" (owner-approved)

Research against builder-endorsed guidance on AI-generated UI (Anthropic's
frontend-aesthetics cookbook/skill, the Hallmark anti-slop skill with its
58-gate slop test — 12k+ stars and available in this environment — Adam
Wathan's Tailwind `indigo-500` apology, plus Refactoring UI and Laws of UX)
produced a named-tell audit of comps v1–v3: ~10 tells, several critical.
Owner approved this direction:

**Tone (approved):** *Ledger* base — austere ink-on-paper, hairline rules,
tabular data (Mercury / Stripe DNA) — plus *print/document signature* for the
ceremonial moments: the stamp, the receipt, immutability (FT / The Economist,
Stripe Press DNA) — plus a *whisper of instrument* in the data layer (mono,
one live engine line; never terminal density).

**Consequences (locked):**
1. **Indigo is retired** as the brand accent (documented AI-default hue). The
   new accent must have a stated reason — role, not inheritance.
2. **Typefaces re-selected** from studied references, with rationale.
   No Inter / Roboto / system-default families.
3. **Eyebrows default OFF** — at most 1–2 per view, only when ordinal.
4. **No colored side stripes** — hairline rules or small accent squares.
5. **Tokens locked** — no inline hex outside the token block.
6. **Contrast floor** — small text ≥ 4.5:1; faint greys fixed.
7. **No invented metrics** — real data or clearly-labelled placeholders.
8. **No cliché placeholders** ("Acme") — domain-specific demo names.

**References to study (before any re-comp):** Mercury · Stripe · Bloomberg
Terminal (spirit, not pixels) · FT/The Economist print · Stripe Press.
Method: screenshot + DNA extraction per screen, as done for Ramp/Brex/BILL.

**Resolved this phase:**
- **References studied** — Mercury, Stripe, Stripe Press and FT were captured and
  their *computed* styles read from the live DOM (fonts, ink/paper, weight,
  tracking). Findings: `design-research/REFERENCE-STUDY.md`, captures in
  `design-research/refs/`. (Bloomberg Terminal = spirit only; The Economist
  blocked by a wall.)
- **Brand accent — Seal blue** (owner choice): a deep official ink-blue
  (`#1C3A66` ramp). Indigo and Stripe-violet explicitly rejected.
- **Type trio — owner-approved from a rendered specimen:** **Schibsted Grotesk**
  (display/UI) · **Newsreader** (serif/ceremony) · **IBM Plex Mono** (data). All
  free and open. Specimen: `design-research/type-color.specimen.html`.
- **Palette:** warm neutrals — warm near-black ink `#1C1917`, warm paper
  `#FBF9F4`, warm-dark print surface `#201819`. Cool slate grays dropped.
- Full tokens + bans + structure: `design-research/CONSTRAINTS.md`.

**Gate:** no new comps until the constraint doc (tokens + type + bans +
structure) is approved by the owner. References are studied and the accent/type
are chosen — only the document approval remains.

## 8. Open decisions this phase

- [x] Confirm the reference set (Mercury · Stripe · Bloomberg spirit · FT/Economist print · Stripe Press).
- [x] Study the references → extract DNA (screenshot + vision review, as for Ramp/Brex/BILL) — `REFERENCE-STUDY.md`.
- [ ] **Gate:** approve the constraint doc (tokens + type + bans + structure) before any comp — `CONSTRAINTS.md`.
- [x] Choose the new accent (**Seal blue**) + typefaces (**Schibsted Grotesk · Newsreader · IBM Plex Mono**) from the study — indigo retired (§7c).
- [ ] Confirm the name: pick from the shortlist (AnchorGate approved as working name).
- [ ] Flavor: leaning **Ledger-at-the-Gate** (record-forward) per the tone decision; confirm with the home comp.
- [ ] Whether the stamp stays the signature element (set: chip in lists, one earned stamp in detail).
- [ ] "Try the agent" screen in scope for the MVP?
- [ ] Identity model (parked; revisit under `AUTH.md`).
- [ ] Sponsor-tool decision (e.g. AG Grid for Activity) — later.