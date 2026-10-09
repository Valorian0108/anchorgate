# Architecture --- AI Spending Authorization

**Purpose:** Source of truth for implementing the AI spending-control
hackathon project.

**Status:** Core product behavior and initial experiments are
documented. UI design and screen-level decisions are intentionally out
of scope for this version and must be discussed with the project owner
before implementation.

------------------------------------------------------------------------

## 1. Project summary

Build an application that lets a person give an AI agent limited
authority to make purchases through PayPal, while an independent
authorization layer checks each proposed purchase against the person's
rules.

> **The AI may propose an action, but it must not decide or expand its
> own authority.**

The product is not merely an AI shopping assistant or a PayPal checkout
wrapper. Its defining behavior is the independent authorization check
between a purchase request and payment execution.

Core outcomes:

-   **ALLOW** --- the request satisfies the configured rules and may
    proceed to payment execution.
-   **ASK** --- the request needs explicit human approval. It must
    remain pending until the user approves or rejects that specific
    request.
-   **DENY** --- the request violates a hard constraint and must not
    proceed to payment execution.

These outcomes must come from deterministic application logic, not from
asking the AI whether its own request should be allowed.

## 2. Decisions already established

Preserve these decisions. Do not silently replace them with a different
architecture or product behavior.

1.  PayPal is the payment provider for the current MVP.
2.  Use PayPal Sandbox for development and the hackathon demo. Do not
    use real funds or live PayPal credentials for the MVP unless the
    project owner explicitly changes this decision.
3.  An independent authorization layer checks proposed purchases before
    payment execution.
4.  The AI agent does not control the authorization rules and cannot
    override an authorization result.
5.  The initial outcomes are `ALLOW`, `ASK`, and `DENY`.
6.  Human approval applies to one purchase request. It must not
    permanently increase the agent's authority or silently change the
    spending rules.
7.  The monthly spending cap is a hard limit. Human approval must not
    bypass it. If a request would exceed the cap, deny it unless the
    owner explicitly changes this policy.
8.  The system must track spending against the monthly cap. An in-memory
    counter alone is insufficient because it disappears on restart.
9.  Users must be able to define spending rules, including a maximum per
    transaction, monthly cap, permitted categories, and conditions
    requiring approval.
10. The project must become a real application, not remain a collection
    of PowerShell experiments.
11. **The UI has not been designed or approved.** This document
    intentionally does not prescribe a visual style, screen layout,
    navigation model, component library, or final list of screens. Do
    not invent and treat those decisions as approved. Ask the owner
    before committing to UI design and screen-level behavior.
12. Unsettled decisions must remain visible as open questions. Do not
    fill gaps with generic defaults where the choice affects product
    behavior, architecture, security, user experience, or scope. Present
    options and trade-offs and wait for the owner's decision.

## 3. What has been tested

These experiments were performed manually in PowerShell. They establish
evidence about individual pieces, not proof that the complete
application exists or works.

### 3.1 PayPal Sandbox authentication

The owner created a PayPal Developer account, Sandbox Business and
Personal/Buyer accounts, and a Sandbox application with a Client ID and
Secret. An OAuth access token was successfully obtained from:

`https://api-m.sandbox.paypal.com/v1/oauth2/token`

Credentials and the token were kept in PowerShell environment/session
variables. Secrets must never be committed, printed in logs, or exposed
in browser code.

### 3.2 PayPal order creation and capture

A Sandbox order for USD 5.00 was created through PayPal Orders API v2.
The buyer approved it through Sandbox checkout, and the order was
captured through the API.

Test order ID: `4Y043559P86727748`

Final status returned by the capture flow: `COMPLETED`.

This proves that a manually initiated Sandbox order-creation,
buyer-approval, and capture sequence worked. It does **not** prove the
future application's integration, AI agent, or authorization enforcement
works. Order creation alone does not mean a payment has been approved or
captured.

### 3.3 PowerShell authorization prototype

Example rules used:

-   Maximum per purchase: USD 10
-   Monthly spending cap: USD 50
-   Spent this month: USD 0 at the beginning

