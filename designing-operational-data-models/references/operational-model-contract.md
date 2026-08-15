# Operational model contract

## Contents

1. Purpose
2. Required package
3. Material item shape
4. Logical modeling rules
5. Readiness states
6. Human-readable companion

## Purpose

The JSON contract describes operational source-of-truth behavior. It is intentionally database-neutral. It must be precise enough for specification, ticket decomposition, implementation, migration, and contract testing without letting a physical schema invent product behavior.

## Required package

The root object uses `schema_version: "1.1"` and contains:

```json
{
  "schema_version": "1.1",
  "design_id": "DATA-DESIGN-EXAMPLE-001",
  "target": "One bounded capability",
  "boundary": "Included and excluded behavior",
  "status": "DRAFT",
  "source_authorities": [],
  "prototype_evidence": [],
  "admission": {
    "gate_kind": "PRODUCT_READINESS_RECEIPT",
    "ref": "immutable receipt identity",
    "version": "validator or receipt version",
    "content_sha256": "64 hexadecimal characters",
    "verifier": "verifier identity",
    "verdict": "PASS"
  },
  "objects": [],
  "relationships": [],
  "invariants": [],
  "state_transitions": [],
  "commands": [],
  "transaction_boundaries": [],
  "permission_checks": [],
  "consistency_requirements": [],
  "idempotency_contracts": [],
  "unknown_outcome_contracts": [],
  "logical_model": {"status": "INCOMPLETE", "notes": ""},
  "physical_adapters": [],
  "migration_requirements": [],
  "contract_tests": [],
  "blocked_items": [],
  "out_of_scope": [],
  "quality_review": {
    "status": "PENDING",
    "reviewed_by": "",
    "reviewed_at": "",
    "review_ref": "",
    "findings": []
  },
  "package_acceptance": {
    "status": "PENDING",
    "accepted_by": "",
    "accepted_by_ref": "",
    "accepted_at": "",
    "accepted_architecture_ids": [],
    "confirmation_ref": ""
  },
  "downstream_handoff": {
    "requested_gate": "READY_FOR_SPEC",
    "consumer": "to-spec",
    "notes": ""
  }
}
```

`package_acceptance` stays `PENDING` while the design is being derived. Set it to `ACCEPTED` only after the user accepts the bounded package. Record the accepter display label, stable `accepted_by_ref`, timezone-aware time, confirmation reference, and every accepted `PROPOSED_ARCHITECTURE` ID. This is package-level acceptance, not a product decision and not permission to confirm blocked questions.

`source_authorities` entries require `stable_id`, `ref`, `authority_kind`, `authority_status`, `version`, `content_sha256`, `currentness_status`, and a timezone-aware `currentness_checked_at` for confirmed authority. Only current canonical product authority may use `CONFIRMED` or `CONFIRMED_AND_VALIDATED`. Research, implementation, prototypes, and spikes keep their actual evidence role. Local file references are resolved and their bytes are checked against the declared digest when the validator receives the design path.

`prototype_evidence` entries require `stable_id`, `ref`, `source_refs`, `admitted_ids`, `review_status`, `version`, and exact manifest, artifact, and fixture references plus SHA-256 digests. A prototype entry can admit only known design IDs.

`admission` identifies the exact passing Product Readiness receipt or project-declared equivalent gate. A readiness state cannot be self-declared without this evidence.

`quality_review.findings` stores review findings with `finding_id`, `severity`, `status`, `affects_gate`, and `message`. A readiness gate requires `quality_review.status: PASSED` and rejects an open P1/P2 finding affecting that gate.

## Material item shape

Every item in the following arrays requires a globally unique `stable_id`, non-empty `source_refs`, one allowed `classification`, a `rationale`, and `validation_status`:

- `objects`
- `relationships`
- `invariants`
- `state_transitions`
- `commands`
- `transaction_boundaries`
- `permission_checks`
- `consistency_requirements`
- `idempotency_contracts`
- `unknown_outcome_contracts`
- `physical_adapters`
- `migration_requirements`
- `contract_tests`
- `blocked_items`
- `out_of_scope`

Use `validation_status` values:

- `VALIDATED`
- `PROPOSED`
- `BLOCKED`
- `NOT_APPLICABLE`

Use `source_refs` to reference source authority IDs, prototype evidence IDs, or other stable design item IDs. The validator rejects unknown references.

### Required semantic fields

Common provenance fields are not enough. Every active item also carries the fields below:

