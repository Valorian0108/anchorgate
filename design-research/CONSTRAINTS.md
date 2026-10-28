# AnchorGate — Design Constraints (Phase 6)

**Status:** APPROVED (owner, 13 oct 2026). The type faces, the Seal-blue accent,
the Live Instrument layer (§7) and the first specimen were approved 12 oct
2026; the screen comps and the unified object language (§8) were approved as
they were built and felt, one screen at a time. Where an approved comp or the
locked v3 specimen differs from an earlier line of this document, the approved
visual wins and this document records it here.

**Icy-glass direction (owner taste calls locked 13 oct 2026):** the live
surfaces move to a crafted icy-glass system (§9): Sora as the display/UI voice,
the two-tone accent device on, frost used at most twice per view, and nav as a
seamless top bar that sits still at the top of the page (owner call 13 oct
2026: nothing follows him down the page). The ground is LIGHT ice over a washed
harbour line drawing; the v4 dark-navy draft was withdrawn the same day
because its frost read as a flat dark dashboard. Specimen v7
(`live-instrument.specimen.v7.html`) is the approved Gate cockpit (§10); the
rebuild follows it exactly, one screen at a time.

**Everything joins the ice (owner call, 13 oct 2026, second call):** every
screen now wears the ice, not just the Gate. The non-Gate screens (Record,
case files, Rules, sign-in, sign-up, the front door) are "icy paper":
everything the Gate is made of. Same ground, same seamless top bar, same type
voices and capsule controls. The warm paper skin and the serif voice are
retired everywhere.

**Enforce the glass more (owner call, 13 oct 2026, third call):** the glass is
tiered and present everywhere. True frost on the Gate deepened: top bar
blur 24px, instrument band blur 32px, whiter fills, richer saturation. Off
the Gate the icy-paper panes are a light veil (white at 60%, blur 12px,
saturate 140%): quiet glass, never true frost, so the Gate stays the hero
surface. Solid chrome (capsule buttons, top-bar pills, the deep-ice receipt
strip) stays solid, because glass reads as glass only against something firm.

**Direction (owner-approved):** *Ledger* base + *print/document* signature +
a *whisper of instrument* in the data layer. See `DESIGN.md` §7c and
`design-research/REFERENCE-STUDY.md`.

---

## 1. Type — three voices (never one)

**Chosen from `type-color.specimen.html` (owner-approved):**

| Voice | Job | Face |
| --- | --- | --- |
| **Display / UI** | headings, navigation, labels, buttons, ceremony | **Sora** (owner pick 13 oct 2026: the softer of the two candidates) |
| **Serif** | *retired* (owner call 13 oct 2026: everything joins the ice; the ceremony job passes to Sora) | ~~Newsreader~~ |
| **Mono** | data: money, timestamps, rule ids, lifecycle | **IBM Plex Mono** |

All faces are free/open (Google Fonts), so no licence risk for the demo.
Sora replaced Schibsted Grotesk as the interface voice when the live surfaces
moved to the icy-glass system (§9). Newsreader is no longer loaded: the serif
retired with the warm paper skin when every screen joined the ice (owner call
13 oct 2026). Ceremony (statements, the stamp, the sign-in title) now sets in
Sora, with the two-tone accent hook as the ceremonial device.

**Rules**
- Interface headings are roman. Emphasis = weight or size, never a gradient.
  Ceremony is carried by scale, weight and the one accent hook word per
  headline (used sparingly: the front door, sign-in, sign-up, the case-file
  amount).
  The wordmark is the display lockup (uppercase, 13px, anchor mark tile),
  ink on the seamless top bar.
- Weight contrast over bold-everything. Display headings set heavy (700) and
  tight (image-settled 14 oct 2026, §6(i)): confident, never light-on-ice.
- Two label voices (image-settled 14 oct 2026, §6(i)): the instrument voice
  (mono, uppercase) is reserved for true metadata (status strip, receipt
  strip, stamp, register column heads, document refs, chips, the wordmark);
  content-facing labels (section captions, form fields, the ask label) set
  in the content voice `.sec` (Sora, sentence case, 13px, ink-soft).
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
`ALLOW #2F6B4F` · `ASK #97590F` · `DENY #9E2B25`
(ASK darkened one notch by the polish audit, 13 oct 2026: the old `#A66312`
measured 3.9:1 at its smallest sizes; §6(h). Meaning frozen, value swapped.)

**Icy palette — the live surfaces only (§9, owner 13 oct 2026; light ice after
the v4 dark-ground draft was withdrawn):**
| Token | Value | Use |
| --- | --- | --- |
| ground | `#F4F9FC` to `#DAEAF4` | pale ice field, top to bottom |
| ink | `#12293A` | primary text on light |
| ink-soft | `#4A6072` | secondary text on light (audit value, §6(h)) |
| ink-faint | `#546A7C` | quiet metadata: caps, timestamps, proofs (audit value, §6(h)) |
| accent | `#2D9CDB` | fills, bars, dots and rules only; never text, never under white text |
| accent-text | `#2289C9` | large display text only: the hook words, the 32px readout (clears the 3:1 large floor, §6(h)) |
| accent-ink | `#0F6E8C` | small accent text, links, and the primary button fill with white text (5.8:1) |
| frost | white at 55-58% plus blur 24-32px | the navigation console and the instrument band |
| veil | white at 60% plus blur 12px | every icy-paper pane (§6(g)) |