Observed results:

  ------------------------------------------------------------------------
                   Test amount Result                Reason
  ---------------------------- --------------------- ---------------------
                         USD 5 `ALLOW`               Within the example
                                                     per-purchase limit
                                                     and monthly budget

                        USD 15 `ASK`                 Exceeds the example
                                                     per-purchase limit

                        USD 60 `DENY`                Would exceed the
                                                     example monthly cap
  ------------------------------------------------------------------------

A local `Record-Spending` function was also tested to increase the
in-memory total after an allowed USD 5 purchase.

Prototype limitations: it exists only in the current PowerShell session;
state is not durable; it is not connected to a real UI or PayPal flow;
it does not implement a complete human-approval lifecycle; it is not
production-ready. Reimplement its intended behavior in the application's
chosen language and test it there rather than blindly copying PowerShell
code.

## 4. Intended system flow

1.  The user configures spending rules.
2.  The AI agent proposes a purchase with structured information
    sufficient to evaluate it.
3.  The application validates the request and sends it to the
    authorization engine.
4.  The authorization engine evaluates the request against current rules
    and spending state.
5.  It returns `ALLOW`, `ASK`, or `DENY`, with a reason that can be
    recorded and explained.
6.  `DENY` must prevent payment execution.
7.  `ASK` remains pending until the user approves or rejects that exact
    request.
8.  If `ALLOW`, or if an `ASK` request is validly approved, the
    application may proceed through the approved PayPal payment flow,
    subject to a final hard-constraint check.
9.  Record authorization decisions separately from actual payment
    outcomes.
10. Update completed spending only from a verified payment outcome, not
    merely because a request was proposed, authorized, approved, or
    submitted.

Conceptual architecture:

`User and rules → AI agent proposes purchase → Independent authorization engine → ALLOW / ASK / DENY → PayPal Sandbox flow only if authorized → durable records`

This is a logical architecture, not a requirement to create separate
microservices. Prefer a clear, testable implementation that fits the
existing codebase and MVP scope. Avoid unnecessary infrastructure.

## 5. Authorization rules and invariants

Authorization is the core security boundary. Keep it independent of AI
prompts and UI presentation.

### 5.1 Rule inputs

The initial rule model must support maximum amount per purchase, monthly
cap, spending already counted toward the current monthly budget,
permitted categories, and conditions that require human approval.

The exact data model and category taxonomy are not finalized. Inspect
the codebase, propose a small practical model, and ask the owner before
making consequential changes to rule semantics.

### 5.2 Decision order

The PowerShell experiment used this order:

1.  Deny invalid amounts (less than or equal to zero).
2.  Deny a purchase that would exceed the monthly cap.
3.  Return `ASK` if the amount exceeds the per-purchase automatic limit.
4.  Otherwise return `ALLOW`.

This reflects the agreed policy that the monthly cap is hard, while the
per-purchase threshold can require approval. The final implementation
must also check category restrictions and other configured conditions.
Precedence for every combination (such as a disallowed category combined
with a high amount) has not been finalized. Propose and confirm complete
precedence with the owner before finalizing it.

### 5.3 Required invariants

-   The AI model cannot set, edit, or override authorization decisions.
-   Authorization occurs before payment execution.
-   `DENY` makes payment execution unreachable for that request.
-   `ASK` cannot execute payment before valid approval.
-   Approval applies to one immutable request, not future requests or a
    general permission increase.
-   Recheck the approved request and hard constraints immediately before
    execution. Approval cannot bypass the monthly cap.
-   Bind amount, currency, merchant/payee, purpose, category, and other
    material details to the approved request. Material changes
    invalidate approval.
-   Invalid, missing, malformed, or ambiguous inputs fail safely. Never
    silently treat missing rules as permission.
-   Do not count a request as completed spending because it was
    proposed, allowed, approved, or submitted.
-   Keep payment status and authorization status separate.
-   Duplicate requests, retries, repeated approvals, and duplicate
    capture attempts must not create duplicate spending records or
    unintended repeated charges. Use PayPal's supported idempotency
    mechanism where applicable and verify provider responses.
-   Prevent concurrent requests from overspending the monthly cap
    through race conditions. Design budget reservation/locking and
    release behavior before enabling concurrent payment execution.
-   Do not trust the agent's claim that a payment succeeded; verify
    through the provider response or a status lookup.
-   Never expose PayPal secrets or access tokens in browser code,
    client-visible responses, committed files, or logs.

