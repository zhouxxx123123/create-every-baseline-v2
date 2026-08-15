---
name: designing-operational-data-models
description: Convert confirmed product decisions and admitted prototype behavior into a database-neutral, traceable, and machine-validated operational data design before specification or database implementation. Use after Product Readiness for a bounded feature that persists business state, when defining business objects, identities, relationships, invariants, lifecycle transitions, commands, transaction boundaries, authorization checks, concurrency, idempotency, unknown-result recovery, audit facts, migrations, or conditional PostgreSQL/Supabase adapters. Route unresolved product behavior back to Wayfinder, missing interaction evidence to Prototype, and material technical uncertainty to Technical Spike. Do not use for analytics-only dbt models, exploratory schemas, or inventing product policy.
---

# Designing Operational Data Models

Turn approved product behavior into an operational data contract. Keep product authority, logical business semantics, physical database choices, and analytical models separate.

## Read the required guidance

Read these files before designing:

- [workflow-and-authority.md](references/workflow-and-authority.md) for admission, authority, routing, and package acceptance.
- [operational-model-contract.md](references/operational-model-contract.md) for the required logical model.
- [transaction-and-consistency.md](references/transaction-and-consistency.md) whenever writes, concurrency, partial success, or recovery exist.
- [database-adapter-routing.md](references/database-adapter-routing.md) only after the logical model is stable or a database has already been selected.
- [quality-review.md](references/quality-review.md) before declaring either readiness state.
- [acceptance-fixtures.md](references/acceptance-fixtures.md) when maintaining or forward-testing this skill.

## Admit one bounded target

Require all of the following:

- one bounded product target and exact specification boundary;
- current canonical product decisions;
- a valid Product Readiness receipt or equivalent project-declared gate;
- exact prototype identities only where reviewed behavior shaped the product decision;
- repository instructions, domain glossary, existing ADRs, and current persistence architecture;
- the downstream consumer: `to-spec`, tickets, implementation, migration, or review.

Do not copy prototype state objects, fixtures, mock JSON, component props, or demo storage into the business model. A prototype is behavioral evidence only after the canonical product authority admits it.

If the target does not persist business state, report that this skill is not applicable and return to the originating workflow. Do not create a ceremonial package.

## Classify every material statement

Use exactly one classification:

- `DERIVED_FROM_AUTHORITY`: uniquely follows from confirmed product authority.
- `IMPLEMENTATION_CHOICE`: reversible technical choice governed by existing project standards.
- `PROPOSED_ARCHITECTURE`: material, hard-to-reverse choice requiring explicit acceptance.
- `BLOCKED_PRODUCT_DECISION`: business behavior is unresolved; return to Wayfinder.
- `BLOCKED_PROTOTYPE`: required behavior or interaction evidence is missing; return to Prototype.
- `BLOCKED_TECHNICAL_VALIDATION`: feasibility or guarantee is unknown; return to Technical Spike.
- `OUT_OF_SCOPE`: deliberately excluded from this bounded design.

Never promote research, an industry pattern, a prototype fixture, or a database feature into product authority. Never infer a product answer from a path, table name, ORM convention, or existing implementation alone.

## Build the logical contract first

Define:

1. business objects and stable identity;
2. source-of-truth ownership and external references;
3. relationships and cardinality;
4. immutable facts versus mutable current state;
5. lifecycle states and allowed transitions;
6. commands, preconditions, effects, and returned outcomes;
7. invariants and uniqueness rules;
8. transaction and consistency boundaries;
9. permission and Data Scope checks at execution time;
10. concurrency, idempotency, partial-success, and unknown-result contracts;
11. audit facts, retention references, and data minimization;
12. contract tests that prove observable business behavior.

Prefer a stable business object plus append-only facts when history must not be overwritten. Do not call timestamps, change tokens, copied rows, file paths, blobs, audit logs, or analytical snapshots a formal Version or Revision unless the product/source contract explicitly defines one.

