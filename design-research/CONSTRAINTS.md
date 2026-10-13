# AnchorGate — Design Constraints (Phase 6)

**Status:** APPROVED (owner, 13 oct 2026). The type faces, the Seal-blue accent,
the Live Instrument layer (§7) and the first specimen were approved 12 oct
2026; the screen comps and the unified object language (§8) were approved as
they were built and felt, one screen at a time. Where an approved comp or the
locked v3 specimen differs from an earlier line of this document, the approved
visual wins and this document records it here.

**Direction (owner-approved):** *Ledger* base + *print/document* signature +
a *whisper of instrument* in the data layer. See `DESIGN.md` §7c and
`design-research/REFERENCE-STUDY.md`.

---

## 1. Type — three voices (never one)

**Chosen from `type-color.specimen.html` (owner-approved):**

| Voice | Job | Face |
| --- | --- | --- |
| **Display / UI grotesque** | headings, navigation, labels | **Schibsted Grotesk** |
| **Serif** | ceremony: the stamp, statements, the Print page titles | **Newsreader** |
| **Mono** | data: money, timestamps, rule ids, lifecycle | **IBM Plex Mono** |

All three are free/open (Google Fonts), so no licence risk for the demo.

**Rules**
- Interface headings are roman. Emphasis = weight or size, never a gradient.
  One ceremonial exception, approved via the comps: the page title on each
  Print screen (Record, case file, Rules, sign-in) sets in Newsreader italic.
  The wordmark is the grotesk lockup (uppercase, seal blue, 20px, anchor mark)
  per the locked v3 specimen, not serif.
- Weight contrast over bold-everything; large display can run light (à la Stripe).
- Prose measure 45–75ch. Tabular numerals on every column of figures.
- Banned: Inter, Roboto, Open Sans, system-default stacks, Space Grotesk.

---

## 2. Colour — warm neutrals + Seal blue

**Neutrals (warm, never cool gray):**
| Token | Value | Use |
| --- | --- | --- |
| ink | `#1C1917` | primary text |
| ink-soft | `#57534E` | secondary text |
| paper | `#FBF9F4` | base surface |
| surface | `#F3EFE7` | recessed surface |
| line | `#E4DED3` | hairline rules |
| warm-dark | `#201819` | print/document moments |

**Accent — Seal blue (owner choice):**
| Token | Value | Use |
| --- | --- | --- |
| seal-deep | `#122947` | pressed / deep |
| seal | `#1C3A66` | primary accent, links, primary action |
| seal-bright | `#2A5AA0` | hover / focus |
| seal-tint | `#E8EDF5` | quiet fill |

**Verdict signals (functional; only inside the stamp / mark):**
`ALLOW #2F6B4F` · `ASK #A66312` · `DENY #9E2B25`

**Rules**
- Accent footprint < ~5% of any view. Accent is emphasis, not fill.
- No indigo (`#4138D6`), no Stripe violet (`#533AFD`), no purple gradients.
- No pure `#000` / `#fff`. Neutrals are warm-tinted.
- Small text ≥ 4.5:1; verify every (color, background) pair.

---

## 3. Bans — "we never do this"

1. No gradients (background, text, or buttons).
2. No eyebrows on every section — default OFF; at most 1–2, only when ordinal.
3. No coloured side-stripe rows — hairline rules or a small accent mark.
4. No card-in-card; no card soup. Prefer a ledger of hairline-separated rows.
5. No invented metrics; real data or a clearly-labelled placeholder.
6. No cliché placeholder names ("Acme", "Nexus"). Use plausible, domain names.
7. Tokens are locked — no inline hex outside the token block.
8. No dark "AI-tool" aesthetic by default.
9. No icons from third-party icon packages (Google Material icons/symbols,
   Font Awesome, Lucide, etc.) and no icon-font files. The only icons are our
   own inline-SVG stroke set (§5) — our *one, aligned source*.
10. No emojis anywhere in the UI — not for status, not in toasts, not in copy.
    Emojis are an LLM tell; status is carried by type, colour and the stamp.
11. Celebration toasts only for real, invisible successes.

**New-generation "alive dashboard" tells (added 12 oct 2026).** Chasing
*liveness* must not trade the old slop for the new slop. These are banned with
the same force as the list above:

12. No animated gradient or aurora backgrounds.
13. No glassmorphism or frosted translucent cards.
14. No glow, bloom, or neon accents.
15. No bouncy spring physics on everything.
16. No particle or confetti celebration.
17. No floating 3D orbs or blobs.
18. No gradient borders on cards.
19. No animated counter that spins when nothing actually changed. A number
    counts only when a real value changes.

---

## 4. Structure (app-level)

**IA**
- **The Gate** — home; the queue of decisions that need a human, plus the
  budget state.
- **Request detail** — the case file: rule-by-rule rationale, the fingerprint,
  the receipt strip.
- **Record** — the register of every decision (audit).
- **Rules** — the statute: the active rule set.

**Principles**
- One dominant element per view; bias the composition (no centred-everything).
- Hairline rules do the work, not boxes. Let whitespace group.
- The "list + right-hand KPI rail" dashboard skeleton is the current default —
  challenge it explicitly when we comp the home screen.
- Mono = data only. Serif = ceremony only. Grotesque = interface.

---

## 5. Signature (always ours)

- **Stamp** — the single verdict mark (serif + verdict colour), earned once in
  the request detail; a quiet chip in lists.