### 5.4 Spending accounting

Durable spending records are required; an in-memory counter is not
enough. Distinguish at least proposed requests, authorized requests,
pending approvals, payment submissions, successful captures,
failed/cancelled/rejected requests, and any reserved budget for
in-progress payments.

Refunds, reversals, time zones, monthly reset boundaries, and
reservation expiry remain undecided. Do not invent silent accounting
rules for these cases; raise them with the owner when they become
necessary.

## 6. PayPal integration requirements

### 6.1 Tested provider flow

The manual experiment used PayPal Orders API v2:

-   OAuth token: `https://api-m.sandbox.paypal.com/v1/oauth2/token`
-   Create order:
    `POST https://api-m.sandbox.paypal.com/v2/checkout/orders`
-   Capture order:
    `POST https://api-m.sandbox.paypal.com/v2/checkout/orders/{id}/capture`

The test used `intent = "CAPTURE"` and a USD 5.00 purchase unit. The
buyer approved the order in Sandbox checkout before capture.

Use official PayPal documentation to verify current endpoint
requirements, approval links, return/cancel behavior, response status
semantics, and idempotency support. Do not assume one manual test covers
every checkout path or failure mode.

### 6.2 Credentials and environments

-   Use Sandbox API URLs for development and the hackathon MVP.
-   Keep credentials in environment variables or an appropriate secret
    store.
-   If useful for the chosen stack, provide an `.env.example` with
    placeholders only; ensure real `.env` files are ignored by version
    control.
-   Never ask the owner to paste secrets into chat, source files,
    screenshots, or logs.
-   Keep PayPal calls server-side. Never expose the Client Secret or
    access token to browser code.
-   Make Sandbox/live environment selection explicit. Never switch to
    live credentials automatically.

### 6.3 Separation of responsibilities

The authorization engine and PayPal integration have separate
responsibilities. PayPal integration must not independently decide
whether a purchase is permitted. The authorization engine must not claim
a payment completed merely because it returned `ALLOW`.

A permitted request must still follow PayPal's actual order and
buyer-approval requirements. Do not bypass buyer approval or describe
Sandbox activity as real-money payment.

### 6.4 Integration choice remains open

The owner manually verified the Orders API flow, but the final choice
between direct Orders API, PayPal Agent Toolkit, PayPal MCP, or another
official integration path has not been finalized.

Do not switch to MCP, Agent Toolkit, AP2, or another payment
architecture simply because it appears newer or more agent-oriented.
Inspect requirements and the codebase, then present a concise comparison
of viable approaches, costs, and MVP implications. Ask the owner before
committing to a materially different integration.

AP2 is not currently a confirmed requirement. Do not claim AP2 support
or full protocol compliance unless it is explicitly chosen, implemented,
and tested.

## 7. AI agent boundaries

The AI agent proposes a purchase and supplies information needed for
evaluation. It is not the authority system.

The agent must not: - Approve its own purchase when human approval is
required. - Edit user limits or categories to make a purchase pass. -
Bypass the authorization engine by calling the payment provider
directly. - Mark a payment completed without verified provider
confirmation. - Reuse approval for a materially changed purchase. -
Treat a tool error, missing response, or ambiguous state as
authorization.

Use a validated structured purchase request rather than relying only on
free-form text. The agent framework, model/provider, prompting strategy,
and tool protocol remain undecided. Do not add an elaborate autonomous
shopping workflow, broad tool access, or more payment providers without
owner approval. Keep the first agent scope narrow enough to demonstrate
the authorization concept clearly.

## 8. Human approval lifecycle

1.  Evaluate a request.
2.  If approval is required, persist it as pending and do not execute
    payment.
3.  Present request details and the reason for approval through the UI
    once the UI has been designed.
4.  The user approves or rejects that exact request.
5.  On approval, revalidate the immutable request and all hard
    constraints, including the monthly cap.
6.  Only if it remains valid may payment execution begin.
7.  Record the human decision and payment outcome separately.

UI details, approval expiration, whether a pending request can be
edited, and what happens when rules change while a request is pending
are not settled. Ask the owner before choosing these behaviors.

## 9. Data and auditability

The application needs durable records sufficient to explain each
purchase request. At minimum, consider recording:

