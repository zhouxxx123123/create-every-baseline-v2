# Evidence Validation Track

Teach the learner to choose evidence by uncertainty type and return the result to the exact originating product question.

## EV-01: Classify the uncertainty

**Outcome:** The learner can distinguish external facts, observable design behavior, technical feasibility, and unresolved product choice.

**Concept:** Research finds reliable facts, prototypes reveal observable behavior, technical spikes test feasibility, and grilling resolves product choices. Evidence cannot decide user-owned preferences.

**Skill practice:** Routing exercise only; later checkpoints perform the actual `research`, `prototype`, `technical-spike`, and `product-readiness` workflows.

**Learner action:** Read `requests/evidence-scenarios.md`. Create `learner-artifacts/evidence-routing.md` with uncertainty, selected route, why the other three routes are wrong, expected evidence, and return target.

**Evidence:** `learner-artifacts/evidence-routing.md`

**Hint ladder:** Ask what observation would settle the question. Offer the four uncertainty types. Demonstrate one unrelated scenario.

**Feedback focus:** Catch broad research used for product choice, prototypes used for backend feasibility, and spikes that define user behavior.

**Advance when:** Every scenario has one proportionate route, inspectable evidence, and an exact origin.

**Next:** `EV-02`

## EV-02: Write a bounded research contract

**Outcome:** The learner can request research that returns decision-relevant primary-source evidence instead of a generic survey.

**Concept:** A research contract states one question, source authority, comparison dimensions, exclusions, output artifact, and the decision it informs.

**Skill practice:** Invoke `research` for a bounded, read-only primary-source check and preserve the originating workflow.

**Learner action:** Use `requests/research-question.md`. Invoke `research` to produce a small source-backed result, then create `learner-artifacts/evidence-research-brief.md` containing originating workflow, current confirmed facts, one research question, primary-source requirements, comparison table, evidence limitations, output path, result link, and resume target.

**Evidence:** `learner-artifacts/evidence-research-brief.md`

**Hint ladder:** Ask what the user must decide after reading. Provide the contract headings. Show how a marketing blog differs from a primary source.

**Feedback focus:** Reject multiple unrelated questions, sources with no authority, and language that lets research auto-confirm the product answer.

**Advance when:** The brief can guide reproducible research and clearly states what evidence cannot answer.

**Next:** `EV-03`

## EV-03: Define prototype and spike contracts

**Outcome:** The learner can write separate contracts for observable product validation and technical feasibility.

**Concept:** A prototype validates a bounded experience against named states or interactions. A technical spike runs the smallest experiment that can return feasible, infeasible, or inconclusive.

**Skill practice:** Invoke `prototype` for a disposable local artifact and `technical-spike` for a minimal safe experiment; neither may decide the product answer.

**Learner action:** Read `requests/prototype-question.md` and `requests/technical-uncertainty.md`. Invoke both bounded workflows in the lab, then create `learner-artifacts/evidence-validation-contracts.md` linking the prototype and spike evidence. Give each an origin, exact question, admitted evidence, stop condition, exclusions, result, and return target.

**Evidence:** `learner-artifacts/evidence-validation-contracts.md`

**Hint ladder:** Ask whether a user must see it or a machine must prove it. Provide parallel contract headings. Demonstrate how the same feature can contain two separate uncertainties.

**Feedback focus:** Catch production implementation inside a spike, full-feature prototypes, missing fixture identity, and evidence that silently expands product scope.

**Advance when:** The two contracts are non-overlapping, minimal, and return distinct evidence to explicit owners.

**Next:** `EV-04`

## EV-04: Apply the readiness gate

**Outcome:** The learner can return `READY_FOR_TO_SPEC` or `NOT_READY` for one bounded target without demanding implementation readiness.

**Concept:** Product readiness checks current canonical decisions, deferred coverage, material evidence, contradictions, and a persistable receipt. It does not require deployment or implementation contracts.

**Skill practice:** Invoke `product-readiness` against one bounded target and stop at its verdict.

**Learner action:** Review the fixture baseline and the artifacts from this track. Invoke `product-readiness`, then create `learner-artifacts/evidence-readiness-assessment.md` with target, specification boundary, canonical sources, current blocker, deferred coverage, one next skill when blocked, verdict, receipt status, and reason.

**Evidence:** `learner-artifacts/evidence-readiness-assessment.md`

**Hint ladder:** Ask whether one unresolved item can still change the product contract. Provide the readiness output shape. Demonstrate rejecting an unrelated implementation blocker.

**Feedback focus:** Catch global completeness claims, stale evidence, skipped deferred routing, and `READY_FOR_TO_SPEC` without a receipt path.

**Advance when:** The verdict is supported by current sources and names exactly one next action when not ready.

**Next:** Run the evidence-validation assessment or continue to `delivery`.