## Route ambiguity instead of asking field by field

Derive unique consequences automatically and record their sources. Apply registered project defaults for ordinary reversible implementation choices.

Pause only when one of these conditions holds:

- two or more reasonable business outcomes remain;
- required product behavior, target identity, permission, or failure policy is missing;
- a prototype must establish behavior before the model can be trusted;
- a material technical guarantee is unverified;
- a hard-to-reverse architecture choice lacks an accepted project standard.

Return one blocking question to its owner. Do not run a questionnaire for every table, field, or index.

## Add physical adapters conditionally

Keep `logical_model` database-neutral. Add `physical_adapters` only for a selected or explicitly proposed persistence technology.

- For PostgreSQL, map identities, constraints, transactions, locking, indexes, migrations, and recovery to PostgreSQL mechanisms.
- For Supabase, first apply PostgreSQL design, then add Supabase-specific Auth, RLS, API, Storage, Realtime, and platform constraints. RLS enforces an approved permission contract; it does not define that contract.
- For dbt, emit only a downstream analytical handoff. dbt models must consume operational facts and must not become the source of truth for operational commands or responsibility.

Do not silently degrade an unavailable Version, atomicity, consistency, authorization, or recovery guarantee. Record the limitation and return a newly proposed operation or architecture for explicit acceptance.

## Persist one design package

Use the repository-configured location. If none exists, use:

```text
.scratch/<feature>/data-design/
|-- operational-data-design.md
|-- operational-data-design.json
`-- data-design-receipt.md
```

The Markdown document explains the design to humans. The JSON file is the machine-verifiable contract described in [operational-model-contract.md](references/operational-model-contract.md). The receipt proves which exact JSON bytes passed which gate; it is workflow evidence, not product authority.

Validate continuously:

```bash
python "<resolved-skill-dir>/scripts/validate_operational_data_design.py" \
  <operational-data-design.json>
```

Use one of the readiness gates:

```bash
python "<resolved-skill-dir>/scripts/validate_operational_data_design.py" \
  <operational-data-design.json> --require-logical-ready

python "<resolved-skill-dir>/scripts/validate_operational_data_design.py" \
  <operational-data-design.json> --require-physical-ready
```

Create the receipt only after the chosen gate passes:

```bash
python "<resolved-skill-dir>/scripts/create_data_design_receipt.py" \
  <operational-data-design.json> \
  --gate READY_FOR_SPEC \
  --output <data-design-receipt.md>
```

Use `READY_FOR_TICKETS` instead when the physical adapter and migrations are validated. The creator refuses to overwrite an existing receipt.

Verify before downstream consumption:

```bash
python "<resolved-skill-dir>/scripts/verify_data_design_receipt.py" \
  <data-design-receipt.md>
```

If the design hash, validator version, source identities, or gate no longer match, create a new receipt. Never rewrite an old receipt.

## Perform quality review and package acceptance

Run the self-check and deterministic validator first. Then review four axes:

- product fidelity;
- operational data modeling;
- database engineering;
- security and reliability.

Classify findings as `P1`, `P2`, or `P3`. Do not declare readiness with any `P1`, or with an unresolved `P2` that affects the requested gate. If an independent reviewer is available, give it the raw authorities and design package, not the intended answer.

Ask the user to accept the whole bounded package, plus any listed `PROPOSED_ARCHITECTURE`, instead of confirming every derived field. Package acceptance does not confirm blocked product questions.

## Hand off without widening scope

- `READY_FOR_SPEC`: logical contract is complete; `to-spec` may consume the receipt even if the physical database is undecided.
- `READY_FOR_TICKETS`: selected physical adapter, migration path, and physical contract tests also pass; database implementation tickets may consume the receipt.

Downstream specifications and tickets must reference stable design item IDs. Implementation may refine reversible details but must not change business identity, invariants, lifecycle, permissions, transaction boundaries, or failure semantics without returning to this workflow and, when necessary, the originating product authority.