-   Request ID and timestamps
-   Agent identity or configured agent identifier
-   Requested purchase details, amount, and currency
-   Rules/version used for the authorization decision
-   Decision (`ALLOW`, `ASK`, or `DENY`) and its
    machine-readable/human-readable reason
-   Human approval/rejection and timestamp, when applicable
-   PayPal order/capture identifiers and verified provider statuses
-   Spending-accounting events and relevant failure information

Avoid unnecessary sensitive data. Never store credentials or payment
secrets in audit records.

The final schema, retention policy, user authentication, database, and
deployment environment are undecided. Inspect the existing project and
propose options rather than automatically adding a database, auth
provider, or hosting platform.

## 10. Error handling and failure behavior

Account for failures between the agent, authorization engine,
persistence layer, and PayPal, including invalid request details,
missing rules, storage failures, expired/invalid tokens, order creation
failure, buyer cancellation, capture failure or ambiguous timeout,
duplicate calls, rule/budget changes while pending, and concurrent use
of the remaining budget.

Fail safely. If authorization cannot be verified or required spending
state cannot be read or updated reliably, do not proceed with payment
execution.

After a capture timeout, do not blindly retry in a way that could
duplicate payment. Check order/capture state and use the provider's
supported idempotency mechanism where applicable. UI error messages will
be designed later; do not invent UI design as part of this phase.

## 11. Testing and acceptance criteria

The coding agent must create and run tests in the actual application
codebase. PowerShell tests are evidence of intended behavior, not
substitutes for automated application tests.

### 11.1 Authorization tests

Test at least: - A valid amount within the per-purchase limit and
remaining budget returns `ALLOW`. - A valid amount above the
per-purchase threshold but within the monthly cap returns `ASK`,
assuming no other rule blocks it. - An amount that would exceed the
monthly cap returns `DENY`, even if it would otherwise return `ASK`. -
Zero and negative amounts are denied. - Disallowed categories cannot be
paid. - Missing, malformed, and unsupported values fail safely. - Human
approval applies only to the matching request. - Approval cannot
override a hard monthly cap. - Material changes to an approved request
invalidate approval. - Denied or pending requests cannot reach payment
execution.

### 11.2 Spending-accounting tests

Test that: - A proposed, allowed, or approved request is not counted as
completed spending prematurely. - Verified successful capture updates
spending exactly once. - Failed/cancelled payment is not counted as
completed spending. - Duplicate callbacks/retries do not create
duplicate records. - Monthly cap calculations behave correctly at period
boundaries. - Concurrent requests cannot overspend through a race
condition. - State survives application restarts.

### 11.3 PayPal tests

Use Sandbox only. Test credential loading without secret exposure, order
creation for an authorized request, no payment execution for denied
requests, no capture before required buyer approval and any required
app-level approval, capture verification and status persistence,
failure/timeout handling without duplicate payment, and correct
distinction between order creation, buyer approval, capture completion,
and failure.

Use mocked provider responses for deterministic unit tests where
appropriate, plus Sandbox integration tests for actual provider
behavior. Mocks alone are not sufficient to claim the PayPal integration
works.

### 11.4 End-to-end acceptance

A meaningful demo should show: 1. A user configures spending rules. 2.
The agent proposes a purchase. 3. The independent authorization engine
evaluates it. 4. A permitted purchase follows PayPal Sandbox flow and
its result is verified. 5. A purchase requiring human approval waits and
cannot pay beforehand. 6. A purchase violating a hard rule is blocked
from payment execution. 7. Records reflect decisions and actual payment
outcomes accurately. 8. The user can understand why each decision
occurred.

Do not claim a criterion passed unless a test or observed result
supports the claim.

## 12. Implementation process

The coding agent must work in phases and report evidence. Inspect the
existing codebase before modifying files or selecting technologies.

### Phase 0 --- Inspect and report

-   Inspect repository, frontend/backend, package files, environment
    configuration, tests, and current behavior.
-   Identify framework, language, build commands, and existing design
    conventions.
-   Summarize what exists and what is missing.
-   Identify risky configuration without printing secret values.
-   List unresolved architectural and product decisions.
-   Do not replace the stack, scaffold a competing app, or overwrite
    working code without explaining why and obtaining approval for
    material changes.

### Phase 1 --- Confirm decisions and plan

