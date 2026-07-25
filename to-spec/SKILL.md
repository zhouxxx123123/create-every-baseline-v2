---
name: to-spec
description: Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec (you may know this document as a PRD). Do NOT interview the user — just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you — run `/start-setup` if not.

## Process

Before writing, locate the persisted `READY_FOR_TO_SPEC` receipt from `product-readiness` through the originating work item, repository-declared workflow-evidence location, or `.scratch/product-readiness/`. Verify that its target and specification boundary match this request and that every recorded canonical-source, prototype, artifact, fixture, admitted-ID, and composition identity is still current. For a machine-verifiable receipt, run `node "<resolved-product-readiness-skill-dir>/scripts/readiness-receipt.mjs" verify <receipt.md>` and stop on any failure. A historical receipt without the machine identity block cannot be proven current by that script; return to Product Readiness for a fresh receipt instead of rewriting it. If the receipt is absent, stale, mismatched, or predates a material source change, stop and route back to Product Readiness. Do not reopen unchanged product decisions, and do not treat receipt text as a product requirement. `to-spec` does not grant itself readiness.

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, respect any ADRs in the area you're touching, and read the declared product baseline and any prototype manifests that feed this feature. Verify that each prototype used as evidence links to the exact canonical decision and that the decision links back to the manifest with the confirmed scope. Treat a missing or one-way link as unresolved traceability, not as permission to infer the relationship from filenames. For every material implementation-shaping decision, also verify its validation status, authority or evidence, remaining assumptions, and stop conditions.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage. Record the exact readiness receipt link in the specification. If the tracker supports a timeline note, append a separate `Consumed by <spec>` note without editing the immutable receipt.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A comprehensive list of user stories with stable IDs. Each user story should be in the format of:

`US-001` — As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
`US-001` — As a mobile bank customer, I want to see balances on my accounts, so that I can make better informed decisions about my spending.
</user-story-example>

This list should be comprehensive inside the locked specification boundary. Do not turn adjacent capabilities, prototype controls, external handoffs, or deliberately excluded behaviour into user stories.

## Specification Boundary

State the exact bounded workflow or subsystem this specification covers, its natural entry and terminal handoff when relevant, and the adjacent behaviour it explicitly excludes. Preserve the boundary admitted by Product Readiness; do not widen it while synthesising the specification.

## Readiness Receipt

Link the exact persisted `READY_FOR_TO_SPEC` receipt consumed by this specification. State its target, boundary, assessed-at time, and receipt ID. The receipt proves that readiness was checked against named source identities; it does not replace the canonical product decisions linked elsewhere in this specification.

## Acceptance Criteria And Traceability

Give every acceptance criterion a stable ID and map it to its product and design authority:

| AC ID | Observable behaviour | User stories | Canonical decision | Prototype evidence |
| --- | --- | --- | --- | --- |
| `AC-001` | <externally observable result> | `US-001` | <exact full prototype reference + artifact + fixture + confirmed IDs; for composition, composed identity + integration IDs and exact source identities + source IDs; or `None`> |

Acceptance criteria describe production behaviour, not prototype implementation. Prototype evidence identifies what was reviewed; it does not replace the canonical decision. Do not create an acceptance criterion from rejected, deferred, direct-state-only, not-reviewed, or explicitly excluded evidence. A historical or superseded version may remain evidence only for a specification that already pins it and records the product authority's explicit keep decision; it cannot supply new requirements elsewhere.

## Product Areas and Cross-Functional Linkages

List every product area that participates in the feature. For each linkage, state:

- producer and consumer;
- shared object, event, action, or handoff;
- source-of-truth owner;
- permission or failure boundary when relevant;
- expected result and writeback;
- canonical product decision or ADR that defines it.

Do not duplicate the full decision text. Link to its canonical location and describe only how this spec consumes it.

## Prototype Evidence

Link only the reviewed prototype evidence that informed this spec. For each manifest, record its prototype unit, canonical product decision, question tested, review status, exact current canonical full prototype reference, immutable artifact ref, fixed fixture ref, exact consumable journey/branch/state/interaction IDs for that version, validated conclusion, and other versions or behaviour explicitly excluded, deferred, direct-state-only, or not validated. For a composed workflow, also record the composed identity, its exact source manifest + full prototype reference + artifact + fixture set, every admitted source ID, and every integration ID. Follow the decision's backlink to the manifest rather than inferring relevance from filenames. A prototype is evidence, not implementation authority.

For a `WORKFLOW`, map each design-dependent user story, interaction requirement, acceptance criterion, and testing decision to the exact confirmed IDs it consumes. Reconcile every ID listed as consumable for the pinned full prototype reference: map it to an acceptance criterion or explicitly exclude it from this specification with a reason. For a composed workflow, reconcile both the composed integration IDs and every admitted source ID; local behaviour remains traced to its exact source identity while cross-workflow continuity is traced to the composed identity. Do not replace the natural-entry journey with screenshots or state URLs, combine behaviour from unlisted full prototype references, or convert prototype debug controls and fixtures into product requirements. If the manifest lacks the repository identity convention, stable full references, a current canonical version selected by the product authority, a complete natural journey, downstream-consumption declaration, or bidirectional traceability, stop and return to the originating product workflow.

Pin the specification to the exact selected full prototype reference, immutable artifact ref, and fixture ref. For a composed workflow, pin one exact composed identity plus its complete source manifest + full prototype reference + artifact + fixture set; this is the only allowed multi-version evidence set. A later composed or source prototype selection does not silently change a published specification; the product authority must explicitly keep the pinned set or update and supersede the affected specification. The same full prototype reference resolving to different content is invalid and requires a new version, not an in-place spec update. Record an explicit keep decision in the specification or its canonical decision source with the authority, retained identities, and affected specification. Keeping a historical version for one specification does not make it current in its manifest.

## Decision Authority and Stop Conditions

For every material decision consumed by this specification, record:

- canonical decision link;
- status: `CONFIRMED_AND_VALIDATED`, `CONFIRMED_NOT_VALIDATED`, or `ASSUMPTION`;
- confirmer, product authority, or supporting evidence;
- remaining assumptions and deliberately unvalidated scope;
- stop conditions that require implementation to pause and return to the product source.

Only `CONFIRMED_AND_VALIDATED` decisions may become production implementation requirements. A `CONFIRMED_NOT_VALIDATED` decision may define bounded validation work, but the specification must label that boundary explicitly. Never turn an `ASSUMPTION` into an acceptance criterion.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