The warm palette above is retired (owner call 13 oct 2026: everything joins
the ice). The icy palette below is the product's only palette; the warm table
stays as a historical record. The CSS token names `--paper`, `--surface` and
`--seal*` are historical too: they now carry ice values. The receipt strip's
deep ground moved from warm dark to deep ice (`#0F2B3D`).

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
8. No dark "AI-tool" aesthetic by default. The single exception is the
   owner-approved icy instrument ground on the live surfaces (§9); the Print
   screens and the default impression stay light paper.
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
13. No default glassmorphism. Crafted glass is allowed only under the five
    conditions of §9 (owned palette, still composed backdrop, tiered panes,
    solid chrome, contrast-verified). Frosted cards pasted on a flat or
    moving backdrop remain banned.
14. No glow, bloom, or neon accents.
15. No bouncy spring physics on everything.
16. No particle or confetti celebration.
17. No floating 3D orbs or blobs. The exception is the static composed
    backdrop of §9: two soft glows and a grain, fixed, never animated.
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
- The "list + right-hand KPI rail" dashboard skeleton was challenged and
  rejected for the Gate (13 oct 2026): the approved home is the cockpit of
  §10, a status strip over an instrument band over an open four-column queue.
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
- (d) **Owner locked the icy-glass taste calls (13 oct 2026):** Sora as the
  display voice, the serif off the Gate, rounder panes, and the two-tone
  accent device on. Specimen v4 (dark navy) was felt and withdrawn: the
  owner's reference showed ice is light. Specimen v5
  (`design-research/live-instrument.specimen.v5.html`) carries the light-ice
  recipe for him to feel. No app code changes until he approves v5; then the
  Gate is rebuilt first, one screen at a time.
- (e) **Owner approved the Gate cockpit (13 oct 2026).** Specimen v6 fixed the
  composition; v7 killed the poster for a cockpit and, after two fix rounds
  (equal column bottoms, deep-accent button contrast, the seamless static top
  bar), the owner approved it in full and ordered the whole UI rebuilt to it,
  homepage and sign-in included. The rebuild follows
  `design-research/live-instrument.specimen.v7.html` (§10), one screen at a
  time, keeping every live behavior inside the new skin.
- (f) **Owner ordered every screen into the ice (13 oct 2026, second call).**
  His words: the non-Gate screens are "everything the gate is made up of,
  glassmorphism but without the glass and a icy paper feel." Built and
  verified the same day: the warm paper skin and Newsreader are retired; the
  Record, case files, Rules, sign-in and sign-up wear matte ice panels (white
  at 72%, no backdrop-filter), Sora headings, capsule buttons and the shared
  seamless top bar; frost survives on the Gate only (top bar + instrument
  band). He also chose **Option A** for the front door: one address, two
  doors — signed-out visitors see the intro page AT "/" (the proxy rewrites to
  the static `/home` route), signed-in owners see the Gate at the same "/".
  The sign-in title's open question resolves with the serif retirement: it
  sets in Sora with the accent hook on "You.".
