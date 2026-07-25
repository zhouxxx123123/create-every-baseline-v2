---
name: prototype-parity-check
description: Verify that an implemented user-facing surface faithfully matches its approved prototype or design source before the work is declared complete. Use after functional implementation and behavior tests are green for UI, interaction, navigation, or visible-state changes. Compare live evidence against the approved source, report concrete gaps, and distinguish implementation defects from missing design decisions. Do not use for initial design exploration, API-only work, or redesigning the product.
---

# Prototype Parity Check

Check a real implemented surface against the approved prototype or design source after functional implementation and before the work is declared complete.

This skill complements the product workflow:

- `prototype` answers a design question before implementation with throwaway code.
- `code-review` reviews the code diff against repository standards and the originating specification.
- `prototype-parity-check` inspects the running user-facing result against the approved design evidence.

Do not redesign the product during this check. Do not replace behavior tests or code review.

## Decide whether the check applies

Use this check when the completed work changes a user-visible surface, including layout, interaction, navigation, copy, visible state, feedback, or responsive/adaptive behavior.

Skip it when:

- the change has no user-visible surface;
- the work is still in design exploration;
- no implementation exists yet;
- the request is to create or revise the design rather than verify implementation;
- ordinary automated checks already prove the entire approved user-visible contract and no visual or interaction judgement remains.

If the work requires an approved design source but none can be identified, report `BLOCKED` instead of inventing expected behavior.

## Identify the sources

Find the repository's declared source-of-truth rules first. Then identify:

- the implemented surface and how to open it;
- the approved prototype manifest and the exact reviewed states, routes, or interaction scope linked by the originating product decision;
- the exact full prototype reference + immutable artifact + fixture identity pinned by the specification or ticket and the complete journey/branch/state/interaction ID set derived from the assigned acceptance criteria's mappings in the specification; do not trust a ticket's smaller self-declared set;
- for a composed workflow, the exact composed identity, complete source manifest + full prototype reference + artifact + fixture set, admitted source IDs, integration IDs, and final integration-acceptance ticket;
- the originating specification, ticket, or acceptance criteria;
- the scoped viewports, input methods, platforms, themes, locales, and states when relevant;
- any approved deviations from the design source;
- the environment, account, permissions, and data needed to reproduce the surface.

Do not assume standard filenames, design tools, platforms, or test frameworks. Verify that the prototype manifest links to the canonical product decision and that the decision links back with the confirmed scope. Reproduce the approved source from its pinned artifact and fixture refs; a mutable route, screenshot, branch name, filename, or display label alone is not an approved source. If the artifact is unavailable, its content hash differs, the fixture cannot be reproduced, or links are missing, one-way, or conflicting, report `BLOCKED` and stop the affected comparison.

## Capture live evidence

Prefer the running implementation over prose or implementation claims.

Use the tools appropriate to the current project and surface, for example:

- browser automation and screenshots for web surfaces;
- accessibility or semantic trees when labels, roles, focus, or navigation matter;
- local application control and screenshots for desktop or native surfaces;
- existing visual-regression tools when the repository already defines them;
- recorded interaction or state-transition evidence when a still image is insufficient.

Capture only the states and environments required by the approved scope. Do not treat unreviewed, rejected, deferred, or explicitly not-validated prototype areas as requirements. A historical or superseded version remains valid only when its exact full prototype reference and artifact/fixture identity are pinned by the specification and an authoritative source records the product authority's explicit keep decision. Do not create a large device or browser matrix without evidence that the project requires it.

For an approved `WORKFLOW`, execute every required ID derived from the assigned acceptance criteria, including the journey from its natural entry through its terminal outcome and return path or handoff. For a composed workflow, execute the real product shell continuously across every integration ID and admitted source workflow after the final integration-acceptance ticket completes; separate page checks cannot substitute for this run. Reproduce deterministic branches through the implementation's test environment, service stub, or controlled test data; do not require or expose the prototype's debug controls in production. A direct state URL can support inspection but cannot replace the natural journey. Report parity per required ID so a passing screenshot cannot hide a broken entry or transition.

