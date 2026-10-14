<!--
  Owner-provided brief, 14 oct 2026. Saved verbatim as the direction for the
  upcoming redesign. Status: NOT yet in force. The owner is clarifying scope
  first, and where this brief crosses decisions frozen in CONSTRAINTS.md,
  he decides which wins before implementation starts. Nothing has been
  built from this file.
-->

# AnchorGate — Visual Refinement Brief
## Art direction: Architectural Glass

### 1. Your role

Act as a senior product designer, design-systems architect, and experienced frontend engineer.

Your task is to elevate the existing AnchorGate interface from an LLM-built prototype into a visually deliberate, production-quality product interface.

This is a refinement of an existing product, not a new product concept. Study the current implementation before changing it.

### 2. Understand the product before designing

AnchorGate is an authorization interface for AI-initiated purchases and actions.

Its purpose is to help users understand what their AI agent can do, what spending rules apply, what requests are waiting for attention, and why a request was approved or blocked.

The interface must communicate:

- Trust without making unsupported promises.
- Control without unnecessary complexity.
- Technical precision without looking sterile.
- Security without relying on generic cybersecurity visuals.
- Sophistication without sacrificing usability.

The interface is not a generic fintech dashboard, an AI chatbot, or a portfolio website.

### 3. Visual direction: Architectural Glass

Use a restrained, light-mode glassmorphism design language inspired by architectural photography, carefully art-directed portfolio interfaces, and sophisticated editorial layouts.

The desired result should feel like a precise technical product occupying a calm, luminous architectural environment.

**The central design principle: architectural atmosphere outside; operational clarity inside.**

#### Background and atmosphere

- Retain the existing pale blue, icy-white visual identity.
- Use subtle architectural linework, abstract structural geometry, and restrained ambient blue light.
- Create a sense of depth through carefully controlled contrast and layering.
- Keep background details quiet enough that they never compete with important information.
- Avoid excessive decorative circles, random gradients, glowing blobs, and generic futuristic imagery.

Do not introduce a new photographic background unless it genuinely strengthens the existing visual concept.

#### Glass materials

Treat glass as a deliberate interface material, not a universal card style.

Use:
- Translucent surfaces with restrained backdrop blur.
- Subtle, precise borders that catch ambient light.
- Soft, realistic shadows to establish depth.
- Slightly different opacity levels for different interface layers.
- Carefully controlled corner radii and consistent surface treatments.

Reserve the strongest glass effect for selected elements, such as floating navigation, an important overview panel, or an intentional overlay.

Keep information-dense content on sufficiently opaque, highly readable surfaces. Do not blur every card, button, input, or section.

Avoid excessive glow, thick white borders, exaggerated shadows, and the familiar template look of purple-gradient glass cards.

### 4. Preserve and refine AnchorGate's identity

Retain the existing cyan and blue accents, technical status language, precise dividers, and restrained monospaced metadata where they serve a purpose.

Develop a consistent hierarchy:

- Primary headings: clear, confident, and readable.
- Main figures: prominent and easy to scan.
- Supporting descriptions: quieter but comfortably legible.
- Technical metadata: compact and monospaced where appropriate.
- Status indicators: consistent, meaningful, and never dependent on color alone.

Use cyan or blue for active states and ordinary interaction cues. Reserve red for genuine blocked states, exhausted limits, or other serious conditions. Use warning colors consistently for approaching limits.

Do not turn every label into uppercase text or every element into a technical instrument panel.

### 5. Refine the Gate experience

Inspect the existing Gate page and improve its composition without changing its underlying meaning or behavior.

The spending overview should communicate three distinct things:

1. The spending limit and amount used.
2. The visual relationship between spending, remaining allowance, and the limit.
3. The relevant authorization constraint or warning.

Give these elements a clear visual hierarchy. Avoid letting a progress bar, metadata, or decorative details compete with the primary financial information.

The request area should make the request's status, description, amount, and reason for its current state immediately understandable.

