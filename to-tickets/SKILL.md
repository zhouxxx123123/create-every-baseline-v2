---
name: to-tickets
description: Translate an approved conversation, plan, or specification into validated tracer-bullet tickets with explicit dependencies, requirement and evidence ownership, tracker publication, readback, and frontier handling.
---

# To Tickets

Translate an approved plan, specification, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it — and publish them to the configured tracker.

The issue tracker and triage label vocabulary should have been provided to you — run `/start-setup` if not.

If `docs/agents/project-board.md` exists, publish only to the canonical tracker, then run its configured board sync command after successful tracker readback. GitHub Project and local HTML are projections, not additional ticket stores. Report a projection failure without rolling back or duplicating the canonical tickets.

## Responsibility boundary

Only translate approved source material into executable vertical tickets and publish those tickets. Do not perform Product Readiness, make new product decisions, modify the source specification, design prototypes, invent architecture, run implementation prechecks, implement production code, review code, or perform release acceptance.

If a material product or technical decision required for slicing is absent, stop, identify the exact gap, and return to the repository-configured Workflow Authority. Do not hide the missing decision inside a ticket.

If the approved specification persists operational business state, require a verified `READY_FOR_TICKETS` receipt from `data-design` before publishing database implementation or migration tickets. Verify it with `data-design/scripts/verify_data_design_receipt.py`. A `READY_FOR_SPEC` receipt authorizes specification only; it does not authorize physical database tickets. Stop and return to the data-design stage when the adapter, migration, physical evidence, or receipt is missing or stale.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

Follow the source specification's links to the canonical product decisions, ADRs, cross-functional handoffs, and prototype manifests that define the work. Read the exact reviewed prototype states and each material decision's validation status, remaining assumptions, and stop conditions. Do not infer relationships from filenames or conversation memory.

When an operational data-design receipt applies, follow its stable object, relationship, invariant, command, transaction, permission, consistency, idempotency, recovery, adapter, migration, and contract-test IDs. Give every affected ID an owning ticket or an explicit dependency. Tickets may refine reversible implementation detail but may not alter these contracts without returning to `data-design` and, for product behavior, the originating product authority.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- Each slice preserves the relevant cross-functional handoff end to end: producer, consumer, shared object/event/action, source-of-truth owner, result/writeback, timing, and relevant permission or failure boundary
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

Inherit product-area, canonical-decision, and prototype-manifest links from the source spec. A ticket may narrow those links to the slice it delivers, but must not silently drop a participating product area or treat a prototype as the source of truth.

For a user-visible slice, inherit the exact full prototype reference, immutable artifact, fixture, and confirmed journey/branch/state/interaction IDs pinned by the specification. For a composed workflow, inherit the exact composed identity, its integration IDs, and its complete source manifest + full prototype reference + artifact + fixture + source-ID set. State which IDs the ticket delivers and which IDs it consumes as dependencies. An ID may remain outside one slice only when another named ticket owns it. A ticket must not mix unlisted full prototype references, depend only on a direct-state URL when it owns a natural-entry transition, expose prototype debug controls or fixtures as product behaviour, or add an interaction absent from both the canonical decision and reviewed evidence.

Each implementation ticket must be self-contained about the behaviour of its slice while linking to, rather than copying, the canonical decisions. It must identify the material decision status, relevant evidence, remaining assumptions, stop conditions, exact reviewed prototype states, and deliberately unvalidated or out-of-scope behaviour.

Each ticket must list the exact source user-story and acceptance-criterion IDs it delivers when the specification provides them. Do not use a broad section link as a substitute for requirement-level traceability. Before publishing, produce both coverage tables:

- **Requirement coverage:** every in-scope acceptance criterion has exactly one primary owner ticket; other tickets may cite it only as supporting or integration coverage.
- **Prototype delivery coverage:** every in-scope prototype journey/branch/state/interaction ID mapped by the specification has exactly one delivery-owner ticket. Derive this set from the specification's AC-to-prototype mapping, not from what tickets happen to claim. For a composed workflow, include both integration IDs and admitted source IDs.

