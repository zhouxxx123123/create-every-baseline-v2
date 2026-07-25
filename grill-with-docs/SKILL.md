---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
---

Run a `/grilling` session, using the `/domain-modeling` skill.

While grilling, identify every affected product area and each cross-functional handoff. Record each confirmed fact once in the repository-declared location:

- stable term or responsibility boundary -> the relevant `CONTEXT.md`;
- confirmed product behaviour, workflow, edge case, or cross-functional relationship -> the declared product baseline;
- unresolved decision or dependency -> the configured issue tracker or `/wayfinder` map;
- hard-to-reverse architectural trade-off -> an ADR.

For each cross-functional handoff, make explicit: who produces it, who consumes it, the shared object/event/action, the owning source of truth, and the expected result or writeback. Link to the canonical decision instead of copying it into several documents.

When a visual or state question needs a prototype, invoke `/prototype` with the originating decision and return to that exact decision after review. When the decision requires several already-selected workflows to operate as one bounded product experience, invoke the prototype's `COMPOSE_SELECTED` mode with their exact manifest, version, artifact, and fixture identities. A confirmed prototype is evidence for a decision, not the product source of truth by itself.

Prototype traceability must be bidirectional:

- the prototype manifest links to the exact canonical product decision it tests;
- after reviewed prototype evidence is admitted, that canonical decision links back to the manifest and names the exact current canonical full prototype reference + immutable artifact + fixture identity plus only the confirmed journey, branch, state, or interaction IDs it accepts;
- for a composed version, the backlink also names its exact source manifest + version set and the integration IDs admitted by the decision;
- rejected, deferred, or superseded prototypes remain labelled as such and must not be linked as confirmed evidence.

Do not treat the backlink as a second copy of the decision. Keep the product rule in the product baseline and keep the review details in the prototype manifest.

For a material decision that can change product behaviour, scope, permissions, data, integrations, privacy, security, or implementation, record enough authority for a model to act safely:

- status: `CONFIRMED_AND_VALIDATED`, `CONFIRMED_NOT_VALIDATED`, or `ASSUMPTION`;
- who confirmed it and what evidence or product authority supports it;
- remaining assumptions or deliberately unvalidated scope;
- stop conditions that require implementation to pause and return to the product decision.

`CONFIRMED_NOT_VALIDATED` may authorize a bounded prototype, research task, technical spike, or pilot, but not full production implementation. `ASSUMPTION` is not an implementation requirement. Do not add this ceremony to trivial wording or cosmetic decisions with no material downstream risk.
