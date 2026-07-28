# Foundation Track

Teach the learner to route by outcome, establish authority, preserve a return path, and recognize standalone tools. Use the practice lab, not a production repository.

## FND-01: Route requests by outcome

**Outcome:** The learner can choose a canonical skill from the result the user needs, not from a keyword in the request.

**Concept:** A skill is a workflow contract. Route to the stage that owns the unresolved outcome. `skill-router` helps when the route is unclear; it does not perform every downstream workflow.

**Learner action:** Read the scenario cards in `requests/routing-scenarios.md`. Create `learner-artifacts/foundation-routing.md` with columns for desired outcome, canonical skill or flow, why one adjacent route is wrong, and the stop condition.

**Evidence:** `learner-artifacts/foundation-routing.md`

**Hint ladder:** First ask what must be true at the end. Then offer the course-map track table. Only after an attempt, route one different example together.

**Feedback focus:** Catch keyword routing, skipped readiness gates, and confusion between a standalone skill and a transition.

**Advance when:** Every scenario has one defensible route, an excluded adjacent route, and an observable stop condition.

**Next:** `FND-02`

## FND-02: Establish repository authority

**Outcome:** The learner can explain where Git, tracker, domain, and board authority live before starting a workflow.

**Concept:** Setup records authority; it does not make the board or generated view canonical. Repository instructions and configured tracker semantics constrain every later skill.

**Learner action:** Inspect the unconfigured lab. Use `start-setup` in a dry, discussion-first way: propose safe local choices, list the exact files it would create, and stop before writing. Record the proposal and authority relationships in `learner-artifacts/foundation-setup-review.md`.

**Evidence:** `learner-artifacts/foundation-setup-review.md`

**Hint ladder:** Ask which artifact owns each state. Provide the four authority headings. Demonstrate why a Project Board is a projection using a separate example.

**Feedback focus:** The learner must keep Git destination, Issue Tracker, Project Board, and domain documentation as distinct choices.

**Advance when:** The review identifies canonical sources, generated projections, proposed files, and a safe confirmation boundary.

**Next:** `FND-03`

## FND-03: Preserve a cross-session return path

**Outcome:** The learner can create a handoff that lets a fresh session resume one exact unresolved question.

**Concept:** A handoff transfers context; it does not authorize the next workflow. A bounded detour must retain originating workflow, unresolved question, evidence needed, and return target.

**Learner action:** Use the unresolved problem in `requests/feature-request.md`. Write `learner-artifacts/foundation-handoff.md` containing the originating workflow, exact question, authoritative artifacts, requested detour, completion condition, and resume target.

**Evidence:** `learner-artifacts/foundation-handoff.md`

**Hint ladder:** Ask "where must the result return?" Provide the required headings. Show an adjacent bad handoff that says only "continue the project."

**Feedback focus:** Reject vague return targets, copied source content, and handoffs that silently authorize specification or implementation.

**Advance when:** A reader can identify one next action and the exact condition that returns control to the origin.

**Next:** `FND-04`

## FND-04: Use standalone tools without confusing the main flow

**Outcome:** The learner can place `agent-reach`, `teach`, `caveman`, and `zoom-out` without treating them as mandatory workflow stages.

**Concept:** Standalone tools change reach, pedagogy, expression, or perspective. They do not automatically change product or implementation authority.

**Learner action:** Create `learner-artifacts/foundation-standalone-tools.md`. For each standalone tool, give one appropriate use, one misuse, and whether it changes course or project state. Include the difference between `grill-me`, `grill-with-docs`, and `grilling`.

**Evidence:** `learner-artifacts/foundation-standalone-tools.md`

**Hint ladder:** Offer the categories reach, learning, expression, and abstraction. Point to the alias table only after the learner classifies the canonical tools.

**Feedback focus:** Catch claims that concise wording, broader context, or internet access settles a product decision.

**Advance when:** The learner distinguishes standalone behavior, compositions, and compatibility aliases from canonical workflow transitions.

**Next:** Run the foundation assessment, then recommend one elective track.