AC ownership and prototype-ID delivery ownership are separate. The primary owner of an acceptance criterion must list every mapped prototype ID, but for each ID it either owns delivery or names the delivery-owner ticket it depends on. One prototype ID may support several acceptance criteria, but it still has only one delivery owner; other AC owners cite it as a dependency or supporting coverage. If the dependency graph cannot yield a coherent observable acceptance result, split or revise the acceptance criterion in the specification before publishing tickets. No ticket may invent a new production acceptance criterion without returning it to the specification or canonical product decision.

For a composed workflow, implementation tickets extend one real production shell rather than create isolated production pages. The earliest vertical tracer establishes the natural entry and one working path through that shell. Later tickets connect their owned source and integration IDs into the same shell. Add one final integration-acceptance ticket blocked by all in-scope delivery tickets; it owns no already-assigned source ID, but delivers the automated or repeatable full-journey verification and any integration corrections required to make the exact composed workflow run continuously from natural entry to terminal handoff. The composed scope is not complete until this ticket and prototype parity both pass.

If the product authority selected a newer prototype version after the specification was published, do not update tickets automatically. Stop until the authority explicitly keeps the specification's pinned full prototype reference + artifact + fixture identity or updates and supersedes the affected specification and tickets. A keep decision is valid only when the retained identity, affected specification, and product authority are recorded in an authoritative source.

Do not publish a production implementation ticket as `ready-for-agent` when a material requirement is `CONFIRMED_NOT_VALIDATED` or `ASSUMPTION`, when required traceability is missing or one-way, or when linked sources conflict. A bounded validation ticket may use `CONFIRMED_NOT_VALIDATED` only when its purpose and non-production boundary are explicit.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

#### Build the approved ticket-plan graph

Read [`references/ticket-plan-schema.md`](references/ticket-plan-schema.md) before finalizing the candidate plan. Materialize the approved plan as tracker-independent JSON and preserve exact source anchors.

- Use stable requirement, story, and acceptance-criterion IDs from the source. Preserve a non-empty exact source anchor for every story. When no stable requirement ID exists, allocate deterministic plan-local requirement IDs such as `R-001`; never edit the source merely to add them.
- Give every in-scope requirement exactly one primary owner. Assign it only to a ticket whose direct and indirect blockers provide every capability, evidence owner, client or page, durable state, source of truth, and external validated dependency needed to observe the complete result. A requirement that crosses subflows may remain with an ordinary vertical ticket when that closure is complete; only `requires_final_integration=true` forces ownership by the final integration ticket. Never assign ownership mechanically by adjacent IDs or section proximity.
- Compute exact source stories as the union of story IDs mapped by the ticket's primary requirements. Keep reliability, privacy, audit, and integration-only supporting stories separate.
- Record each shared capability with one implementation owner, all consumers, its source of truth, writeback, and availability point. Put the owner in every consumer's blocker closure unless the capability is external and carries precise validation evidence.
- Keep requirement ownership separate from evidence delivery ownership. Give every evidence ID exactly one delivery owner; mark each mapped ID on a requirement owner as `OWNED HERE`, `DEPENDENCY: <ticket>`, or downstream integration evidence.
- Make evidence optional when no reviewed evidence exists. When it exists, bind every owned or consumed production evidence ID to its exact manifest, complete reference, immutable artifact and digest, and fixture and digest. Group IDs that share one immutable identity; use separate self-contained groups when a ticket carries multiple identities. Never substitute `same as another ticket`, `see parent spec`, `pinned elsewhere`, or similar indirect wording.
- For a composed workflow, include the composed identity and integration IDs plus every source manifest, complete reference, artifact and digest, fixture and digest, source-ID set, and delivery owner.
- Keep the blocker graph acyclic and complete. Prefer the earliest user-closed vertical tracer as the owner of shared foundations. Do not create parallel implementations of a shared API, schema, service, shell, persistence path, audit writer, provider adapter, or reusable command.
- Search the configured tracker for overlapping open tickets. Classify each as `REUSE`, `EXTERNAL DEPENDENCY`, `SUPERSEDE`, `PARTIAL HANDOFF`, `CONFLICT`, or `HISTORICAL ONLY`. Record the tracker reference, affected plan tickets, planned action, and resolution status. Put any modification, closure, label removal, supersession, or handoff comment in the candidate publish plan and obtain authorization before changing it; the validator checks record completeness, not user authorization.
- Keep one final integration ticket for a composed or multi-slice workflow. Derive in-scope delivery tickets from actual requirement, internal capability, production-evidence, user-visible, bounded-validation, and composition responsibility as well as declarations; `delivery_ticket=false` cannot hide real delivery work. Block the final ticket directly by every derived delivery ticket. Let it own only whole-system requirements, necessary integration corrections, and composition or integration evidence, not source evidence already assigned elsewhere. Do not defer foundational behavior intentionally to the final ticket. A valid single-delivery plan needs no final ticket, and a declared expand-contract wide refactor retains its established sequence.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work
- **Primary requirements** and their exact source anchors
- **Exact source stories** and separate supporting stories
- **Capabilities owned and consumed**
- **Evidence IDs owned and consumed as dependencies**, when evidence exists
- **Out of scope**

