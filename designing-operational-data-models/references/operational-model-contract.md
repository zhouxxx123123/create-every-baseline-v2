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

The root object uses `schema_version: "1.0"` and contains:

```json
{
  "schema_version": "1.0",
  "design_id": "DATA-DESIGN-EXAMPLE-001",
  "target": "One bounded capability",
  "boundary": "Included and excluded behavior",
  "status": "DRAFT",
  "source_authorities": [],
  "prototype_evidence": [],
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
  "package_acceptance": {
    "status": "PENDING",
    "accepted_by": "",
    "accepted_at": "",
    "accepted_architecture_ids": []
  },
  "downstream_handoff": {
    "requested_gate": "READY_FOR_SPEC",
    "consumer": "to-spec",
    "notes": ""
  }
}
```

`package_acceptance` stays `PENDING` while the design is being derived. Set it to `ACCEPTED` only after the user accepts the bounded package. Record the accepter, time, and every accepted `PROPOSED_ARCHITECTURE` ID. This is package-level acceptance, not a product decision and not permission to confirm blocked questions.

`source_authorities` entries require `stable_id`, `ref`, `authority_kind`, and `authority_status`. Only current confirmed product authority may use `authority_status: CONFIRMED`. Research, implementation, prototypes, and spikes keep their actual evidence role.

`prototype_evidence` entries require `stable_id`, `ref`, `source_refs`, `admitted_ids`, and `review_status`. Use exact immutable identities where the repository supplies them.

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

The Markdown and JSON must describe the same design. The receipt hashes the JSON; do not put untracked material decisions only in prose.