- (g) **Owner: "the glassmorphism in the ui can you enforce it more" (13 oct
  2026, third call).** The glass tiers deepened: the Gate's top bar to
  blur 24px and the instrument band to blur 32px on whiter, richer fills;
  the icy-paper panes (integrity strip, preamble, decision order, rules
  editor, decision slip, closed box, sign-in notice, away banner, the front
  door's labelled example band) moved from matte to the light veil tier
  (white at 60%, blur 12px, saturate 140%) with the inset top highlight.
  Hierarchy holds: true frost stays a Gate-only object; panes are veils;
  buttons, pills and the receipt strip stay solid.
- (h) **Polish audit (13 oct 2026, agent-run at the owner's "run an audit for
  a polish").** Every (color, background) pair was measured against the real
  composited grounds: the gradient's mid and bottom stops, the harbour-art
  overlap, the veil pane, the frost band and the receipt strip. Four tokens
  failed §2's contrast rule and were darkened one notch, hues unchanged,
  meanings frozen: ink-soft `#5B7186` → `#4A6072` (worst case was 4.1:1, now
  5.3:1); ink-faint `#7E93A6` → `#546A7C` (was 2.6:1, now 4.6:1); ask
  `#A66312` → `#97590F` (was 3.9:1, now 4.6:1); and the bright accent stopped
  being text at all. A new `--accent-text #2289C9` carries the hook words and
  the 32px spent figure (`#2D9CDB` measured 2.5:1 as text, under even the 3:1
  large floor; the fix clears 3.1:1 everywhere). The gauge's threshold tick
  follows the new ask value. Everything else passed as-is: ink, allow, deny,
  accent-ink, white-on-button (5.8:1) and the three receipt inks (6.4-13.1:1).
  Small text over a decorative art stroke sits at ≥4.2:1, a texture exception:
  the strokes are blurred at 16% opacity and never carry meaning alone.
- (i) **Image-settled direction (14 oct 2026, owner: the reference images plus
  the Architectural Glass brief overwrite earlier calls where they follow the
  glass brief).** Two reference images (light and dark glass studies) were
  read as the material vocabulary beside the written brief. Settled: (1) the
  backdrop's harbour vignette becomes a washed architectural silhouette,
  crisp at 7% opacity, strongest only where frost blurs it; (2) glass retiers
  to frost (two objects per view, the front door's example band included) /
  veil (documents and callouts only) / paper (dense panes, no blur) / open
  ground (the integrity row loses its box); (3) two label voices, instrument
  uppercase reserved for metadata, content labels sentence case in Sora;
  (4) display headings set at weight 700; (5) the ask column moves to the end
  of the queue row. Considered and refused because the brief or an owner call
  blocks them: dark mode (the brief is light-mode glass; the dark study only
  shows the material over a dark ground), a floating bottom dock (the brief
  preserves the Gate/Rules/Record navigation; the owner retired the dock on
  13 oct: nothing follows him), and a radial arc gauge (the brief's three
  communications for the spending overview need the set-aside segment, the
  caution threshold and the cap notch, which an arc cannot carry; the wall
  stays). The texture exception now measures over silhouette masses at 7%
  opacity, re-verified by sweep the same day. A same-day refinement pass on
  the owner's "name three weakest visual decisions" followed: the empty
  state lost its dashed placeholder box and wears the column's left rule on
  open ground; live-surface prose (the ask hints, the sign-in trust lines
  and slip note) moved from the mono data voice to the interface voice per
  §4; and the strip's trust line wraps as a deliberate full-width quiet
  line at 1100px and under instead of orphaning right-aligned.
- (j) **Navigation art direction (15 oct 2026, owner brief "Navigation Art
   Direction Refinement").** The full-bleed seamless plank is replaced by the
   navigation console: one floating frost object (radius 18px, the band's
   material recipe) on the 1200px envelope, the ice visible all around it; it
   still sits still and scrolls away. Drafting-tick dividers articulate the
   three zones inside it (identity, nav keys, account). Nav links became
   instrument keys: no fill at rest, a shallow white-glass key on hover, and
   the active key a crisp white tile with accent-ink text at weight 600 plus
   a 2px accent rule under the label (the column-rule motif). The saturated
   accent lozenge is retired: solid accent now appears only on money movement
   and the sign-in CTA. In the account zone Sign out demoted to a 30px
   hairline utility capsule, the away badge resized to match, and the owner
   email hides below 1100px rather than truncating mid-address. The
   considered alternative, a "Ruled Rail" (keep the full-bleed bar, mark
   position with the rule alone), was declined: it leaves the silhouette and
   material untouched, which the brief explicitly asks about; the console
   follows the glass-inspiration images' composition (one floating object,
   logo tile, controls) without copying their placement, as the brief
   directs. Mobile keeps the console one object with the deliberate two-row
   interior (identity and account, then three even keys). Frost object counts
   are unchanged.

- (k) **Trust mode: AI authorization (16 oct 2026, owner decision, plan-first
   at `design-research/TRUST-MODE-PLAN.md`).** The owner chose an exact-price
   trust list over the retired auto line: a toggle on the Rules page (**off by
   default**, and off for the judge account), a list built only from the 14
   catalog items where each entry is (seller, purpose, exact price), and one
   monthly auto budget that must sit at or under the monthly cap. The list is
   the ONLY automatic path, and it lives at step 6 of the engine's documented
   order — shape, amount, currency, category and the hard cap all run first
   and can never be loosened by the list; a malformed list denies everything
   (INVALID_RULES). Matching is exact on all three fields (the same seller and
   purpose may be listed at more than one exact price); a price mismatch asks
   with both numbers, never auto-pays and never auto-declines. New engine
   vocabulary: ON_TRUST_LIST (ALLOW), NOT_ON_TRUST_LIST, AMOUNT_OFF_TRUST_LIST
   and AUTO_BUDGET_USED (ASK). The old per-purchase line and new-payee flag
   are retired to dormant: stored, parsed, ignored by the engine, with their
   historical codes (PER_PURCHASE_LIMIT_EXCEEDED, WITHIN_LIMITS) still
   readable in old case files. An AUTO_APPROVED ledger event (id
   `auto-approved:<recordId>`, written before the payment) marks every
   auto-cleared purchase immutably; it is informational and counts as no
   spending — the auto budget counts only this month's CAPTURE_VERIFIED
   events on marked requests, so pending or failed captures never eat it.
   Copy promises: AUTHORIZED everywhere reads "Your rules cleared this. It
   has not been paid." (the old "older rules" claim became false and is
   retired); a paid card always says WHO decided ("you approved · paid once"
   versus "your rules cleared it · paid once", never the same); the ask box
   gained the honest outcomes paid (only with a real capture, reference shown
   when there is one) and stalled ("the payment did not go through. No money
   moved."), and a trust-reason ask names its reason in the sentence. The
   Rules form can only pick catalog identities — seller and purpose come from
   CATALOG, never from form text — switching the toggle off keeps the list and
   budget stored, and every save bumps the rule version. Migration 0006 is
   additive-only (three columns, safe defaults false/[]/0) and is applied to
   the live database BEFORE the code that reads it is pushed.
- (l) **The auto-budget meter (17 oct 2026, owner ask).** The auto budget is
   visible wherever money is watched: the Rules page shows a thin meter under
   the budget field ("Used this month: 30.00 of your 40.00 … resets on the
   1st") whenever there is something to say (a budget set or a payment made,
   toggle on or off, because the figure is history either way), and the Gate's
   wall legend grows a fourth line, "auto-paid X of Y", rendered only while AI
   authorization is on with a budget set or money spent, so the shipped
   default gate is untouched. Tone stays plain at every fill level (the number
   speaks, no colour change); both figures come from `budget()`'s
   `autoSpentThisMonthMinor`, the same single computation the engine enforces
   (`readSpendingState`), and the wall line moves client-side the moment a
   verified capture with no approval on file arrives, exactly like the spent
   figure does.
- (m) **The cap preview (17 oct 2026, owner ask).** The monthly cap's boundary
   is no longer something you only ever meet as a refusal. A waiting card whose
   amount would take confirmed spend past the cap carries one plain line under
   the price, "paying this would go over your monthly limit", set in the
   refusal colour. Hovering or focusing that card drops a 2px ghost marker on
   the wall at the exact point the money would land, clamped to the cap and
   offset 1px so the bar's `overflow: hidden` can never clip it, and both the
   marker and the whole wall turn refusal-red when it lands past the cap.
   Approve stays clickable on a breaching card: the preview is a forecast, not
   a permission, and the engine still refuses at pay time. That refusal is the
   proof that the preview is not the gate. The arithmetic lives in one pure
   helper (`lib/capPreview.ts`, `previewAgainstCap`) mirroring engine step 5
   exactly (`amount > cap - spentThisMonth`, strict, MONTHLY_CAP_EXCEEDED), and
   it deliberately excludes money set aside for other waiting cards because the
   engine excludes it: a preview that warned about purchases the engine would
   then allow is worse than no preview at all. No cap, or a cap of zero,
   returns null and the wall and the card render exactly as shipped. Motion is
   the 220ms tier, transform and opacity only, and the marker paints above the
   fill and the set-aside band so it stays legible on a coloured bar.
- (n) **The case file shows its receipts (17 oct 2026, owner ask).** Two
   additions to a record page, both strictly factual, neither inventing
   anything. (1) "The agent's raw request": a collapsed `details` block
   printing the stored proposal exactly as it arrived (`record.request`: id,
   agentId, payee, purpose, category, amountMinor, currency) under the line
   "Nothing in this request changed after it arrived", which is true because
   the request is immutable and fingerprinted. No reasoning panel is invented:
   the assistant stores no rationale, so none is shown. (2) "PayPal signed
   proof": PayPal posts capture-completed notifications to
   `/api/paypal/webhook`, a path added to the proxy's public prefixes because
   PayPal's servers hold no session, so the signature verified through PayPal's
   own verify-webhook-signature API is the only authentication. When a verified
   notification for that capture is on file, the record says PayPal signed the
   payment event and that the signature checked out against PayPal's public
   certificate, with the signed event collapsible underneath plus its
   transmission id and receipt time; everything PayPal signed is stored under
   PayPal's own field names so a judge can copy it straight back into PayPal's
   API and re-verify it without trusting us. The panel renders nothing at all
   when no proof is on file (a payment captured before the webhook existed
   simply has none, and the page never pretends otherwise), and says plainly
   that the status is unconfirmed when a notification arrived but its signature
   did not verify. The endpoint always answers 200: an unverifiable
   notification is stored unverified rather than dropped by a 5xx that makes
   PayPal retry forever. Migration 0007 (one additive table,
   `paypal_webhook_events`, deduped on transmission id) was applied to the live
   database before the code that reads it. **Operational lesson, recorded
   because it silently cost an hour:** this project's migrator is driven by
   `drizzle/meta/_journal.json`, not by the presence of `.sql` files. A
   hand-written migration must be registered there with a matching snapshot, or
   both `db:migrate` and the PGlite test migrator report success while applying
   nothing. Verify a migration by querying the database, never by reading the
   migrator's output.
- (o) **The owner's address is masked (17 oct 2026, owner ask).** The
   navigation console's owner line prints `maskEmail(email)`: the first
   character of the local part, a fixed five bullets, then the full domain
   (`i•••••@gmail.com`), with the complete address kept in the `title`
   attribute. A fixed bullet count means the length of the hidden part is never
   leaked, and strings without an `@` are returned unchanged rather than run
   through an invented masking rule. This is a privacy convenience for
   screenshots, demos and screen shares, not access control, and the canon
   records it as such.
- (p) **The wall's colour counts confirmed payments only (17 oct 2026, owner
   decision).** The bar's two channels now answer two different questions
   instead of one overloading the other. Its LENGTH is commitment: solid fill
   for money that left, pale band for money set aside for cards still waiting.
   Its COLOUR is position against the hard limit, driven by `spentFrac` alone
   (accent, caution from 0.75, refusal from 0.9), which is the same number the
   engine enforces, the readout prints as a percentage, and the Rules page
   promises when it says the limit counts confirmed payments only. Before this,
   the colour came from spent plus set-aside, so a gate with four waiting cards
   showed a refusal-red bar while the gate would still happily pay any of them;
   the red contradicted the readout's own percentage beside it, and §6(m)'s
   refusal-red preview had nothing to stand out against because the bar was
   already red. Commitment is not lost by the calmer colour: it keeps the pale
   band, the legend's "set aside" and "left" figures, and the words that explain
   them, and a breach forecast still turns the whole bar red. A side effect
   worth keeping: amber now begins exactly where the bar's 75% caution notch is
   drawn, so the notch and the colour can no longer disagree.
 - (q) **Verify against the published schema, not memory; rescue by re-asking,
    never by re-stamping (17 oct 2026, owner-approved fix and rescue).** The
    first day the signed webhook proof was live, all three genuine notifications
    were stored unverified. The fault was in our own request, not in anyone's
    configuration: PayPal's verify-webhook-signature API accepts exactly seven
    fields and requires `webhook_event`, the full event object, while the route
    sent an invented `webhook_event_id`, an extra `transmission_body`, and
    omitted the required field, so PayPal answered INVALID_REQUEST without ever
    looking at the signature. Two lessons, recorded so they outlive the bug.
    First: build a request to someone else's API from their published schema
    (PayPal's OpenAPI spec `notifications_webhooks_v1.json` settled it in one
    fetch), never from memory of its shape. Second: reproduce the failure
    against the real API from stored data before shipping a fix; re-running the
    verify call locally from the stored transmission is what separated "PayPal
    rejects our request" from "the signature is bad", and proved the signatures
    genuine all along. The corrected route shipped the same day and production
    verified the next two notifications by itself. This also refines a detail of
    (n): the stored transmission is not something a judge can "copy straight
    back" into PayPal's API as one object; the stored raw body is supplied as
    `webhook_event` beside the six header-derived fields and the registered
    webhook id. The three unverified rows were rescued by a one-off script,
    owner-approved, that re-asked PayPal about each stored event and updated
    `verified` and `verification` only where PayPal answered SUCCESS. Nothing
    PayPal signed was touched and no stamp was set by hand: the panel's
    confirmed claim rests on a fresh answer from PayPal either way. The rescue
    was possible at all because (n) stores everything PayPal signed even when
    verification fails, which is that design decision paying for itself.
- (r) **Each exact purchase auto-pays at most once a month (18 oct 2026, owner
   decision after live adversarial play).** Trust mode shipped with a
   trickle-drain hole, found by the owner probing the live site hours after
   the judge account was staged. Two facts made it real. First, the agent's
   prompt carries the
   trust list verbatim (by (k)'s own design, so a filed ask carries the exact
   strings the engine matches on), which means a proposing agent always knows
   precisely which purchases auto-clear: in live play the model proposed a
   listed item at the exact price the owner had written into the rules minutes
   earlier, and it auto-paid. Second, nothing limited repeats: the feed
   delivered two byte-identical proposals in the same second (both recorded,
   refused only because the cap happened to be full), and the same listed item
   asked again and again would auto-pay each time until the monthly auto
   budget ran dry. The hard cap was never at risk and the auto budget bounded
   the damage, but the budget was drainable without a human ever deciding. The
   fix is one new step in the engine's trust path, 6d after the budget check:
   a purchase whose material details (payee, purpose, category, amount,
   currency, exactly the facts the fingerprint hashes) match a purchase the
   rules already auto-paid this UTC month asks the owner instead
   (ASK ALREADY_AUTO_PAID); the owner may still approve the repeat by hand,
   because an ask is not a block. "Already auto-paid" carries the same honesty
   as the budget figure: an AUTO_APPROVED-marked request with a
   CAPTURE_VERIFIED event inside the period, so an auto-pay whose capture
   never verified does not use up the item's month and a retry can still
   auto-pay. The list rides in the spending state (`autoPaidThisMonth`,
   computed in the one place, `readSpendingState`), a missing list parses as
   empty so states from before the rule still work, and a malformed list
   fails the whole parse and denies everything. Budget-used stays the reason
   when both apply, pinning the check order. The model's prompt and the Rules
   page say the rule in plain words ("each at most once a month"), the record
   reads "already auto-paid this month", and the case file maps the code to
   the step-6 ask row. Deliberately NOT changed: intake deduplication (two
   identical proposals still file two cards, each judged honestly) and the
   prompt's disclosure of the list; with this rule in place an agent that
   reads the rules can auto-buy each listed item once a month inside the
   budget, which is precisely what trust mode promises, and nothing more.
- (s) **The ask box never stays silent, and it names what is missing (19 oct
   2026, owner decision after a live "$10 ham Sandwich" produced nothing).**
   The owner typed "$10 ham Sandwich" into the live gate and got no response:
   no card, no sentence. Diagnosis found the ask was never filed at all. The
   model call had hung, nothing in the code put any clock on it, the platform
   eventually killed the whole function, and a killed function cannot
   redirect, so none of the box's honest sentences (including the already
   existing "could not reach the model" one) could fire. A live replay on the
   test account reproduced it: two minutes of stale page, then a browser
   network error, nothing filed. That broke the box's founding promise, never
   lie and never stay silent, and it was the only uncovered outcome: every
   other path already ended in a sentence. The fix has two parts. (1) THE
   CLOCK: every ask run now carries a hard 45-second abort
   (`AGENT_RUN_TIMEOUT_MS`, an `AbortSignal.timeout` on the model call,
   injectable for tests). A hung model now rejects into the action's existing
   catch, which redirects to the already-tested "The assistant could not
   reach the model right now" sentence. The gate page pins `maxDuration = 60`
   (per the bundled Next.js docs, Server Actions take their ceiling from the
   page), so the code's clock always fires before the platform's kill. (2)
   THE NAMED ASK: the agent gains a second tool, `ask_for_details`, whose
   only payload is a fixed enum of the genuinely missing facts (payee,
   amount, purpose). The outcome carries them as short URL codes
   (`?ask=clarify&missing=payee,amount`), so the no-free-text rule stands:
   the model picks codes, the gate writes the sentence ("Nothing was added
   below. Your message didn't say who gets paid. Add that and ask again.").
   Unknown codes drop out; with nothing known left, the pre-existing generic
   clarify sentence stands, so the fallback is never silent either. The
   instructions now forbid inventing a seller, a price, or a purpose, which
   is the root of the placeholder filings ("Unknown (please specify)") the
   owner had to decline by hand on 18 oct. A filed fact always beats a
   question: a run that both filed and asked reports the filing.
   `outcomeFromRun` moved out of the `"use server"` file (where it could be
   neither exported nor tested) into `lib/askOutcome.ts`, pinned by unit
   tests for every branch; the tool-set test now pins exactly two tools and
   still no payment tool; and the clock is proven by a hanging fake model
   (specificationVersion v4) that dies only when the abort fires.
- (t) **The answer also lands at once: the feed heartbeat stays quiet while an
   ask is in flight (19 oct 2026, same session as (s), owner: "fiz this
   wrinkle").** The live receipt replay for (s) exposed a second, older
   wrinkle: the server computed the named clarify sentence in 19 seconds, but
   the answer took minutes to appear on screen. The suggestion feed's
   heartbeat (feed-provider, a `surfaceNextFromGate` poll about every 30s)
   kept requests in flight just as the ask's redirect navigation tried to
   land; the browser log showed that navigation aborted (`net::ERR_ABORTED`)
   and retried across cycles. The race predates the ask-box fix and only
   occasionally loses (the day before, a receipt redirect landed promptly),
   but a late answer on camera would spoil the filmed demo, and "never
   silent" is worth little if "eventually" is minutes. The fix is one-way and
   small: the ask box's submit button already reads `pending` via
   `useFormStatus`, so it raises a module flag (`lib/askFlight.ts`) from
   submission until the answer's navigation commits, clearing it on every
   change and on unmount so a page swap mid-ask cannot leave it stuck; the
   feed tick returns early while the flag is up. Skipping ticks is free by
   the feed's own contract: the server enforces the real arrival gap, the
   Gate already shows the true state, and a missing tick is not worth an
   alarm. Scope decision, recorded deliberately: only the ask box raises the
   flag, because it is the slow action (10-60s, reliably spanning 30s
   boundaries); approve and decline take seconds, and if one is ever seen
   colliding, the same flag covers it in one line. The flag contract is
   pinned by its own test file (starts down, follows the last setter, ignores
   repeats); the wiring's receipt is live: the replayed ask must show its
   sentence within seconds of the server producing it, not minutes.
   Receipt delivered the same day (authtest, the exact "$10 ham Sandwich"
   replay): the heartbeat was provably silent during the ask (network log: no
   poll inside the whole ~24s action window), and the clean run landed
   submit-to-sentence in 7.3 seconds (button "Asking…" at 0.6s), against
   minutes the day before. One residual sliver, left open ON PURPOSE (owner
   decision, option A, 19 oct 2026): the flag drops when the action resolves,
   so a tick falling due inside the sub-second window before the navigation
   commits can still stagger that one landing (observed once: 25-55s, still
   never silent, never lost). Filming can retake; if a staggered landing is
   ever seen in ordinary use, the agreed next step is one line, holding the
   flag about two seconds past pending, not a redesign. Bonus evidence from
   the same replays: one run reported only the payee missing (the model
   judged "ham sandwich" purpose enough) where the day before it reported
   payee and purpose; the gate's sentence adapted word for word both times,
   proving the naming is computed, never canned. No replay filed anything;
   the account is untouched.
- (u) **Nav clicks wait in silence, and stay that way ON PURPOSE (owner
   decision, 21 oct 2026: "leave it").** The owner reported that clicking
   from the Gate to Rules or Record "dosent respond immediately", and asked
   whether that was a bug or the design. Answer, measured live on a warm
   server: click-to-commit is 1.2 to 1.9 seconds per hop (five hops timed),
   and after idle the first click also wakes the server, which adds seconds;
   that variance is the "sometimes". The wait itself is canon: Rules and
   Record are force-dynamic and read the live rules and the live ledger on
   every visit, never from a cache, so the round trip is the price of numbers
   that are always this second's truth. Hover prefetching was considered and
   rejected: it burns a live database read per hover and can show numbers a
   few seconds old, against the fresh-read rule. The gap is feedback, not
   speed: the forms announce their pending state (useFormStatus in the ask box
   and the decision buttons) while the nav keys announce nothing, so for one
   to two seconds the screen offers no spinner, no skeleton, no change on the
   clicked key. This Next version ships both canonical remedies (a route-level
   loading fallback file, and a useLinkStatus pending hint on the clicked key
   using the docs' debounced recipe: invisible for the first ~100ms, fading in
   only on slow navigations, opacity and transform only, inside §7 motion).
   They were offered as A page-level, B key-level, C both with C recommended;
   the owner chose D, leave it. Accepted as recorded: the wait is honest,
   nothing is ever lost, every click lands; the product's silence rule binds
   outcomes (verdicts, answers), and navigation always delivers its outcome,
   merely quietly. If the dead second ever becomes unacceptable (filming,
   judge feedback), the remedy on record is C: one new file, a small nav
   change, a few lines of canon-motion CSS. Not a caching redesign; the
   freshness is not negotiable.
- (v) **The owner closes the build: thorough playtest, it works (24 oct
   2026: "ive tested it throughly it works").** The final verdict on the
   product itself: the owner played every path he cared about and reported
   nothing new beyond the nav wait recorded in (u); no silence, no lost
   money, no wrong number surfaced. Together with the 22 oct receipts (335 of
   335 tests green, clean typecheck, remote tip 6a7ab2b), this closes the
   build. From this date, changes come only from filming or judging
   surprises, each waiting on the owner's word first, per the standing rule.
   The two recorded leave-it decisions (the tail sliver in (t), the nav wait
   in (u)) stand as the only known rough edges, both accepted, both with
   their remedies on record.
- (w) **First post-close change, on the owner's word: a fallback model
   provider (28 oct 2026).** The owner reported the primary gateway
   (Experiential Labs, deepseek-v4-flash) low on credit and asked for a
   second key so "if one fails another picks up immediately". Shipped as an
   env-gated chain, not a provider swap: `AGENT_API_KEY_2` /
   `AGENT_BASE_URL_2` / `AGENT_MODEL_2` configure a backup OpenAI-compatible
   endpoint (recorded backup: the Bitget hackathon gateway,
   https://hackathon.bitgetops.com/v1, model `qwen3.8-max`; the hyphenated
   name 404s there). The primary stays Experiential/deepseek, the path the
   whole playtest and all 335 tests proved; the order is env-only, so
   flipping it later is a config change. Safety shape: both attempts share
   the ONE 45s clock (a fallback attempt needs >= 12s left, else the
   primary's failure is reported straight away), so the run can never
   outlive the platform's limit and the honest "could not reach the model"
   sentence survives both-failing. The gate itself is untouched: the engine,
   not any model, decides; a dead key could never spend money, this is a
   convenience fix. Receipts: typecheck clean, 346 of 346 tests (11 new,
   mocked generateText, in `src/agent/agent.fallback.test.ts`), plus one
   live end-to-end run against the Bitget endpoint where qwen3.8-max called
   propose_purchase, got ASK from the engine, and reported "human approval
   required" honestly. Keys live only in `.env` (local) and Vercel env
   (owner's hand), never in code, chat, or commits.

---

## 7. The Live Instrument layer (positive spec, owner-approved 12 oct 2026)

The anti-slop bans (§3) are the floor. This is the positive half: how the app
feels alive without tripping the new tells. It is written as specifically as the
bans so there is no gap for defaults to fill.

**The split — printed where permanent, alive where responsive.**
- The **Record** and the **case file** are *Print*: receipt strip, stamp,
  immutability, hairline rules. Settled and permanent. *(Superseded in skin,
  owner call 13 oct 2026: the paper metaphor's job — permanence — now rides on
  "icy paper": matte white panels, hairline ice rules, the deep-ice receipt
  strip. The behavior is unchanged; only the warm paper look retired.)*
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

*(Superseded the same day by the owner's second call, §6(f): with every screen
in the ice, the unified object language is the ice one — matte panes at 16px
radius, capsule buttons, hairline ice rules, the seamless top bar. The 6px
paper radii and seal-fill buttons recorded below are historical.)*

The Live Instrument layer (§7) rebuilt the Gate; this folds the same face onto
the Print screens and the entry screens so the whole app reads as one product.
It changes shapes and fills only. It adds no motion and no numbers to the
Print screens, which stay printed and still.

- **Boxed objects** — decision cards, ask box, rules editor, decision slip,
  decided box, receipt strip, integrity and decision-order strips, empty
  state, away banner, sign-in notice: paper fill, hairline `line` border,
  **6px radius**. The decision object (the slip, and the needs-you card)
  carries the heavier `ink` border. On the live surfaces this is superseded by
  §9 and §10: instrument band 24px, veils 16px, pill buttons, seamless top bar
  (owner picks 13 oct 2026); the Print screens keep 6px.
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

---

## 9. The crafted-glass system (icy instrument ground, 13 oct 2026)

Glassmorphism was banned in §3.13 as a slop detector, not because glass is
ugly: frosted cards over purple gradients and drifting blobs were the
signature of mass-produced AI design. The ban is lifted only as a craft
contract. Five conditions separate the approved glass from the default glass,
and all five are mandatory:

1. **The palette is ours.** Icy blue on cold navy (§2), never the default
   purple-blue.
2. **The backdrop is composed and still.** Layer 0 is a pale ice field;
   layer 1 is a washed blue-duotone architectural silhouette of our own
   drawing (spires, towers, an arcade band, fine structural lines) at whisper
   opacity plus a faint grain, so the frost blurs a picture with real
   structure (image-settled 14 oct 2026, §6(i): the harbour vignette became
   architecture). Nothing drifts, nothing animates. Life comes from the
   instruments on top, never from the wallpaper.
3. **Glass is tiered and rare.** The instrument band is true frost (white at
   about 55%, 24 to 32px blur); the navigation console is frost too
   (§6(j)). The light veil
   (white at 60%, blur 12px) is reserved for documents and callouts: the
   decision slip, the closed box, the sign-in notice, the away banner, and
   the front door's example band. Information-dense panes (preamble,
   decision order, rules editor) sit on the paper tier (white at 86%, no
   blur), and the integrity row sits open on the ground under hairlines
   (image-settled 14 oct 2026, §6(i): dense content on opaque surfaces,
   most things not blurred at all).
4. **Frost is rare and the frame stays solid.** At most two frosted objects
   per view: on the Gate, the navigation console and the instrument band; on
   the front door, the navigation console and the example band, which is that
   page's hero overview panel (image-settled 14 oct 2026, §6(i)).
   Every other screen carries the same console as shared product chrome (its
   frost is the only one there) and icy-paper panes in the light veil tier
   (white at 60%, blur 12px; owner call 13 oct 2026, third call). True frost
   never appears off the Gate and front-door views. The console
   sits still at the top of the page and scrolls away with it (owner call
   13 oct 2026); the floating dock stays retired (the console never follows
   the owner; art-directed 15 oct 2026, §6(j)). Cards are veils, not glass.
5. **Contrast is verified on the worst case.** Every text pair is checked at
   4.5:1 against text over a glow, not against the easy ground.

**Layers.** 0 ground, 1 composed still backdrop, 2 panes. A `@supports`
fallback gives browsers without `backdrop-filter` an opaque pane, never a
half effect.

**Edges and depth.** On light ice the frost edge is a near-white hairline plus
an inset top highlight; shadows are soft blue, never black. The single special
mark on live is the thin accent left rule on the needs-you card. Three
elevations, no more: resting shadow, hover lift, needs-you. No coloured bloom.

**Radii on live.** Instrument band 24px, veils 16px, buttons and top-bar pills
999px, mark tile 10px, left rules and hairlines square, stamps square. Paper
keeps §8.

**Type on live.** Sora for display/UI, IBM Plex Mono for data, no serif. The
two-tone accent device is allowed exactly once per view: one word or figure
in ice to point the eye (the spent figure, the waiting count), never
decoration.

**Motion in glass.** The §7 canon stands, plus three clauses: never animate
`backdrop-filter`; the backdrop never moves; hover on glass is a 2px lift with
a deeper shadow, never a blur or opacity pump. `prefers-reduced-motion` snaps
all movement; the blur itself is not motion and stays.

**Verdicts and states.** Meanings are frozen; only values swap. On light ice
the live surfaces reuse the paper verdict values, which pass contrast on
white; the Print screens are unchanged. Focus is a 2px accent ring with
offset, because pale grounds swallow default outlines.

---

## 10. The Gate cockpit (approved composition, specimen v7, 13 oct 2026)

Specimen `design-research/live-instrument.specimen.v7.html` is the locked
reference for the Gate rebuild. The poster is gone; the Gate is a cockpit:

- **Status strip, not a headline.** One live line under the top bar: a
  breathing dot, the waiting count in accent-ink, a ticking "evaluated Ns ago",
  the rules id, and the trust line ("checked fresh every time, never from
  memory") quiet at the right. No display headline on the Gate.
- **The budget is a horizontal instrument band (frost 1).** Readout at 32px
  mono with its unit line under it; the wall carries scale ticks at 25 and 50,
  an amber caution threshold at 75 explained in words beside it ("cap $200 ·
  caution from $150 · resets on the 1st"), and the hard cap notch at the end;
  the legend sits under the bar; "Approval cannot move this line" is a
  footnote at the right with the anchor mark, set in Sora light. Added to the
  specimen 17 oct 2026 (§6(m)): a cap-preview ghost marker, one 2px line that
  appears on the bar only while a waiting card is hovered or focused, showing
  where that card's money would land, and turning refusal-red with the bar when
  it would land past the cap. It is absent entirely when no card is in focus.
  Also 17 oct 2026 (§6(p)): the band's colour is driven by confirmed spend
  alone, so it agrees with the readout, the caution notch and the engine;
  set-aside money keeps the pale band and the legend's words instead of the
  colour.
- **The queue is the body.** Four equal columns on open ground with thin left
  rules (accent on needs-you), no boxes. Every item carries a live elapsed
  time that ages once a minute. Columns stretch to equal height and each
  column's last element bottom-aligns, so all four end on one edge. The
  requests own the start of the scan and the ask column sits last in the
  row (image-settled 14 oct 2026, §6(i): the assistant supports, the money
  leads; supersedes the v7 ask-first order).
- **The navigation console (frost 2) sits still.** One floating frost object
  at the top of the page on the 1200px envelope, radius 18px, the band's
  material recipe, the ice visible all around it (art-directed 15 oct 2026,
  §6(j)): mark tile, wordmark, drafting tick, the nav keys, drafting tick,
  then the away badge, the owner line in mono, and the Sign out utility
  capsule. It scrolls away with the page (owner call 13 oct 2026: nothing
  follows him). The floating dock is retired.
- **Buttons.** One capsule family: 44px, 36px small. Primary is accent-ink
  fill with white text (5.9:1), hover one step darker; quiet is white with a
  hairline; the active nav key is a white key with accent-ink text and the
  accent rule under the label (§6(j)). White never sits on the bright
  accent.
- **Scale.** Spacing on the 8pt scale (8/16/24/32/48/64/96). Type on live:
  18 headings, 15 sub, 14 body, 11 mono caps, 22 mono figures, 32 mono
  readout. Motion stays the §7 canon.

Every screen joined the ice by the owner's second call of 13 oct 2026 (§6(f)):
the Record, case files and Rules are "icy paper" (this cockpit's language with
veil panes in place of true frost, deepened by the third call, §6(g)), the
entry screens wear the same navigation console and ground, and the front
door lives at
"/" for signed-out visitors (Option A: one address, two doors; the intro page
itself is the static `/home` route the proxy rewrites to). The sign-in title
sets in Sora with the accent hook; the serif retired everywhere with the warm
paper. The front door's instrument band is a true-frost `.gauge.demo`
reproduction (retiered 14 oct 2026, §6(i))
labelled "an example · not live data", which keeps §3 ban 5 (no invented
metrics) honest.
