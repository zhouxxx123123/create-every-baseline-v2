# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/product/README.md`** inside the relevant context, when present — follow its product-baseline read order.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.
- **Prototype manifests and indexes**, when the task depends on a reviewed UI or state model. A prototype is evidence for a decision, not the source of truth.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Prototype identity convention

`start-setup` records the effective repository convention here. Preserve a coherent existing convention. When none exists, use this default:

- **Prototype ID:** one repository-unique `PT-<kebab-case-bounded-target>` identifier. If the slug is already taken by a different prototype, append the next available numeric suffix. Once allocated, the Prototype ID never changes when display wording changes.
- **Version ID:** `V001`, `V002`, and so on, ordered and unique within one Prototype ID.
- **Full prototype reference:** `<Prototype ID>@<Version ID>`, for example `PT-account-recovery@V003`. Downstream artifacts use the full reference, never a bare version number or display name.
- **Display name:** required concise human-facing text that describes the visible direction. Opaque labels such as `A`, `AJ`, `BF`, or `L1J` are invalid. It is not identity and may repeat when the descriptions are genuinely equivalent.
- **Legacy aliases:** optional historical codes retained only for audit and migration. They never become current identity, route, selection, or downstream references.

Historical reviewed references are never renumbered. If the repository has letter-coded display labels or multiple legacy conventions, replace the current display metadata with a semantic name, retain each old code under `Legacy aliases`, and use the configured default for new prototypes. The `prototype` skill owns allocation, reservation, immutability, composition, and selection behaviour; this file only declares the repository's identifier format and scope.

## Preserve cross-functional linkages

When a feature crosses product areas, record the handoff explicitly: producer, consumer, shared object/event/action, source-of-truth owner, and expected result or writeback.

- Stable terms and responsibility boundaries belong in the relevant `CONTEXT.md`.
- Confirmed product behaviour and cross-functional relationships belong in the declared product baseline or focused spec.
- Unresolved decisions and dependencies belong in the configured issue tracker or `/wayfinder` map.
- Hard-to-reverse architectural trade-offs belong in ADRs.
- Reviewed prototype states belong in a prototype manifest. The manifest links to the exact canonical decision, and the consuming decision links back to the manifest with the confirmed state or interaction scope.

Keep one canonical decision and link to it. Do not copy the same rule into the glossary, prototype notes, spec, and ticket as competing sources of truth.

## Workflow Authority

Workflow rules belong to the skill that defines the workflow. Repository docs and issues must not copy, rewrite, or renegotiate skill-defined workflow rules as project decisions.

When resolving wayfinder tickets, product-readiness questions, specs, tickets, or implementation blockers, first classify the blocker as either a product decision or a workflow rule. Product decisions belong in the repository's canonical product sources. Workflow rules belong to the relevant invoked skill; re-read that skill and apply it as the workflow authority before continuing.

Ask the user only for genuine product choices left open by the skills, such as product scope, business behaviour, terminology, priority, and trade-offs. Do not ask the user to reconfirm validation-status semantics, traceability requirements, stop conditions, implementation blockers, or other workflow rules already defined by skills.

## Workflow evidence

Product Readiness receipts and similar workflow receipts are evidence that a bounded gate ran against named source identities. They are not canonical product facts and must not copy product decisions. The owning skill defines their format, freshness, and stop rules.

Locate a receipt through the originating configured-tracker work item or the repository's declared workflow-evidence location. When neither exists, skills may use `.scratch/product-readiness/` as disposable workflow storage. Specifications link the exact receipt they consumed; canonical product sources remain authoritative when any conflict appears.

## Preserve decision authority

For a material decision that can change product behaviour, scope, permissions, data, integrations, privacy, security, or implementation, the canonical product source records:

- status: `CONFIRMED_AND_VALIDATED`, `CONFIRMED_NOT_VALIDATED`, or `ASSUMPTION`;
- confirmer, product authority, or supporting evidence;
- remaining assumptions and deliberately unvalidated scope;
- stop conditions that require implementation to pause and return to the product decision.

Only `CONFIRMED_AND_VALIDATED` decisions authorize production implementation. `CONFIRMED_NOT_VALIDATED` decisions authorize only explicitly bounded validation work. `ASSUMPTION` items are not requirements. Tickets and specifications link to this authority instead of silently promoting an assumption.

## Prototype traceability

A prototype manifest should record its origin, Prototype ID, affected product areas, tested handoff, exact question, decision sources, in-scope and not-validated behaviour, states/routes, full prototype references, review result, conclusion, resume target, and supersession relationship. A composed workflow also records its exact source manifest + selected full prototype reference set, admitted source IDs, and new integration IDs for the shared shell and cross-workflow continuity. Prototype traceability is bidirectional: the manifest points to the exact canonical decision, while that decision points back to the manifest and names the reviewed scope it accepts. Rejected, deferred, and superseded prototypes are not linked as confirmed evidence. Specs link to the reviewed states they consume; implementation tickets inherit those links from the spec.

Consumers use the repository convention and manifest's stable full prototype references, immutable artifact and fixed fixture refs, derivation and composition links, selection history, current canonical version, stable journey/branch/state/interaction IDs, composition coverage, reachability, external boundaries, downstream-consumption list, and stop conditions. The `prototype` skill owns allocation, reservation, artifact identity, composition, and completion rules; repository docs declare the identifier format and where manifests and optional prototype-journey indexes live. Canonical product sources own product decisions, manifests own reviewed design evidence, and prototype code remains throwaway.

When the repository maintains a prototype-journey index, the `prototype` workflow updates it whenever a version is added or the current selection changes. Use the index only to locate bounded workflows, immutable version artifacts, their natural entry, and terminal handoff. Do not copy product decisions into the index, infer acceptance from filenames, or allow another candidate, previously selected, deferred, superseded, or unselected version to become a downstream requirement.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