If live evidence cannot be captured, report the missing condition instead of passing from code inspection alone.

## Compare the approved contract

Check relevant dimensions only:

- **Purpose and identity**: the implemented surface is the intended feature, not an old, placeholder, debug, or unrelated surface.
- **Entry and exit**: entry point, navigation, back behavior, dismissal, and return path match the approved flow.
- **Information hierarchy**: sections, grouping, order, primary action, secondary actions, and progressive disclosure match the approved design.
- **Interaction and state transitions**: user actions cause the approved visible changes and feedback.
- **Visual structure**: layout relationships, density, spacing rhythm, typography roles, color roles, icons, and adaptive behavior preserve the approved design intent.
- **Content and domain language**: labels, instructions, errors, and status text use the approved terminology.
- **State coverage**: required loading, empty, success, error, unavailable, permission, disabled, stale, refreshing, or other specified states are present.
- **Cross-feature effects**: approved changes to related entry points, counts, badges, status, reminders, history, or other visible surfaces occur at the specified time.
- **Accessibility and input**: approved keyboard, pointer, touch, focus, semantic, contrast, or assistive behavior is preserved when in scope.
- **Leak checks**: debug controls, raw identifiers, mock labels, internal state, diagnostics, or unrelated legacy content are not exposed.
- **Version integrity**: the implementation matches the exact full prototype reference pinned by its specification or ticket. Behaviour from any other candidate, previously selected, superseded, deferred, or exploration-only reference is not combined into it. An explicitly retained historical pin is valid only for the specification that records that keep decision.
- **Artifact integrity**: the compared prototype content comes from the exact immutable artifact and fixture refs recorded for the pinned version; a current development route is not substituted for the reviewed artifact.
- **Composition integrity**: when a composed version is pinned, local interactions match their exact source versions and cross-workflow entry, navigation, shared state, handoffs, writebacks, and terminal result match the composed integration IDs. No unlisted source version supplies behaviour.

Do not demand pixel-perfect equality unless the repository has an approved visual-regression policy and stable baselines. Judge the approved product contract, not arbitrary personal taste.

Passing prototype parity proves only that the implemented visible behaviour matches the exact approved design evidence. It does not prove that the broader business rule, market assumption, data source, or technical mechanism is correct.

## Classify every difference

Use one classification for each finding:

- **Implementation gap**: the running result differs from a clear approved requirement.
- **Design-source gap**: the approved source does not define the encountered state or behavior.
- **Approved deviation**: the difference is explicitly accepted and recorded in an authoritative source.
- **Environment gap**: required implementation, account, data, device, service, or evidence is unavailable.

Do not silently convert an implementation gap into a design decision. Do not update the prototype merely to make an incorrect implementation appear compliant.

## Verdict

Choose one verdict:

- `PASS`: the scoped running result matches the approved source.
- `PASS_WITH_APPROVED_DEVIATIONS`: differences exist, but each one is explicitly approved and traceable.
- `FAIL`: one or more implementation gaps remain.
- `BLOCKED`: the required source, implementation, environment, or evidence is unavailable or conflicting.

Do not declare the user-facing work complete on `FAIL` or `BLOCKED`.

When a gap requires code changes, return it to the implementation workflow. After fixes, rerun the relevant behavior tests and this parity check. If the changes occur after code review, rerun the repository's required review checks.

When the approved product behavior itself must change, return to the appropriate product or specification source before changing implementation.

## Output

Use plain language and keep findings evidence-based:

```text
Prototype parity verdict: PASS | PASS_WITH_APPROVED_DEVIATIONS | FAIL | BLOCKED

Approved sources:
Implemented surface:
Scope checked:
Evidence captured:

Findings:
1. Classification:
   Expected:
   Actual:
   Evidence:
   Required next step:

Not checked:
Reason:
```

If the verdict is `PASS`, say what was actually checked; do not imply untested platforms, states, or environments also passed.
