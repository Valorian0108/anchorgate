# AnchorGate — Design Constraints (Phase 6)

**Status:** DRAFT — awaiting owner approval. This is the gate: no comps until
this document and the specimen (`design-research/type-color.specimen.html`)
are approved.

**Direction (owner-approved):** *Ledger* base + *print/document* signature +
a *whisper of instrument* in the data layer. See `DESIGN.md` §7c and
`design-research/REFERENCE-STUDY.md`.

---

## 1. Type — three voices (never one)

**Chosen from `type-color.specimen.html` (owner-approved):**

| Voice | Job | Face |
| --- | --- | --- |
| **Display / UI grotesque** | headings, navigation, labels | **Schibsted Grotesk** |
| **Serif** | ceremony: the stamp, statements, the wordmark | **Newsreader** |
| **Mono** | data: money, timestamps, rule ids, lifecycle | **IBM Plex Mono** |

All three are free/open (Google Fonts), so no licence risk for the demo.

**Rules**
- Headings are roman. Emphasis = weight or size, never italic, never a gradient.
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
- (b) This document approved — **pending**.
- No comp is produced until (b). After approval, the first comp is **The Gate**
  (home), built strictly to these constraints — one screen, then stop for review.