Propose a short implementation plan based on the actual repository.
Identify choices affecting architecture, security, scope, UI, or user
experience and ask the owner before implementing them. Do not burden the
owner with every minor coding detail; use sound judgment for reversible
implementation details and document important assumptions.

### Phase 2 --- Implement authorization core

Implement deterministic rule evaluation and structured purchase request
types in the actual stack. Keep authorization independent from AI
prompts, UI components, and PayPal transport code. Add unit tests before
integrating payment execution.

### Phase 3 --- Add durable state and approval handling

Implement persistent rules, purchase requests, approval decisions, and
spending events using the approved storage approach. Ensure approvals
are request-specific and hard constraints are revalidated before
execution. Ask before making unsettled decisions about database,
identity, monthly accounting edge cases, or approval lifecycle.

### Phase 4 --- Integrate PayPal Sandbox

Use the approved integration approach. Keep credentials server-side,
enforce authorization before payment execution, handle buyer approval,
verify capture outcomes, and prevent duplicate processing. Do not use
live credentials. Report Sandbox behavior that differs from assumptions
and ask before changing architecture to work around it.

### Phase 5 --- Integrate the AI agent

Connect the agent so it can propose structured purchases through the
application's controlled interface. It must not bypass authorization or
invoke payment execution directly. Keep initial capabilities narrow.

### Phase 6 --- UI design and implementation (requires owner discussion)

**Do not jump straight into implementation or treat a generated UI as approved.**
The owner wants to discuss the UI before it is designed. This phase must
begin with product understanding and collaborative design exploration,
not a generic dashboard template.

#### UI design philosophy

Trust Layer's interface should emerge from the product's purpose and the
user's needs. Do not assume that familiar fintech patterns are automatically
the right answer just because the product involves spending or PayPal.

Before choosing layouts, components, visual styling, navigation, or screen
structure:

1. Revisit the product's central idea: an AI can propose a purchase, but an
   independent authorization layer controls what may proceed. The user needs
   to understand the agent's authority, the rules limiting it, and why a
   request is allowed, needs approval, or is denied.
2. Identify what the interface needs to communicate and help the user do.
   Design decisions should serve those needs rather than exist only to make
   the product look polished or technically impressive.
3. Explore meaningfully different design directions before committing to
   one. Explain the idea behind each direction, what it communicates, its
   strengths and trade-offs, and how it fits this product. Do not present
   several superficial variations of the same generic dashboard as distinct
   concepts.
4. Discuss the directions and important user-experience decisions with the
   owner. The coding agent may recommend an option, but its recommendation
   is not approval. Wait for the owner's decision before committing to
   material visual, navigation, or interaction choices.
5. Once a direction is chosen, translate it into a coherent design system
   and user journey. Keep visual styling, information hierarchy, screen
   structure, and interaction behavior consistent with the agreed concept.
6. Expect refinement. The first pass does not have to be perfect; make the
   design understandable and testable, explain meaningful trade-offs, and
   leave room for the owner to correct or refine it with the coding agent.

#### Anti-generic requirements

- Do not default to a conventional fintech dashboard, stock admin template,
  familiar component arrangement, or fashionable visual style without first
  explaining why it serves Trust Layer.
- Do not treat vague instructions such as "make it modern," "premium," or
  "creative" as a complete design brief. Translate them into specific,
  product-relevant design decisions and discuss those decisions with the owner.
- Do not add screens, metrics, controls, illustrations, animations, or other
  elements merely because similar products commonly have them. Each should
  serve an established requirement or be clearly presented as a proposal.
- Give important design choices a reason tied to the product, user task,
  clarity, trust, or usability. Avoid novelty for novelty's sake as well as
  generic convention for convenience's sake.
- Keep a clear distinction between **established requirements**, **agent
  recommendations**, and **decisions awaiting the owner's approval**.
- If a material product or user-flow question must be answered to design
  responsibly, ask the owner at that point rather than silently inventing
  an answer. Group related questions and explain why they matter.

The UI remains unapproved until the owner has discussed the design direction
and the relevant product and interaction decisions. Before that discussion,
the coding agent may inspect existing UI code and describe what is present,
but must not finalize a visual style, navigation, screen structure, or build
an assumed replacement UI. After approval, update this specification and
implement the agreed direction without replacing it with a generic template.

