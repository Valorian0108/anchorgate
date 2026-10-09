# Reference study — "Ledger & Print" (Phase 6)

**Method:** each reference was opened in the browser, captured above the fold
(`design-research/refs/*.png`), and its **computed** styles were read from the
live DOM (font families actually in use, ink/paper colors, display sizes,
weights, tracking). Facts below are extracted, not guessed.

---

## 1. Extracted DNA

| Reference | Display / UI type | Data/mono | Serif | Ink | Paper | Accent | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Mercury** (`mercury.com`) | `arcadia` / `arcadiaDisplay` (variable grotesque, weight ~360–480) | **IBM Plex Mono** | **Tiempos Headline** | warm near-black `rgb(42,41,36)` | — (photo hero) | vivid blue | A serious bank that pairs a **grotesque + a serif + Plex Mono** — the exact three-voice structure we're after. |
| **Stripe** (`stripe.com`) | `Söhne` variable, **weight 300** at 40px, tracking −0.8px | SourceCodePro | — | deep navy `#061B31` | white | violet link `#533AFD` + brand ribbon | Large **light-weight** display type; long measure; asymmetric ribbon art bleeding off the right edge. |
| **Stripe Press** (`press.stripe.com`) | — | — | **Ivar** (Display/Headline/Text) | white | warm dark `#201819` | warm sand `#DBC895` | Pure print/book DNA: dark warm paper, one serif family, one muted accent. |
| **FT** (`ft.com`) | **Metric** (sans, UI) | — | **Financier Display** (headlines) | warm near-black `#33302E` | FT cream (`#FFF1E5`-ish) | claret + teal | Newspaper masthead logic: one dominant headline, a small kicker above, hairline rules, cream paper. |

---

## 2. What converges (the shared grammar)

1. **Three voices, never one font.** Every serious reference runs a *grotesque
   for UI + a serif for display/ceremony + a mono for data*. Mercury (Arcadia
   + Tiempos + Plex Mono) and FT (Metric + Financier) are the templates. None
   of them use Inter or Space Grotesk.
2. **Warm neutrals, never gray.** Ink is a warm near-black (`#2A2924`,
   `#33302E`, `#201819`); paper is warm off-white/cream or warm dark. Pure
   `#000`/`#fff` and cool slate grays are absent.
3. **Light-weight, large display type.** Stripe sets its headline at weight
   **300**; Mercury's variable grotesque sits at ~420–480. Emphasis comes from
   *size + weight contrast*, not from bold-everything.
4. **Asymmetry + hairlines.** Composition is biased (FT's masthead + headline;
   Stripe's ribbon bleeding right). Rules are hairline, not boxed cards.
5. **Mono for data only.** Timestamps/amounts/facts are monospaced; prose is not.
6. **One accent, tiny footprint.** FT claret, Stripe Press sand, Stripe violet —
   each under ~5% of the viewport.

---

## 3. What we take / what we reject (spine wins)

| Ref | Take | Reject |
| --- | --- | --- |
| Mercury | the 3-voice type structure; warm ink; Plex Mono for data/policy | photographic hero; its blue-violet accent |
| Stripe | light-weight large display; long measure; asymmetric art | navy/violet identity; gradient ribbon |
| Stripe Press | the *document* register — serif + warm dark, for the stamp/receipt | full dark theme |
| FT | masthead + dominant headline; cream paper; claret ink as an accent | ad density; multi-story front page |

---

## 4. Proposed AnchorGate system (v0 — for approval)

**Type trio (three voices):**
- **Display/UI grotesque** — carries navigation, headings, labels. *(candidates:
  Schibsted Grotesk · Hanken Grotesk · Instrument Sans — all free, none are
  Inter/Space Grotesk)*
- **Serif** — the *ceremonial* voice: the stamp, statement headers, the wordmark.
  *(candidates: Newsreader · Source Serif 4 — both free, both news/ledger-flavored)*
- **Mono** — money, timestamps, rule ids, lifecycle. *(candidate: IBM Plex Mono
  — proven by Mercury, free)*

**Palette (warm, tinted):**
- Ink — warm near-black `#1C1917`-family (not the current cool `#14161A`).
- Paper — warm off-white `#FBF9F4`-family; a warm dark for the print moments.
- Verdict signals stay functional (ALLOW/ASK/DENY) but re-tuned to sit on warm
  paper.

**Brand accent (owner decision — two candidates):**
- **(a) Oxblood / claret** — the "official stamp, passport, FT kicker" ink.
  Print-native, distinctive in fintech, and it *ties directly to our stamp
  signature*.
- **(b) Seal blue** — a deep, official ink-blue (a wax-seal blue), calmer and
  more institutional.
- **Rejected:** indigo `#4138D6` (AI-default) and Stripe's violet `#533AFD`.

**Structural principles:**
- Asymmetric composition; one dominant element per view.
- Hairline rules, no colored side-stripes, no card-in-card.
- Light-weight large display; weight contrast for hierarchy.
- Mono reserved for data; serif reserved for ceremony.
- Tokens locked; small-text contrast ≥ 4.5:1; honest metrics; no cliché names.

---

## 5. Files

- Screenshots: `design-research/refs/mercury.png`, `stripe.png`,
  `stripe-press.png`, `ft.png`.
- Companion: the anti-slop audit in `DESIGN.md` §7c.
- Next: the **constraint doc** (tokens + type + bans + structure) — written only
  after this study and the accent choice are approved.