- **Receipt strip** — the lifecycle record (proposed → decided → submitted →
  captured), mono, with timestamps.
- **Anchor mark** — the line-drawn anchor in the wordmark.
- **Engine line** — a single live status line; the instrument whisper.

**Iconography — one aligned source, ours.** A defined set of hand-drawn inline
SVG marks: the anchor, the stamp, status glyphs, and two or three navigational
arrows. Every mark is 16 px on the grid, one stroke weight (1.5 px), one
geometry matched to Schibsted Grotesk — no fills, no gradients, no embedded
fonts. If a moment can be carried by type alone, there is no icon. This set is
the *only* icon source in the build; nothing from external icon packages
(Material, Font Awesome, Lucide, …) enters the app.

---

## 6. Approval gate

- (a) Type faces chosen from the specimen — **done** (Schibsted Grotesk ·
  Newsreader · IBM Plex Mono). Accent chosen — **done** (Seal blue).
- (b) This document approved — **done** (13 oct 2026), carrying the §1
  amendments and the unified object language in §8 below.
- No comp is produced until (b). After approval, the first comp is **The Gate**
  (home), built strictly to these constraints — one screen, then stop for review.
- (c) **Owner approved the Live Instrument layer and the first specimen
  (12 oct 2026).** A standalone living specimen
  (`design-research/live-instrument.specimen.html`) was built to §7 and audited
  against §3 so the owner could *feel* the direction before any app screen is
  rebuilt. App comps still follow one-screen-at-a-time review.

---

## 7. The Live Instrument layer (positive spec, owner-approved 12 oct 2026)

The anti-slop bans (§3) are the floor. This is the positive half: how the app
feels alive without tripping the new tells. It is written as specifically as the
bans so there is no gap for defaults to fill.

**The split — printed where permanent, alive where responsive.**
- The **Record** and the **case file** are *Print*: receipt strip, stamp,
  immutability, hairline rules. Settled and permanent. The paper metaphor is
  exactly right here.
- The **Gate** (home), the **budget**, and the **decisions** are a *Live
  Instrument*: a control surface that responds to reality. It breathes.

**Motion is information, never decoration.** A movement that communicates
nothing is banned.

| Primitive | Duration | What it communicates |
| --- | --- | --- |
| micro (hover, press, focus) | 120 ms | the surface is responsive |
| state change (decide, row → paid) | 220 ms | the state changed |
| value change (gauge fill, number count) | 420 ms | the number changed |

- Easing: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` for entrances;
  `--ease-inout: cubic-bezier(0.65, 0, 0.35, 1)` for value changes.
- Animate **transform** and **opacity** only (plus SVG `stroke-dashoffset` for
  the budget gauge, which *is* the value).
- `prefers-reduced-motion: reduce` → no pulse, no count-up, no slide; snap to the
  final state. The value still changes; it simply does not animate.
- No `transition-all`. Name every property that moves.

**The budget is a live instrument.**
- A gauge that fills as spending accrues, in the accent. It shifts to the caution
  colour as it nears the cap, and to the refusal colour near or over the cap.
  Colour is a live signal, not decoration.
- The spent figure is a hero (mono, tabular, large) and counts only when the
  value changes.
- "Approval cannot move this line" stays.

**Attention is designed.**
- The item that needs a human is foregrounded, with a slow, low-amplitude opacity
  pulse on one small status mark while it waits. The pulse means "this is waiting
  on you." It stops the instant it is decided.
- The rest of the page steps back.

**Consequence is visible.**
- Approving produces visible consequence: a short, honest "authorizing" beat, then
  the row transitions to paid, the stamp settles, the gauge ticks, the figure
  counts. Declining produces the refusal mark and **no** gauge movement, because
  money did not move.
- The queue is live: when one is decided, the next can arrive with an entrance.

**Every component has states.**
- Empty, loading, partial, needs-you, done, error. The calm finished state is one
  of six, not the only one. The needs-you state is the priority.

**The tell audit still runs.**
- Every living comp is checked against §3 bans 1–19. Any trip is rejected.

---

## 8. One object language across every screen (approved 13 oct 2026)

The Live Instrument layer (§7) rebuilt the Gate; this folds the same face onto
the Print screens and the entry screens so the whole app reads as one product.
It changes shapes and fills only. It adds no motion and no numbers to the
Print screens, which stay printed and still.

- **Boxed objects** — decision cards, ask box, rules editor, decision slip,
  decided box, receipt strip, integrity and decision-order strips, empty
  state, away banner, sign-in notice: paper fill, hairline `line` border,
  **6px radius**. The decision object (the slip, and the needs-you card)
  carries the heavier `ink` border.
- **Buttons** — one family everywhere: primary is seal fill with paper text at
  6px radius; secondary is hairline or ghost at 6px radius.
- **Instrument bars** (the wall) keep 2px radius. **Status marks** keep their
  approved radii: the list chip 2px, the Print seal 3px, and the Gate's inline
  stamp square, exactly as the locked v3 specimen sets it. **Badges** (the away
  count) keep 999px.
- **Form fields** stay underline-on-paper with no box, shared by sign-in, the
  ask box and the rules editor.
- Print screens keep every hairline ledger row, ruled statement and dark
  receipt strip exactly as comped; they simply wear the shared radii and
  fills, so nothing looks bolted on.