| Collection | Required semantic contract |
| --- | --- |
| `objects` | name, purpose, stable identity, source-of-truth owner, current-state fields, immutable-fact refs, lifecycle, retention ref, content mode |
| `relationships` | both object refs, cardinality, optionality, ownership, retention behavior, invariant refs |
| `invariants` | statement and enforcement point |
| `state_transitions` | from/to state, triggering command, preconditions, effects |
| `commands` | target object refs, actor contract, authorization refs, observed version, preconditions, atomic effects, success/failure outcomes, audit facts |
| `transaction_boundaries` | command refs, writes, external effects, atomicity, partial-success policy |
| `permission_checks` | target refs, actor and Data Scope, execution-time revalidation, denial outcome |
| `consistency_requirements` | target refs, model, enforcement, conflict outcome |
| `idempotency_contracts` | command refs, key scope, target binding, request fingerprint, retention, replay, partial/unknown behavior |
| `unknown_outcome_contracts` | command refs, unknown state, authority, verification, retry, resolution fact |
| `physical_adapters` | selection flag, adapter kind, mapping plus constraint/transaction/concurrency/permission/recovery strategies |
| `migration_requirements` | strategy, compatibility, backfill, validation, rollback, deployment order |
| `contract_tests` | name, level, covered IDs, coverage categories, expected behavior |
| `blocked_items` | question, owner, return target, blocked gate |
| `out_of_scope` | excluded scope and reason |

References such as command targets, authorization checks, transition triggers, and Supabase permission contracts are type-checked against the correct collection. Arrays must contain only non-empty strings; invalid members are not silently discarded.

## Logical modeling rules

### Objects

Record the stable business identity, purpose, source-of-truth owner, mutable current state, immutable facts, lifecycle, retention reference, and whether content is stored or referenced.

### Relationships

Record both ends, cardinality, optionality, ownership, deletion/retention behavior, and the invariant enforced by the relationship. A join table is an implementation mechanism, not the relationship definition.

### State transitions and commands

Separate intent from effect. A command records target identity, actor, execution-time authorization, observed version, preconditions, atomic effects, returned outcome, failure outcome, and audit facts. A state transition records legal from/to states and its enabling command or event.

### Invariants and consistency

State invariants independently of a database constraint. Then map each invariant to an enforcement point and at least one contract test. Distinguish immediate transaction consistency, optimistic concurrency, eventual convergence, and external authoritative verification.

### History

Do not represent history by overwriting the only row. Preserve important business facts as append-only records linked to the stable object. A current-state projection may be mutable. A timestamp or blob alone does not establish a formal version lineage.

### Permissions

Define product authorization and Data Scope before mapping them to database policies. Require execution-time revalidation for material writes. ACL, RLS, provider permissions, and application checks are enforcement mechanisms and must not redefine the product contract.

## Readiness states

- `DRAFT`: structurally incomplete or still under design.
- `BLOCKED`: at least one material unresolved item prevents the requested gate.
- `READY_FOR_SPEC`: logical model, contract tests, and routing are complete; physical database may remain undecided.
- `READY_FOR_TICKETS`: logical model plus selected physical adapter, migration requirements, and physical tests are validated.

`READY_FOR_SPEC` must not contain a blocker whose `blocks` value is `LOGICAL` or `BOTH`. `READY_FOR_TICKETS` must not contain any blocker.

`READY_FOR_SPEC` requires active objects, invariants, commands, transaction boundaries, permission checks, consistency requirements, and contract tests. These critical areas cannot be waived by marking everything `OUT_OF_SCOPE` or `NOT_APPLICABLE`. Every active logical behavior contract requires logical or end-to-end test coverage.

`READY_FOR_TICKETS` additionally requires exactly one validated adapter, active complete migration requirements, and physical or end-to-end tests covering the adapter and migration plus all six safety categories: constraint, concurrency, permission, recovery, migration, and adapter behavior.

When the package is accepted, `accepted_architecture_ids` must equal the exact set of `PROPOSED_ARCHITECTURE` IDs. Unknown IDs, missing proposals, placeholder acceptance, or an invalid timestamp fail readiness.

## Human-readable companion

The Markdown companion should include:

1. boundary and authority map;
2. object catalog and relationship diagram;
3. state and command model;
4. write, permission, concurrency, idempotency, and recovery contracts;
5. physical adapter and migration plan;
6. contract-test matrix;
7. open blockers, proposed architecture, and out-of-scope items;
8. requested readiness gate and downstream handoff.

The Markdown and JSON must describe the same design. The receipt hashes and verifies both files. That detects byte-level drift; semantic parity remains part of quality review, so do not put untracked material decisions only in prose.