Blocked requests must feel deliberate and informative, not merely red-colored. Make the reason for the block easy to find.

The assistant interaction should feel like a supporting tool for proposing or explaining an action, not the dominant visual element of the dashboard.

Preserve the existing Gate, Rules, and Record navigation and their product purpose.

### 6. Layout and composition

Use deliberate spacing, alignment, and grid relationships rather than adding more cards to organize everything.

- Establish a clear page-level content width.
- Align related information to a consistent grid.
- Use whitespace to distinguish sections.
- Avoid unnecessarily wide, shallow panels containing unrelated information.
- Keep the most important information near the beginning of the user's visual scan.
- Make related elements feel connected and unrelated elements feel distinct.
- Ensure the composition remains intentional when the viewport changes.

Not every section needs a border, background, shadow, or container.

### 7. Interaction and motion

Add subtle interaction design where it improves understanding.

Examples include:
- Refined hover and focus states.
- Short, restrained transitions between interface states.
- Clear feedback when navigation changes.
- Carefully considered expansion of request details.
- Visual feedback for selected controls and current status.

Motion must explain an interaction or reinforce hierarchy. Do not animate everything, add unnecessary parallax, or introduce movement simply to make the page feel expensive.

Respect reduced-motion preferences.

### 8. Responsive behavior and accessibility

Treat mobile and desktop as deliberate layouts, not the same desktop page squeezed into a smaller viewport.

Verify that:
- The navigation remains usable at narrow widths.
- The spending overview reflows without cramped columns.
- Request details remain readable.
- Buttons and controls remain easy to operate.
- Glass surfaces maintain sufficient text contrast over varying backgrounds.
- Keyboard navigation and visible focus states work.
- Decorative layers do not obstruct interaction.
- Blur effects do not become unnecessarily expensive.

Do not trade accessibility or performance for visual effects.

### 9. Engineering constraints

Before implementation, inspect the existing project structure, styling system, reusable components, and relevant Gate, Rules, and Record pages.

Identify the actual source of the current visual treatment before editing it.

Preserve existing product behavior, authorization rules, spending calculations, data flows, authentication, and backend integrations.

Do not replace functional features with mock data, static visual demonstrations, or nonfunctional buttons.

Do not introduce a new framework, UI library, or unnecessary dependency merely to achieve the visual direction.

Prefer improving existing reusable components and design tokens over creating page-specific styling inconsistencies.

Avoid unnecessary rewrites. Make focused changes that are consistent with the current architecture.

### 10. Implementation workflow

**Phase 1 — Inspect.** Review the current codebase, identify the relevant files and reusable components, and understand which behaviors must remain intact.

**Phase 2 — Plan.** Define the visual hierarchy, surface treatments, typography, spacing, color usage, and responsive behavior before implementing changes.

**Phase 3 — Implement.** Refine the existing interface in coherent, testable changes. Keep the design consistent across Gate, Rules, and Record.

**Phase 4 — Verify.** Run the available checks and inspect the rendered application at desktop and mobile sizes. Verify that existing functionality remains intact.

**Phase 5 — Refine.** Correct visual inconsistencies, weak hierarchy, awkward spacing, poor contrast, unnecessary decoration, and responsive problems.

### 11. Definition of done

The redesign is successful when:

- AnchorGate has a recognizable and consistent visual identity.
- Glassmorphism feels like a purposeful material choice rather than a template effect.
- The background adds atmosphere without competing with the product.
- Important spending and authorization information is easy to understand.
- Gate, Rules, and Record feel like parts of the same product.
- The interface works at desktop and mobile sizes.
- Existing functionality has not been silently removed or replaced.
- The implementation remains maintainable.
- The final result looks intentional even when decorative effects are disabled.

Do not declare the work complete merely because the page builds or the glass effect is visible.

**Final instruction:** Exercise design judgment. Do not interpret this brief as a checklist requiring a glass panel everywhere. Make fewer, better visual decisions. Preserve the product's identity, explain significant trade-offs, and prioritize a coherent interface over the number of effects used.
