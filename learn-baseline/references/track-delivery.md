# Delivery Track

Teach the learner to preserve confirmed product authority while moving through operational data design when applicable, specification, ticketing, implementation, testing, review, and visible parity.

## DL-01: Verify the specification boundary

**Outcome:** The learner can decide whether `to-spec` is authorized and define what one specification may include.

**Concept:** A current readiness receipt authorizes one matching bounded target. `to-spec` synthesizes confirmed context; it does not interview or invent missing behavior.

**Skill practice:** Invoke `to-spec` in local-output mode for the admitted fictional target. `to-prd` is only a compatibility name.

**Learner action:** Read `requests/delivery-context.md`. Invoke `to-spec` without publishing externally, then create `learner-artifacts/delivery-spec-boundary.md` linking the produced specification and recording target, receipt identity, admitted canonical sources, in-scope behavior, explicit boundaries, prototype evidence, and reasons to stop.

**Evidence:** `learner-artifacts/delivery-spec-boundary.md`

**Hint ladder:** Ask what exact target the receipt covers. Provide boundary headings. Demonstrate why a whole roadmap cannot ride on one feature receipt.

**Feedback focus:** Catch stale or mismatched receipts, copied unrelated context, and unresolved decisions hidden as defaults.

**Advance when:** The boundary is traceable to current authority and contains no unsupported product choice.

**Next:** `DL-01A`

## DL-01A: Validate an operational data contract

**Outcome:** The learner can decide whether persisted business state requires the operational data-design stage and distinguish its logical and physical gates.

**Concept:** Product Readiness admits product behavior. `data-design` derives a database-neutral logical contract before specification and, when database implementation tickets are needed, a verified physical adapter and migration contract. It does not invent product policy or use analytics models as an operational source of truth.

**Skill practice:** Invoke `data-design` for the admitted Task rename scenario. Produce a logical package and explain what additional evidence would be required for `READY_FOR_TICKETS`.

**Learner action:** Create `learner-artifacts/delivery-operational-data-contract.md` with the admitted receipt identity, Task object identity, rename command, invariant, transaction and permission boundary, consistency and idempotency behavior, failure and unknown-result behavior, stable contract IDs, logical validator result, and the explicit physical-gate boundary.

**Evidence:** `learner-artifacts/delivery-operational-data-contract.md`

**Hint ladder:** Ask whether the feature persists authoritative business state. Provide the logical contract categories. Demonstrate why a table name, prototype JSON, dbt model, or RLS policy cannot define the product contract.

**Feedback focus:** Catch invented product behavior, missing execution-time authorization, unbounded retries, fake versions, physical choices inside the logical model, and a claimed receipt without verifier evidence.

**Advance when:** The package traces every material contract to admitted authority, passes the logical gate, and states what remains before physical database tickets.

**Next:** `DL-02`

## DL-02: Design a tracer-bullet ticket plan

**Outcome:** The learner can split a specification into vertical, independently testable tickets with causal blockers.

**Concept:** Each ticket delivers a thin behavior across necessary layers, owns explicit acceptance criteria, and declares only real blocking dependencies.

**Skill practice:** Invoke `to-tickets` against the local specification. `to-issues` is only a compatibility name.

**Learner action:** Invoke `to-tickets` in local-output mode and create `learner-artifacts/delivery-ticket-plan.md`. Include ticket title, user-visible slice, owned requirements, acceptance criteria, evidence references, blocker edges, and expected executable frontier.

**Evidence:** `learner-artifacts/delivery-ticket-plan.md`

**Hint ladder:** Ask what a user can observe after each ticket. Offer a ticket table. Show why "database first" is a layer task rather than a tracer bullet.

**Feedback focus:** Catch horizontal component tickets, duplicate requirement ownership, fake ordering edges, and missing readback or validation.

**Advance when:** Every requirement has one owner, each ticket is vertically demonstrable, and the first frontier is causally unblocked.

**Next:** `DL-03`

## DL-03: Write an implementation contract

**Outcome:** The learner can begin one ticket without reopening product decisions.

**Concept:** The contract names behavior, domain vocabulary, source of truth, writeback, handoffs, permission boundary, failure boundary, seams, and acceptance commands.

**Skill practice:** Invoke `prd-implementation-precheck` on the first ticket and stop if its authority is incomplete.

**Learner action:** Choose the first ticket, invoke `prd-implementation-precheck`, and create `learner-artifacts/delivery-implementation-contract.md` with the precheck result, implementation contract, and stop conditions that route missing authority back to its owner.

**Evidence:** `learner-artifacts/delivery-implementation-contract.md`

**Hint ladder:** Ask where the result is written and who consumes it. Provide the contract fields. Demonstrate one handoff on an unrelated API.

**Feedback focus:** Catch invented defaults, missing failure behavior, implementation scope broader than the ticket, and a seam selected only for test convenience.

**Advance when:** Another engineer can implement the slice without making a product decision.

**Next:** `DL-04`

## DL-04: Choose seams and review a change

**Outcome:** The learner can connect TDD evidence with standards and specification review.

**Concept:** TDD proves behavior at an agreed public seam. Code review then checks both repository standards and the originating specification; green tests do not prove both.

**Skill practice:** Invoke `implement` for the bounded rename ticket, use `tdd` to capture a real red-green cycle, then invoke `code-review` against the resulting local diff.

**Learner action:** Work only in the lab. Inspect `src/task-store.mjs`, add the regression test first, run it red, apply the smallest fix through `implement`, run it green, and invoke `code-review`. Create `learner-artifacts/delivery-test-review.md` with the seam, commands and outputs, diff identity, standards findings, specification findings, severity, and remaining test gap.

**Evidence:** `learner-artifacts/delivery-test-review.md`

**Hint ladder:** Ask what a caller can observe. Provide the two review axes. Demonstrate why a private method is a weak seam.

**Feedback focus:** Catch tests coupled to implementation, review summaries before findings, and claims that passing tests prove specification completeness.

**Advance when:** The evidence distinguishes behavioral testing, code standards, spec conformance, and residual risk.

**Next:** `DL-05`

## DL-05: Close visible work against prototype evidence

**Outcome:** The learner can decide when prototype parity is required and what it can prove.

**Concept:** Functional tests can pass while visible state, interaction, or navigation diverges. Parity compares live evidence with the exact approved prototype scope; it does not redesign either side.

**Skill practice:** Invoke `prototype-parity-check` on the supplied simulated approved/live evidence pair; do not treat the simulation as production validation.

**Learner action:** Use `requests/parity-scenario.md`, invoke `prototype-parity-check`, and create `learner-artifacts/delivery-parity-closeout.md` with approved source identity, admitted states, observed evidence, concrete gaps, owner for each gap, and closeout conditions.

**Evidence:** `learner-artifacts/delivery-parity-closeout.md`

**Hint ladder:** Ask what users can see that tests may miss. Provide the parity evidence table. Demonstrate separating an implementation defect from a missing design decision.

**Feedback focus:** Catch vague visual approval, outdated prototype versions, unlinked evidence, and parity used for API-only changes.

**Advance when:** The closeout can distinguish pass, implementation defect, and unresolved design authority.

**Next:** Run the delivery assessment or begin a delivery capstone.
