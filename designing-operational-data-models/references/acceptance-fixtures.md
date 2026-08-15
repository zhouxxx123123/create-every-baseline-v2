# Acceptance fixtures

## Contents

1. Positive trigger examples
2. Negative trigger examples
3. Forward-test scenarios
4. Expected routing

## Positive trigger examples

- "The prototype is confirmed. Design the operational business objects and persistence contract before writing the spec."
- "Turn these confirmed Work and Responsibility decisions into a PostgreSQL-neutral data design."
- "Define transaction, CAS, idempotency, unknown-result recovery, and audit contracts for this workflow."
- "The logical data design is accepted; map it to PostgreSQL and prepare migration acceptance."
- "Supabase is selected. Add a physical adapter without changing the approved permission model."

## Negative trigger examples

- "Build a revenue dashboard in dbt." Route to analytics/dbt work.
- "Should users be allowed to delete a Work?" Route to product authority or Wayfinder.
- "Prototype three navigation layouts." Route to Prototype.
- "Can this provider guarantee atomic update?" Route to Technical Spike.
- "Fix this slow SQL query." Route to diagnosis or database performance work.

## Forward-test scenarios

### T01 Append-only facts

Authority says important Work facts cannot be overwritten. Passing output uses a stable Work plus append-only facts and a mutable projection. Failing output keeps only a mutable Work row.

### T02 Multi-object atomic operation

Authority says reopening a Work and attaching an inbound update form one result. Passing output defines one transaction or an explicitly blocking architecture. Failing output permits an open Work without the update.

### T03 Unknown-result verification

A provider times out after a write. Passing output stores operation identity and requires authoritative verification before retry. Failing output retries blindly or marks failure.

### T04 Open question blocks model choice

Two responsibility models remain OPEN. Passing output creates `BLOCKED_PRODUCT_DECISION`. Failing output selects a team model based on industry practice.

### T05 Research is not authority

Research recommends queues. Passing output records research as evidence and leaves product policy unresolved. Failing output creates a queue object as confirmed business structure.

### T06 Prototype storage is not schema

The prototype uses a JSON array and local storage. Passing output derives behavior from admitted IDs. Failing output copies the JSON shape into production tables.

### T07 Plain PostgreSQL

PostgreSQL is selected without Supabase. Passing output maps logical contracts to PostgreSQL only. Failing output assumes Auth IDs, RLS, Storage, or Realtime.

### T08 Supabase selected

Supabase is selected. Passing output applies PostgreSQL first and maps approved access rules to RLS. Failing output treats RLS as product permission authority.

### T09 Database undecided

Logical design is complete and the database is undecided. Passing output can reach `READY_FOR_SPEC` but not `READY_FOR_TICKETS`.

### T10 Analytical handoff

Analytics needs facts from the operational model. Passing output defines a downstream dbt handoff while the operational store remains authoritative. Failing output moves command state or responsibility into dbt.

### T11 Hollow logical package

A package contains only common provenance fields and generic labels. It must fail with `MATERIAL_FIELD_MISSING`; a stable ID and rationale do not substitute for object identity, commands, permissions, transactions, consistency, and recovery semantics.

### T12 All areas waived

Every logical item is marked `OUT_OF_SCOPE` or `NOT_APPLICABLE`. It must fail: a target that persists operational business state requires active objects, invariants, commands, transaction boundaries, permission checks, consistency requirements, and contract tests.

### T13 Physical safety under-testing

A physical test covers only the selected adapter and migration item. It must fail until physical/end-to-end tests cover constraint, concurrency, permission, recovery, migration, and adapter categories.

### T14 Bogus permission mapping

A Supabase adapter names an unknown permission ID. It must fail; RLS may map only known product permission checks.

### T15 Unverifiable authority

A confirmed local authority path is missing, its digest mismatches, its version is absent, or its currentness check is stale. It must fail readiness rather than treating a status label as authority.

### T16 Acceptance ID injection

Package acceptance names an ID that is not a `PROPOSED_ARCHITECTURE` item. It must fail. The accepted set must exactly equal the proposed set.

### T17 Receipt drift

Remove a required timestamp or source digest, or change either the JSON or Markdown after receipt creation. Verification must fail. A receipt binds both exact design representations and does not authenticate modified bytes by status label alone.

## Expected routing

For each scenario, check:

- exact source identities are preserved;
- material items use one allowed classification;
- product ambiguity returns to Wayfinder;
- missing behavior evidence returns to Prototype;
- technical uncertainty returns to Technical Spike;
- no database feature silently weakens a product guarantee;
- readiness gate matches actual completeness;
- package acceptance is requested once, not field by field.
