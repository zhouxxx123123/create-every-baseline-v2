# Foundation Track

Teach the learner to route by outcome, establish authority, preserve a return path, and recognize standalone tools. Use the practice lab, not a production repository.

## FND-01: Route requests by outcome

**Outcome:** The learner can choose a canonical skill from the result the user needs, not from a keyword in the request.

**Concept:** A skill is a workflow contract. Route to the stage that owns the unresolved outcome. `skill-router` helps when the route is unclear; it does not perform every downstream workflow.

**Skill practice:** Invoke `skill-router` in reference mode against the supplied scenarios and inspect its route rather than accepting it blindly.

**Learner action:** Read the scenario cards in `requests/routing-scenarios.md`, invoke `skill-router`, and create `learner-artifacts/foundation-routing.md` with columns for desired outcome, canonical skill or flow, why one adjacent route is wrong, and the stop condition.

**Evidence:** `learner-artifacts/foundation-routing.md`

**Hint ladder:** First ask what must be true at the end. Then offer the course-map track table. Only after an attempt, route one different example together.

**Feedback focus:** Catch keyword routing, skipped readiness gates, and confusion between a standalone skill and a transition.

**Advance when:** Every scenario has one defensible route, an excluded adjacent route, and an observable stop condition.

**Next:** `FND-02`

## FND-02: Establish repository authority

**Outcome:** The learner can explain where Git, tracker, domain, and board authority live before starting a workflow.

**Concept:** Setup records authority; it does not make the board or generated view canonical. Repository instructions and configured tracker semantics constrain every later skill.

**Skill practice:** Invoke `start-setup` discussion-first, then apply the confirmed Local Markdown configuration only inside the practice lab.

**Learner action:** Inspect the unconfigured lab. First invoke `start-setup` in discussion-first mode and review the exact local changes. After the learner explicitly confirms, configure only the lab with a Local Markdown tracker, local domain authority, no remote board, and no external destination. Record the proposal, confirmation, actual files, validation output, and authority relationships in `learner-artifacts/foundation-setup-review.md`.

**Evidence:** `learner-artifacts/foundation-setup-review.md`

**Hint ladder:** Ask which artifact owns each state. Provide the four authority headings. Demonstrate why a Project Board is a projection using a separate example.

**Feedback focus:** The learner must keep Git destination, Issue Tracker, Project Board, and domain documentation as distinct choices.

**Advance when:** The lab contains a valid local setup, and the review identifies canonical sources, generated projections, actual files, and the confirmation boundary that authorized them.

**Next:** `FND-03`

## FND-03: Preserve a cross-session return path

**Outcome:** The learner can create a handoff that lets a fresh session resume one exact unresolved question.

**Concept:** A handoff transfers context; it does not authorize the next workflow. A bounded detour must retain originating workflow, unresolved question, evidence needed, and return target.

**Skill practice:** Invoke `handoff` for the fictional request and inspect whether a fresh session would have one exact next action.

**Learner action:** Use the unresolved problem in `requests/feature-request.md`. Invoke `handoff`, then refine `learner-artifacts/foundation-handoff.md` so it contains the originating workflow, exact question, authoritative artifacts, requested detour, completion condition, and resume target.

**Evidence:** `learner-artifacts/foundation-handoff.md`

**Hint ladder:** Ask "where must the result return?" Provide the required headings. Show an adjacent bad handoff that says only "continue the project."

**Feedback focus:** Reject vague return targets, copied source content, and handoffs that silently authorize specification or implementation.

**Advance when:** A reader can identify one next action and the exact condition that returns control to the origin.

**Next:** `FND-04`

## FND-04: Use standalone tools without confusing the main flow

**Outcome:** The learner can place `agent-reach`, `teach`, `caveman`, and `zoom-out` without treating them as mandatory workflow stages.

**Concept:** Standalone tools change reach, pedagogy, expression, or perspective. They do not automatically change product or implementation authority.

**Skill practice:** Reference-only recognition of `agent-reach`, `teach`, `caveman`, and `zoom-out`; this checkpoint does not claim operational competence in them.

**Learner action:** Create `learner-artifacts/foundation-standalone-tools.md`. For each standalone tool, give one appropriate use, one misuse, and whether it changes course or project state. Include the difference between `grill-me`, `grill-with-docs`, and `grilling`.

**Evidence:** `learner-artifacts/foundation-standalone-tools.md`

**Hint ladder:** Offer the categories reach, learning, expression, and abstraction. Point to the alias table only after the learner classifies the canonical tools.

**Feedback focus:** Catch claims that concise wording, broader context, or internet access settles a product decision.

**Advance when:** The learner distinguishes standalone behavior, compositions, and compatibility aliases from canonical workflow transitions.

**Next:** Run the foundation assessment, then recommend one elective track.
