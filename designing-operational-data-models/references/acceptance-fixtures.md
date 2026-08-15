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