### Phase 7 --- Verify integrated system

Run relevant automated tests and a Sandbox end-to-end flow. Report
commands actually run, tests passed/failed, known limitations,
acceptance criteria not verified, and whether results were tested
against Sandbox or only mocked. Do not report success based only on code
generation or a successful build.

## 13. Rules for unresolved decisions

These instructions are binding:

1.  Do not present a preferred option as though the owner approved it.
2.  Do not silently fill product or architectural gaps with generic
    conventions.
3.  Explain decisions needed, provide practical options and trade-offs,
    and ask the owner.
4.  Do not block on trivial, reversible coding details; make a
    conservative choice and document it.
5.  Do not make material changes to authorization, payment integration,
    UI, framework, storage, authentication, deployment, or scope without
    approval.
6.  Do not delete or replace existing work before understanding it and
    explaining consequences.
7.  If an implementation conflicts with a security invariant here,
    explain the conflict before proceeding.
8.  Keep a concise record of decisions, assumptions, open questions, and
    deviations from the approved plan.
9.  Never claim the owner approved a decision merely because a coding
    agent or ChatGPT proposed it.
10. If the codebase forces an undecided choice, pause at that decision
    point and consult the owner rather than inventing an architecture.

## 14. Open decisions for the owner

These are intentionally not finalized.

### Product and UI

-   Visual direction, colors, typography, density, navigation, page
    structure, and component style.
-   The core design concept and how the UI should communicate Trust Layer's
    distinctive idea rather than defaulting to a generic fintech dashboard.
-   First-time user journey and which screens are essential for the MVP.
-   Whether initial agent behavior is a narrowly scripted demo or a more
    open-ended purchase-proposal flow.
-   Final product name/branding if different from the current working
    name.

### Authorization and accounting

-   Exact category taxonomy and whether category violations always mean
    `DENY`.
-   Precedence among category rules, per-purchase thresholds, and
    approval conditions.
-   Approval expiration and behavior of pending approvals when rules or
    budgets change.
-   Monthly period timezone and reset semantics.
-   Treatment of refunds, reversals, failed captures, reservations, and
    abandoned orders.
-   Concurrency and budget-reservation policy for simultaneous requests.

### Architecture and operations

-   Existing repository stack and how implementation should fit it;
    inspect before deciding.
-   Direct Orders API versus Agent Toolkit, MCP, or another supported
    PayPal integration.
-   AI model/provider and agent framework.
-   Database/persistence technology.
-   User authentication and identity model.
-   Deployment target, logging/monitoring, and data retention.

Group related questions and ask at useful decision points instead of
overwhelming the owner with every open question at once.

## 15. Security and project integrity

-   Treat authorization as a security boundary, not a UI feature.
-   Keep PayPal credentials and tokens server-side; never commit
    secrets.
-   Validate data from the AI, browser, and external services.
-   Enforce authorization server-side even if the UI also hides or
    disables actions.
-   Keep audit records free of credentials and unnecessary sensitive
    data.
-   Do not trust the AI agent, client-side state, or unverified payment
    status as authoritative.
-   Do not add real-money execution to the MVP.
-   Do not claim production readiness, AP2 compliance, or complete
    end-to-end automation without evidence.
-   Preserve existing project work and make changes incrementally.

## 16. Definition of done

The MVP is ready for its intended demo only when: - The owner-approved
UI has been implemented. - The user can configure the agreed spending
rules. - The agent can propose a structured purchase. - The independent
authorization engine enforces the rules. - `ALLOW`, `ASK`, and `DENY`
behave as agreed. - Human approval is transaction-specific and cannot
bypass hard constraints. - PayPal Sandbox execution occurs only after
required authorization and buyer approval. - Payment outcomes are
verified and recorded separately from authorization decisions. -
Spending accounting is durable and does not count the same successful
payment twice. - Automated tests and a meaningful Sandbox end-to-end
test have been run. - The owner is told honestly what is implemented,
what is tested, and what remains incomplete.

**Final instruction:** Build the product described here, not a generic
approximation. Preserve settled decisions. Ask the owner about material
unresolved decisions. Do not confuse a proposal with an approved
requirement, generated code with tested code, or an authorization
decision with a completed payment.