Also show the dependency graph, requirement-owner table, evidence delivery-owner table when applicable, capability producer/consumer table, existing-ticket reconciliation, validator result, and current frontier.

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

When the user explicitly asks to stop after ticket drafting, complete the quiz and validation, report the approved plan and frontier, and stop without creating tracker items or files.

### 5. Validate the approved ticket plan

Run the deterministic validator before publishing:

Resolve the directory containing the currently invoked `to-tickets/SKILL.md`, then invoke the validator by its resolved path without changing the project working directory:

```text
python "<resolved-to-tickets-skill-dir>/scripts/validate_ticket_plan.py" <plan.json> --format both
```

Require PASS. The validator checks requirement coverage and owner closure, exact stories, dependency cycles, shared capability availability, evidence ownership and identity, composition completeness, final-integration blocking, existing conflicts, and deterministic frontier calculation. Treat the script as a quality floor; also inspect semantic fidelity to the canonical source.

If validation fails, revise the ticket plan and show the changed ownership or dependency edges. Return to the source Workflow Authority only when the source itself cannot support a coherent plan.

### 6. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker `/start-setup` configured — the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below — one ticket per file, never a single combined file. Keep readiness pending until readback validation passes.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Create tickets without the configured ready label, or use the repository's configured staging state, until readback validation passes.

After receiving real tracker identifiers, fill in Parent, Blocked by, and authorized existing-ticket reconciliation actions. Do not assume a successful create call produced correct final ticket bodies.

Do NOT close or modify any parent issue.

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None — can start immediately".

**Status:** pending post-publish validation

**Source specification:** the exact spec section that defines this slice.

**Primary requirements:** exact requirement or acceptance-criterion IDs delivered by this slice.

**Exact source stories:** the mechanically derived story union for the primary requirements.

**Supporting stories:** reliability, privacy, audit, or integration support that is not an exact source story.

**Canonical product decisions:** links to the decisions this slice consumes.

**Decision authority:** status, confirmer or evidence, remaining assumptions, and stop conditions for each material decision.

**Product areas:** the participating product functions for this slice.

**Cross-functional handoff:** `<producer> -> <consumer> via <object/event/action>; source of truth: <owner>; result/writeback: <destination>; timing: <when>; boundary: <permission/failure condition>`.

**Shared capabilities:** capabilities `OWNED HERE`, consumed from `DEPENDENCY: <owner ticket>`, or consumed as external validated capabilities with evidence.

