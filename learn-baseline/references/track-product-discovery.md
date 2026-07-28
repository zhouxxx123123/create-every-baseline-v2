# Product Discovery Track

Teach the learner to separate domain language from product choices, resolve one question at a time, and use Wayfinder only when the decision space exceeds one session.

## PD-01: Separate terms, facts, and decisions

**Outcome:** The learner can build a small domain model without turning assumptions into confirmed product behavior.

**Concept:** Terms define stable meaning, facts come from authority or evidence, decisions belong to the user, and unresolved questions remain routed work.

**Skill practice:** Invoke `domain-modeling` against the lab's canonical context and preserve its authority boundaries.

**Learner action:** Read `CONTEXT.md`, `docs/product/product-baseline.md`, and `requests/feature-request.md`. Invoke `domain-modeling`, then create `learner-artifacts/product-domain-model.md` with four sections: stable terms, confirmed facts, assumptions, and decisions still required. Add one object relationship diagram.

**Evidence:** `learner-artifacts/product-domain-model.md`

**Hint ladder:** Ask which source has decision authority. Provide the four headings. Demonstrate classifying one unrelated sentence.

**Feedback focus:** Catch overloaded terms, inferred behavior, and relationships represented only by UI location.

**Advance when:** Every material statement has one category and the relationship diagram uses stable object names.

**Next:** `PD-02`

## PD-02: Resolve one product question

**Outcome:** The learner can use a grilling loop to obtain one explicit product decision without bundling adjacent questions.

**Concept:** Explain the scenario and tradeoff, recommend one direction, ask one question, wait, and record only the answer actually confirmed.

**Skill practice:** Invoke `grilling` for one simulated decision turn. Treat `grill-me` and `grill-with-docs` as composition variants, not additional mastered skills.

**Learner action:** Choose the most foundational unresolved question from `product-domain-model.md`. Invoke `grilling` for one question and simulated answer, then write `learner-artifacts/product-decision.md` with scenario, options, recommendation, the single question, exact confirmed boundary, exclusions classified by meaning, and remaining owner.

**Evidence:** `learner-artifacts/product-decision.md`

**Hint ladder:** Ask which answer changes first-version behavior. Offer a one-question template. Demonstrate splitting a compound question on another feature.

**Feedback focus:** Reject inferred confirmation, compound questions, and prototype or implementation details promoted to product questions.

**Advance when:** The answer resolves one product behavior and every exclusion is either scope protection or routed work.

**Next:** `PD-03`

## PD-03: Create a decision map and frontier

**Outcome:** The learner can distinguish a Wayfinder decision map from a task plan.

**Concept:** Wayfinder charts unresolved decisions and dependencies. The map is an index; each canonical ticket owns its answer. One active frontier identifies the current decision.

**Skill practice:** Invoke `wayfinder` in the lab and keep its map separate from canonical decision answers.

**Learner action:** Treat the full feature request as too large for one session. Invoke `wayfinder`, then create `learner-artifacts/product-wayfinder-map.md` with destination, decision tickets, blocker edges, canonical owner for each answer, one active frontier, and a stop condition that hands off to readiness rather than implementation.

**Evidence:** `learner-artifacts/product-wayfinder-map.md`

**Hint ladder:** Ask what remains unknown before a specification can exist. Provide a map skeleton. Show why "build backend" is not a decision ticket.

**Feedback focus:** Catch implementation tasks, duplicated answers in the map, fake blockers used only for ordering, and multiple active frontiers.

**Advance when:** The map contains decisions rather than deliverables, every edge has a causal reason, and exactly one frontier is active.

**Next:** `PD-04`

## PD-04: Harden a bounded target

**Outcome:** The learner can decide whether a large target needs pre-readiness hardening without redoing resolved decisions.

**Concept:** `pre-prd-hardening` freezes context, splits uncertainties, and routes missing evidence before the final bounded readiness gate.

**Skill practice:** Invoke `pre-prd-hardening` on one bounded target rather than the whole fictional product.

**Learner action:** Select one bounded target from the map. Invoke `pre-prd-hardening`, then create `learner-artifacts/product-hardening-review.md` covering canonical sources, stable decisions, unresolved product questions, evidence detours, cross-functional handoffs, exclusions, and the exact target to send to `product-readiness`.

**Evidence:** `learner-artifacts/product-hardening-review.md`

**Hint ladder:** Ask whether the target fits one specification. Provide the hardening dimensions. Work through one cross-functional handoff on an adjacent example.

**Feedback focus:** Catch whole-product expansion, reopened answers, missing source-of-truth owners, and technical details treated as product blockers.

**Advance when:** The review produces one bounded readiness target and routes every material uncertainty to one owner.

**Next:** Run the product-discovery assessment or continue to `evidence-validation`.
