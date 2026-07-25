# Product Readiness Checks

Use this checklist only to judge whether the current bounded review target can enter `to-spec`. Do not turn the checklist into a second product interview. When a missing answer requires a product decision, route it to `grilling` and use `domain-modeling` when object relationships or terminology are material.

## Scope and sources

- The review target and intended specification boundary are explicit.
- Repository instructions identify the canonical glossary, product baseline, ADRs, evidence, and prototype records.
- Current sources do not contradict one another.
- Unresolved items are blocking, non-blocking with an owner and boundary, implementation details, or out of scope.

## Deferred-scope integrity

- Every material "not confirmed", "confirm later", "leave to prototype/specification", and similar source phrase has a semantic classification.
- Every in-scope deferred product choice has one canonical owner, phase, resume gate, and blocking level.
- Protective exclusions do not create fake future tickets.
- Prototype, specification, technical, implementation, and production work is not counted as an unconfirmed product choice unless it would change the product contract.
- No `NEEDS_CLASSIFICATION` item remains.
- A corpus-wide audit has source-to-ledger coverage; internal ledger counts are not accepted as proof of completeness.
- The ledger names its canonical scan roots, scanner, and coverage boundary, and the latest strict result was produced after the latest relevant canonical edit.
- Recently confirmed answers have reconciled any older deferred items they resolved or replaced; stale unresolved classifications, blocker summaries, and resume targets do not remain.
- The changed ticket passes a ticket-local strict check, and the configured full scope passes strict coverage before tracker resolution or readiness.

Use [deferred-scope-protocol.md](deferred-scope-protocol.md) for the classifications. When auditing a corpus, run `../scripts/audit-deferred-scopes.mjs` from the repository root and require every reported source ID to appear in the audit ledger or a reviewed false-positive register.

## Product sufficiency

Check only the dimensions required by confirmed scenarios:

- outcome, scope, actors, and important scenarios;
- domain terms and responsibility boundaries;
- business objects and their relationships;
- fields needed to display, decide, act, report, trace, or continue later;
- lifecycle states, transitions, exceptions, and terminal outcomes;
- ownership, visibility, permissions, and available actions;
- entry points, return paths, and handoffs;
- data sources, update timing, history, and audit needs;
- empty, unavailable, stale, partial, permission-limited, and failure conditions.

Every field and state needs a confirmed business purpose. Do not add speculative structure for possible future use.

If the product must decide what is needed, route to `grilling`. If external facts are missing, route to `research`. If the question must be seen or exercised, route to `prototype`. If a technical mechanism must be proven, route to `technical-spike`.

## Cross-functional linkages

For every material confirmed handoff, identify:

```text
Producer -> consumer via shared object/event/action
Source of truth -> expected result or writeback -> timing
Canonical product decision
```

Check relevant effects on entry points, visibility, permissions, actions, shared data, counts, badges, reminders, notifications, reports, history, audit records, and downstream operations. Do not invent relationships to fill the checklist.

## Prototype traceability

For design-critical behaviour, either reviewed prototype evidence exists or the canonical decision explains why no prototype is needed.

When prototype evidence exists:

- the prototype manifest links to the exact canonical product decision;
- the canonical product decision links back to the manifest;
- the backlink names the confirmed states, routes, or interaction scope;
- unreviewed prototype areas are not treated as accepted;
- rejected, deferred, or superseded prototypes are not attached as confirmed evidence.

Independently classify the evidence required by the current target. If the target includes entry, navigation, submission, sequential transitions, a terminal outcome, or a return path, require a `WORKFLOW` even when an older manifest labels itself as a state or omits a prototype-unit label.

For a UI `WORKFLOW` prototype:

- the manifest follows the repository identity convention, gives every presented version a stable full prototype reference, preserves previously reviewed versions unchanged, records selection history, and names exactly one `CURRENT_CANONICAL` version chosen by the product authority;
- the current canonical version records an immutable artifact ref and fixed fixture ref that reproduce the reviewed interactive behaviour; a mutable route, screenshot, branch name, or filename alone is insufficient;
- the manifest records a natural entry, terminal outcome, and return path or handoff;
- the current canonical version's primary success journey is mechanically verified from the natural entry rather than only through direct state URLs or debug controls;
- every visible in-scope action has a verified transition, and every adjacent control is either a verified handoff or an explicit external boundary;
- material branches have reviewed evidence appropriate to their reachability, including deterministic fixtures when natural reproduction is impractical;
- the canonical decision's backlink names the exact canonical full prototype reference and journey, branch, state, or interaction IDs it admits.

When the bounded target must connect behaviour from several selected prototype manifests, require one reviewed `COMPOSE_SELECTED` workflow before declaring readiness:

- the composed version has its own stable full prototype reference, immutable artifact and fixture refs, and records every source as an exact manifest + selected full prototype reference + source artifact + source fixture set;
- composition coverage maps admitted source IDs to stable integration IDs for the shared shell, natural entry, navigation, shared state, handoffs, writebacks, terminal result, and return path;
- the formal integration route continuously reaches every in-scope source workflow without switchers, direct-state shortcuts, or unexplained no-ops;
- source behaviour remains owned by the exact source versions, while the composed version owns cross-workflow continuity;
- if a source manifest later selects a different version, the composition is stale until the product authority explicitly retains the historical source for that composition or a new composed version is reviewed.

Do not treat a collection of reviewed screens as proof that the workflow works. If the current evidence lacks the repository identity convention, stable full prototype references, or an explicit current selection, an in-scope entry, action, terminal outcome, or return path is missing, a visible control is an unexplained no-op, multiple versions remain eligible for downstream use, required evidence is only `DIRECT_STATE_ONLY`, or several selected workflows must connect but no reviewed composed version proves their continuity, return `NOT_READY` and route to `prototype` or setup repair as appropriate. Upgrade only the evidence currently being consumed; do not require bulk migration of historical manifests.

A screenshot or prototype filename alone is not traceability.

## Evidence sufficiency

- Every material implementation-shaping decision is labelled `CONFIRMED_AND_VALIDATED`, `CONFIRMED_NOT_VALIDATED`, or `ASSUMPTION` in its canonical source.
- A `CONFIRMED_AND_VALIDATED` decision identifies its confirmer or authority, supporting evidence when needed, remaining assumptions, and stop conditions.
- `CONFIRMED_NOT_VALIDATED` decisions authorize only the bounded validation work named by the decision; they do not authorize full production implementation.
- `ASSUMPTION` items are not treated as requirements.
- External findings cite primary sources and explain how well they fit the actual product need.
- Material technical assumptions have experimental evidence, a verdict, and a fallback.
- Unverified assumptions that could change scope, behaviour, feasibility, privacy, security, or the specification remain blocking unless explicitly excluded.

## Final gate

Return `READY_FOR_TO_SPEC` only when the bounded target has enough confirmed product structure, evidence, cross-functional linkage, and reviewed design behaviour to write a coherent specification without inventing requirements. Every material requirement intended for production implementation must be `CONFIRMED_AND_VALIDATED`; otherwise the specification must be explicitly limited to validation work.

Before returning that verdict, persist a readiness receipt using the main skill's receipt contract. Verify that it is scoped to the exact target and boundary and records the material canonical-source and prototype identities consumed by this assessment. The receipt is workflow evidence only and cannot replace or restate canonical product decisions.

Do not return `READY_FOR_TO_SPEC` while deferred-scope coverage is `PARTIAL`.
