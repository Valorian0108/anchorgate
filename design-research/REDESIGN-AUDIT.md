# AnchorGate Redesign: Audit and Change Plan

**Status: report only. Nothing has been edited. No code, no CSS, no canon changes.**
Prepared 14 oct 2026 in response to `VISUAL-REFINEMENT-BRIEF.md` (owner-provided, Architectural Glass).
This is Phase 1 (Inspect) and Phase 2 (Plan) of the brief's workflow. Implementation waits for the owner's calls on the three arbitrations in Part 3 and his go on the plan in Part 4.

---

## Part 1: What exists today

### 1.1 The styling architecture

- One stylesheet: `src/app/globals.css`, 984 lines, 17 commented sections. No Tailwind, no UI library, no CSS modules, no scattered inline colors (canon ban 7: tokens are locked, no inline hex outside the token block).
- Every value flows from one `:root` token block (~50 tokens, lines 20-95).
- Fonts via `next/font`: Sora (the interface voice, `--g`) and IBM Plex Mono (data and metadata, `--m`). No serif; it retired 13 oct.
- 17 components in `src/components`, 8 screens. Pages are server components; the client components are presentational (GateCard, AnchorWall, AskBox, StatusStrip, Age, CountUp). The board owns UI state; server actions own behavior.

### 1.2 Design token inventory (`globals.css` `:root`)