**Prototype evidence:** manifest link, exact full prototype reference + immutable artifact + fixture pinned by the specification, and the reviewed journey/branch/state/interaction IDs this slice must match, or "None". For a composition, include the exact composed identity, integration IDs, and source manifest + full prototype reference + artifact + fixture + source IDs. The spec and canonical product decisions remain authoritative.

**Prototype-ID delivery:** list every required prototype ID mapped to this ticket's acceptance criteria. Mark each as `OWNED HERE` or `DEPENDENCY: <delivery-owner ticket>`. Each ID has exactly one delivery owner across the ticket set.

**Not validated or out of scope:** prototype areas, assumptions, and behaviour this ticket must not infer or implement.

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Sources and decision authority

- Source specification: exact section defining this slice.
- Primary requirements: exact requirement or acceptance-criterion IDs delivered by this slice.
- Exact source stories: mechanically derived from the primary requirements.
- Supporting stories: separate reliability, privacy, audit, or integration support.
- Canonical product decisions: links to the decisions consumed by this slice.
- Decision status and authority: validation status, confirmer or evidence, remaining assumptions, and stop conditions.

## Product areas and cross-functional handoff

- Product areas: the participating product functions for this slice.
- Handoff: `<producer> -> <consumer> via <object/event/action>`.
- Source of truth: owner of the durable state.
- Result/writeback: where the durable outcome is recorded and when it becomes visible.
- Boundary: relevant permission and failure conditions.

## Shared capabilities

- Owned here: capabilities implemented by this ticket.
- Consumed: capability owner ticket in blocker closure, or exact external validation evidence.

## Prototype evidence

Manifest link, exact full prototype reference + immutable artifact + fixture pinned by the specification, and the reviewed journey/branch/state/interaction IDs this slice must match, or "None". For a composition, include the exact composed identity, integration IDs, and source manifest + full prototype reference + artifact + fixture + source IDs. The spec and canonical product decisions remain authoritative.

List every required prototype ID mapped to this ticket's acceptance criteria. Mark each as `OWNED HERE` or `DEPENDENCY: <delivery-owner ticket>`. Each ID has exactly one delivery owner across the ticket set.

## Not validated or out of scope

Prototype areas, assumptions, and behaviour this ticket must not infer or implement.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".

</issue-template>

In either form, avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

### 7. Read back and validate published tickets

Read every final ticket body and current label from the configured tracker. Reconstruct the structured plan from tracker truth, run the validator again, and compare it with the user-approved plan.

Check Parent, Blocked by, requirement owners, exact versus supporting stories, capability owners and consumers, immutable evidence identity and ownership, composition sources, digests, placeholders, variable expansion, indirect evidence wording, links, existing-ticket handoffs, and labels. Report P1/P2/P3 findings with exact ticket and source references. Do not repair findings without authorization.

When the user asks to audit already-published tickets, skip drafting and publishing, operate read-only, perform these graph and tracker checks, and output requirement, dependency-closure, shared-capability, evidence, existing-ticket, and tracker/label verdicts plus `READY` or `NOT_READY`.

When the user accepts findings and asks for repair, change only the accepted findings. Pause the configured ready state on affected tickets, repair them, read them back, rerun validation, and restore readiness only after every accepted finding passes. Do not change product decisions or the parent specification.

### 8. Apply readiness labels and work the frontier

Read the repository's triage configuration before applying readiness. If the ready label means only the current frontier, apply it only where all blockers are complete. If it means structurally executable while waiting on blockers, apply it to every post-publish-valid ticket. Never hardcode label semantics.

If readback validation fails, do not add readiness; remove it from affected tickets if it was added prematurely, report findings, and wait for repair authorization.

Compute the **frontier** deterministically from completed blockers and resolved existing-ticket conflicts. Work one frontier ticket at a time with the repository-configured implementation workflow, clearing context between tickets. When that workflow is configured as `/implement`, invoke `/implement` per ticket as before.