**Ice neutrals:** ink `#12293A`, ink-soft `#4A6072`, ink-faint `#546A7C`, paper `#F4F9FC` (ground fallback), surface `#E7F0F7` (hover tint), line `#D8E5EE` (hairline), pane `rgba(255,255,255,.60)` (veil fill), pane-edge `rgba(255,255,255,.85)`, warm-dark `#0F2B3D` (the receipt strip's deep ice).

**Accent:** accent `#2D9CDB` (fills, bars, dots, rules only; never text), accent-ink `#0F6E8C` (small accent text, links, primary button fill at 5.8:1 with white), accent-deep `#0A566C` (hover), accent-text `#2289C9` (large display only: hook words, the 32px readout), seal-tint `#E4F0F7`.

**Verdicts (meanings frozen):** allow `#2F6B4F`, ask `#97590F`, deny `#9E2B25`, plus bright variants for the dark strip.

The four secondary inks are the polish-audit values (canon §6(h)): every pair measured at >=4.5:1 for small text and >=3:1 for large text against the real composited grounds, including the art overlap and the frost.

**Glass (three tiers as tokens):**
- `--bf-bar`: blur 24px, saturate 160% (the top bar)
- `--bf-band`: blur 32px, saturate 165% (the Gate instrument band)
- `--bf-veil`: blur 12px, saturate 140% (every icy-paper pane)
- Fills: frost is white at 55-58%, veil is white at 60%.
- Hard build constraint: blurs must travel as `var(--bf-*)`. The CSS minifier rewrites literal `backdrop-filter` values to `-webkit-` only and breaks them; `var()` references pass through untouched. Hand-written `-webkit-` twins are banned.
- An `@supports not (backdrop-filter)` block (lines 978-984) falls every tier back to solid ice, never a half effect. Any retier must update this list.

**Shape and depth:** shadows sh-1/2/3 plus sh-pane (soft drop + the inset top highlight that makes glass read as glass). 8pt spacing scale s1-s7 (8/16/24/32/48/64/96). Type scale: readout 32, figures 22, headings 18, sub 15, body 14, caps 11. Radii frozen (§9): band 24px, veils 16px, capsules 999px, mark tile 10px, stamps and hairlines square.

**Motion:** three durations (120/220/420ms) and three easings, transform and opacity only, `prefers-reduced-motion` collapses everything to a 150ms fade and kills the pulse and wall transitions.

### 1.3 Where the glass actually sits (the full map)

**True frost (2 objects, the canon §9 maximum):**
1. `.topbar` (bf-bar) on every screen
2. `.gauge` instrument band (bf-band) on the Gate only

**Light veil (bf-veil), nine panes** (the "enforce the glass more" call, 13 oct, canon §6(g)):
`.integrity` strip (Record + Rules heads), `.preamble` (Rules), `.order` (case-file decision order), `.rules-edit` (Rules editor), `.slip` + `.stampbox` (the case-file decision documents), `.signin .notice`, `.away-banner`, `.gauge.demo` (the front door's labelled example band).

**Solid, no blur:** capsule buttons, nav pills, chips, the dark receipt strip, record row hover.

### 1.4 The ground (backdrop)

`.ice-backdrop`, fixed, composed once, never animated:
- Layer 0: three-stop ice gradient (`#F4F9FC` -> `#E6F1F8` -> `#DAEAF4`) plus two quiet radials (a white glow top-center, a 10% blue corner bottom-right).
- Layer 1: HarbourArt, our own line-drawing SVG in `chrome.tsx`: a horizon line, a large anchor motif top-right, a sweeping pier curve with four mooring-ring circles, a mast, a small hull with stays, two gulls, a piling. Accent color at 16% opacity with a 2px blur.
- Layer 2: the finest grain (an SVG turbulence data URI at effectively 2% opacity).

### 1.5 The label voice

`.cap` is "one size, one style, everywhere": mono 11px, uppercase, 0.08em letterspacing, ink-faint. It is used for status marks, gauge caps, band-head captions ("At the gate"), the ask-box label, form field labels, and chips. On top of it there are 19 further direct uppercase declarations: the brand wordmark, page-head refs and counts, Record column heads, the case ref, the slip posture line, the stamp, receipt headers, four sign-in labels, two front-door labels. One deliberate exception exists: the gauge legend sets `text-transform: none`.

### 1.6 The Gate composition (canon §10, specimen v7)

- **StatusStrip:** one live line (breathing dot, waiting count, "evaluated Ns ago", rules id, the trust line quiet at the right).
- **Instrument band** (`.gauge`, frost): the 32px mono spent readout in accent-text with "of your $X limit · N% used" under it; the wall bar carries the spent fill, a translucent set-aside segment, scale ticks at 25 and 50, an amber caution threshold at 75, and the hard cap notch; the legend sits under the bar; the right side (fixed 280px track, so the wall keeps the dominant middle) carries "Approval cannot move this line" in Sora light with the anchor mark, plus the cap/caution/reset line. The wall color is a live signal: accent while there is room, ask amber from 75%, deny red from 90%. The no-cap and zero-cap states have their own honest copy and a link to Rules.
- **Queue** (`.cols`): a fixed 4 x 1fr grid on open ground, columns with thin left rules (accent on needs-you), no boxes. DOM order today: AskBox (column 1), the waiting cards, one settled card (SETTLED_SHOWN = 1), and, when nothing waits, an empty state spanning columns 2-4 whose copy says "Use the first column to ask the assistant to look at something."
- **GateCard:** status line (dot + worded mark + live Age), payee heading, "category · purpose", the source line ("brought by your agent" / "you asked for this"), the 22px amount, then either the two decision capsules or the settled receipt line + "Open the record". Working and failed states have honest lines. **Blocked cards already carry the engine's reason**: `gateCard.ts` builds the receipt as `reasonPhrase(reasonCode)` + " · no money moved" for DENIED records, so a blocked card reads e.g. "over your monthly limit · no money moved".

### 1.7 Responsive and accessibility state

- Seven width breakpoints: 1250 (Record grid tightens), 1100 (cols -> 2-up, gauge tightens), 1000 (Record becomes deliberate grid-area card rows, column heads hide), 980 (case body single column), 900 (gauge stacks to one column, clause rows reflow, sign-in split stacks), 760 (case head, receipt, facts reflow; owner name hides), 680 (cols single column; the top bar wraps to two centered rows).
- Contrast floors enforced and documented (§6(h)): every pair measured against the real composited grounds.
- `:focus-visible`: 2px accent-ink ring, 3px offset, on every control.
- Status is never color-alone: every dot, chip, and mark carries a word.
- Reduced-motion block is complete.
- Browserslist: chrome/edge/firefox 111, safari 18 (a safe backdrop-filter baseline).

### 1.8 Functional constraints (the do-not-touch list)

**Behavior:** the rules engine and its versioning; the spending math (minor units: spent, set aside, left); server actions `proposeFromGate` / `decideFromGate` / `updateRules`; the PayPal order + capture flow; auth (password, magic link, Google) and the proxy rewrite (one address, two doors); the live feed heartbeat and away count; the Age ticker; CountUp (counts only on a real value change, ban 19); the ask box's honest outcomes (`askOutcome.ts`); the source-line honesty; the case file's stamp day vs filing day.

**Copy pinned by tests:** askOutcome strings, vocab reason phrases, gateCard receipts. Any copy change must ship with its test update in the same commit. This plan avoids touching pinned strings entirely.

**Build traps:** the backdrop-filter minifier rule (only `--bf-*`); the `@supports` fallback list must follow any tier change; tokens locked (no inline hex outside `:root`).

**Canon floors that stay in force:** contrast 4.5:1 / 3:1 worst case; motion 120/220/420, transform + opacity; no emoji; no third-party icons (our stroke set only); no gradients on text or buttons; accent footprint under ~5% of a view; the two-tone hook word at most once per view; no invented metrics (the front door's demo band stays labelled "an example · not live data").

**Shipping:** a push to master redeploys the live site at anchorgate-five.vercel.app. All redesign work stays local and is verified on the dev server first; nothing pushes without the owner's word.

---

## Part 2: The brief against the current state, section by section

### Brief §2 (understand the product)
Aligned. The brief's description matches the built product exactly. No change.

### Brief §3 (background and atmosphere)
- "Retain the pale blue, icy-white identity": **keep**. The ground gradient, the two radials, and the grain stay as they are.
- "Subtle architectural linework, abstract structural geometry": **change**. Layer 1 today is a harbour vignette of recognizable objects (anchor, hull, gulls, mooring rings). The brief asks for architectural linework. Intent: redraw layer 1 as a quiet structural elevation (thin pier, beam, and column lines, abstract geometry), keeping the anchor motif as the one brand signature inside it, still at 16% opacity, still blurred 2px, still never animated. Canon §9 condition 2 names the harbour scene, so it gets amended. Process: the new art is drawn in a standalone specimen page first for the owner to feel, and only swapped into `chrome.tsx` after his approval (the established one-screen-at-a-time process).
- "Restrained ambient blue light": **keep**. The two radials already are exactly this; no new glows (bans 12/14/17 already forbid them).
- "Avoid excessive decorative circles, random gradients, glowing blobs": **already true**, with one exception: the four mooring-ring circles in the art. They disappear with the redraw.
- "No new photographic background": agreed, none planned.

### Brief §3 (glass materials)
- Translucent surfaces, precise borders, soft realistic shadows, varied opacity, controlled radii: **keep**. This is exactly the existing tier system.
- "Reserve the strongest glass for selected elements (floating navigation, an important overview panel, an intentional overlay)": **already aligned**. The two frost objects are the top bar and the Gate band, which are precisely those things, and canon already caps frost at two per view.
- "Do not blur every card; information-dense content on sufficiently opaque surfaces": **change (arbitration 3)**. The third call of 13 oct spread the 12px veil across all nine panes. Intent: retier. Veil becomes reserved for documents and callouts: the case-file slip + stampbox, the sign-in notice, the away banner, and the front door's demo band (that screen's one showcase pane). The information-dense panes move to a new **paper tier** (near-solid white at ~84%, no backdrop-filter, same hairline edge and inset highlight): the integrity strip, the preamble, the decision order, the rules editor. Worth noting: the original §9 contract already said "not everything frosted equally, and most things not at all", so the brief pulls us back toward the crafted-glass contract's own wording, not away from it. Side benefit: four fewer blur surfaces, cheaper compositing (the brief's §8 performance goal).

### Brief §4 (identity and hierarchy)
- Cyan/blue accents, technical status language, precise dividers, restrained mono metadata: **keep**, all present.
- The hierarchy ladder (headings / main figures / supporting descriptions / compact mono metadata / worded status): **keep**, the type scale already is this ladder.
- "Status indicators never dependent on color alone": **already true** (words beside every dot). Keep.
- "Red only for genuine blocked states; warning colors consistent near limits": **already true** (deny appears only on declined/blocked/failed; ask amber marks both the ask verdict and the 75% threshold). Keep.
- "Do not turn every label into uppercase text or every element into a technical instrument panel": **change (arbitration 1)**. Intent: split into two label voices. The **instrument voice** (uppercase mono) stays on true metadata: the status strip, the receipt strip, the stamp, Record column heads, page refs, the gauge cap line, chips and marks, the brand wordmark. A new **content voice** (sentence case, Sora, 12-13px, ink-soft) takes over content-facing labels: band-head captions ("At the gate"), the ask-box label, sign-in/sign-up field labels, empty-state headings. About 8-10 label instances flip; the instrument metadata stays.

### Brief §5 (the Gate experience)
- The spending overview's three communications (limit + used; the visual relationship; the constraint or warning): **already implemented**, and they are literally the current spec: the readout, the wall with its ticks/threshold/cap, and the live color + "Approval cannot move this line" + cap/caution/resets line. **Refine only**: give the readout slightly more isolation through spacing; keep the legend quiet (it is already sentence case); no structural change.
- "Do not let a progress bar, metadata, or decoration compete with the money": **aligned**. The grid (auto / 1fr / auto) already gives the wall the dominant middle. Keep.
- "Status, description, amount, and reason immediately understandable": **aligned**. The card order already is status -> payee -> purpose -> source -> amount -> decision or receipt.
- "Blocked requests deliberate and informative; reason easy to find": **largely aligned**. The board's blocked card already shows the engine's reason (reasonPhrase + "no money moved") and the case file carries the rule-by-rule rationale. One **refinement**: the reason currently sits in the quiet 11px mono receipt line; give the blocked card's reason line a stronger treatment (ink color, slightly larger) so the reason is scannable at a glance. CSS-only; the pinned receipt string does not change.
- "The assistant as a supporting tool, not the dominant element": **change (arbitration 2)**. Today the ask box is column 1 of 4, first in scan order. Intent (recommended option A): keep the open-column treatment, move it to the end of the row so the requests own the start of the scan. One dependent sentence must follow: the empty state says "Use the first column to ask the assistant to look at something" and becomes position-independent ("Use the ask column..."). The empty-state span rule mirrors (columns 1-3 instead of 2-4). Zero behavior change. Option B (not recommended): collapse the ask box into a single console row under the status strip; it demotes the assistant further but rewrites more of the approved v7 composition and creates a wide panel.
- "Preserve the Gate, Rules, Record navigation and purpose": **keep**, untouched.

### Brief §6 (layout and composition)
- Clear page width: exists (`.wrap`, 1200px). Keep.
- Consistent grid, whitespace grouping, "not every section needs a container": **aligned**. The queue is ruled columns on open ground; ban 4 (no card soup) already governs.
- "Avoid unnecessarily wide, shallow panels containing unrelated information": **refine**. The integrity strip (Record + Rules heads) is exactly that shape: a full-width veiled flex row of mixed metadata. Intent: dissolve the container. The items become a hairline-ruled metadata row directly under the page head on open ground (no fill, no blur, no box). This also removes one veil pane, helping the §3 retier. All information stays; only the box goes. Fallback if any item measures weak on open ground: the paper tier instead.
- "Most important information near the start of the scan": the ask-box move is the main fix, plus a small alignment pass between band-head and the columns' rhythm.

### Brief §7 (interaction and motion)
- Refined hover/focus, short transitions, nav feedback: **present** (button lift and press, row hover, focus-visible ring, active nav pill, load reveal stagger, row-enter on live arrivals). A polish pass only: even out hover timings on record rows and links; make sure the nav pill's active transition reads clearly.
- "Carefully considered expansion of request details": **deliberate trade-off, flagged**: no in-board accordion. The case file is the one source of detail truth; expanding cards inside the board would duplicate it and break the equal-column-bottoms composition. "See the full case" stays the path to detail. The brief lists expansion as an example, not a requirement.
- "Motion must explain; do not animate everything; respect reduced motion": **already canon** (§7 motion table, bans 15/16/19). No new motion planned beyond the existing primitives.

### Brief §8 (responsive and accessibility)
- "Deliberate mobile layouts, not a squeezed desktop": **partially true**. The Record reflow at 1000px is deliberate (grid-area card rows). The Gate stacks to single-column at 680px, fine. The weak spot is the top bar, which wraps into two centered rows at 680px. Intent: a deliberate compact row at narrow widths (mark + brand left, nav pills, condensed right cluster; the owner name already hides at 760px).
- Spending overview reflow: already deliberate at 900px (single-column gauge, side note left-aligned). Keep.
- Controls: stacked full-width capsules at narrow widths are thumb-friendly. Keep.
- Glass contrast over varying backgrounds: the floor stands; the retier reduces risk (dense text moves to near-solid paper). The contrast sweep reruns on every changed pair.
- Keyboard and focus: present; verify unchanged.
- Decorative layers: the backdrop is z-index -1 and aria-hidden; it cannot obstruct. Keep.
- Blur cost: improves with the retier (four fewer blurred surfaces).

### Brief §9 (engineering constraints)
Compliant by construction: one stylesheet, token-driven, zero new dependencies, zero framework change. The change surface is: `globals.css`, `chrome.tsx` (the art), `gate-board.tsx` (column order + one empty-state sentence), label instances across a few components, and possibly the Record/Rules page markup for the integrity row. No engine, action, auth, feed, or test-logic changes. No mock data anywhere (ban 5 stands).

---

## Part 3: The three arbitrations (owner decides before implementation)

### 1. Uppercase labels
- **Canon says:** §10 froze "11 mono caps" as the metadata voice; §1 froze the uppercase wordmark.
- **The brief says:** "Do not turn every label into uppercase text or every element into a technical instrument panel."
- **Recommendation:** two voices. Instrument uppercase stays on true metadata (strip, receipt, stamp, column heads, refs, brand). Content-facing labels (section captions, form fields, the ask label) flip to sentence-case Sora. This also honors existing ban 2 ("no eyebrows on every section"), which the caps sprawl had drifted from. Canon §1/§10 amended.

### 2. Ask-box position
- **Canon says:** §10 froze the v7 cockpit with the ask box as column 1.
- **The brief says:** the assistant is "a supporting tool, not the dominant visual element", and §6 says keep the most important information near the start of the scan.
- **Recommendation:** option A. The ask box keeps its open-column treatment but moves to the end of the row; requests own the start. The one position-dependent sentence in the empty state gets reworded; the empty-state span mirrors. Option B (a console row under the strip) exists but rewrites more of the approved composition. Canon §10 amended.

### 3. Glass depth
- **Canon says:** the third call of 13 oct ("enforce the glassmorphism more") put all nine panes on the 12px veil.
- **The brief says:** "Do not blur every card, button, input, or section"; dense content on "sufficiently opaque, highly readable surfaces"; the strongest glass reserved for selected elements.
- **Recommendation:** the brief wins, logged as a partial supersession of the third call (new canon §6(i)). Frost stays exactly as is (top bar + Gate band: the brief's own "selected elements"). Veil is reserved for the two case-file documents, the two callouts (sign-in notice, away banner), and the front door's demo band. A new paper tier (~84% white, no blur) takes the four information-dense panes, and the integrity strip dissolves to an open hairline row. This returns to §9's original wording: "most things not at all". Canon §9 conditions 3/4 amended.

---

## Part 4: The work plan (after the owner's go)

- **Phase A, canon first:** amend `CONSTRAINTS.md` (§6(i) log entry, §9 tier wording, §10 queue order, §1 label voices, the art description) so the single source of truth leads the code. One commit.
- **Phase B, the ground art:** draw the architectural-linework backdrop as a standalone specimen for the owner to feel; swap HarbourArt in `chrome.tsx` only after his approval. One commit.
- **Phase C, glass retier:** add the paper token, move the four panes, dissolve the integrity strip, update the `@supports` fallback list. One commit.
- **Phase D, Gate composition:** ask box to the end of the columns, mirror the empty-state rule, reword the one dependent sentence, strengthen the blocked reason line, micro-spacing around the readout. One commit.
- **Phase E, the label pass:** flip the ~8-10 content labels to the new voice; instrument metadata untouched. One commit.
- **Phase F, responsive and nav polish:** the compact top-bar row at <=680px, hover/focus evening pass. One commit.
- **Phase G, verify:** contrast re-sweep on every changed pair against worst-case grounds; `tsc`; the full vitest suite (262 tests); a production build; a dev-server click-through including the full money path (propose -> decline -> approve -> PayPal sandbox capture); a narrow-width static review to 390px; a reduced-motion check; console clean. Results recorded in the canon audit log. **Push only on the owner's word** (a push redeploys the live site).

### Risks and tripwires
- The minifier trap: any new blur must go through a `--bf-*` token.
- Contrast floor: the paper-tier value must be measured against the gradient's mid and bottom stops plus the art overlap before it ships (84% white should improve every pair, but it gets verified, not assumed).
- Pinned copy: no askOutcome/vocab/gateCard string changes are planned. The two board sentences that do change (the empty-state line) are not test-pinned; that gets double-checked before editing.
- Every phase is presentational; a `git revert` of any single commit restores behavior intact.
- Timeline: comfortably inside the Nov 12 submission. The packaging work (README, demo video, Devpost) is independent of this redesign and can interleave.

### What this plan does NOT do
No photographic background. No accordion. No new dependencies or libraries. No new motion beyond canon. No engine, action, auth, or feed changes. No mock data. No push without the owner's go.

---

## Part 5: What is needed from the owner

1. The three arbitration calls in Part 3 (or one word: "your recommendations", and all three are adopted as written).
2. The go to start Phase A.

---

## Part 6: Implementation record (14 oct 2026, same day)

The owner settled the arbitrations with two reference images plus the brief
("if any overwrite what i settled previously, as long as it follows the glass
brief and this direction, follow it") and ordered the changes made one after
the other with no commit until all succeed. Implemented and verified:

- Canon amended first (§1 two label voices and heavy display, §9 conditions
  2/3/4, §10 queue order, new §6(i) log).
- Glass retiered: paper tier token `--pane-paper` (white 86%, no blur) on the
  preamble, decision order and rules editor; the integrity row dissolved to
  an open hairline row; veil kept on slip, stampbox, sign-in notice and away
  banner; the front door's example band upgraded to true frost as that
  page's hero overview panel; `@supports` fallback list updated.
- Backdrop: harbour vignette replaced by an architectural silhouette
  (spires, tower, arcade band, fine structural lines), crisp at 7% opacity.
- Labels: content voice `.sec` on band heads, the ask label, form fields,
  sign-in headline and sub, rules-editor label, case-file section labels;
  instrument caps kept on strip, receipt, stamp, register heads, refs,
  chips, gauge caps, wordmark. Front-door column eyebrows removed.
- Gate: ask column moved last (`order: 20`, empty-state span mirrored, one
  position-dependent sentence reworded); blocked cards state their reason
  in the content voice; display headings at weight 700; compact two-row top
  bar at 680px and under.
- Refused with reasons (canon §6(i)): dark mode, floating bottom dock,
  radial arc gauge.

Verification the same day: contrast sweep re-run (every pair passes; the
texture exception holds at 4.28 or better over the darkest silhouette mass);
`tsc` clean; 262/262 vitest; production build clean (10 routes); dev-server
click-through of the front door, Gate, Record and Rules with computed-style
probes confirming every tier; console clean (no errors, no warnings).
Narrow widths reviewed statically (no viewport emulation in this
environment), as before.
