# Database adapter routing

## Contents

1. Keep the core database-neutral
2. PostgreSQL adapter
3. Supabase adapter
4. dbt analytical handoff
5. Unsupported guarantees

## Keep the core database-neutral

Complete the business objects, identities, invariants, state transitions, commands, authorization, transaction boundaries, concurrency, idempotency, and recovery contracts before selecting physical tables.

The logical contract may use terms such as stable ID, append-only fact, current-state projection, compare token, atomic result, and authoritative verification. It must not depend on table names, ORM decorators, PostgreSQL-specific types, Supabase policy syntax, or dbt materializations.

## PostgreSQL adapter

Use a PostgreSQL design skill or official PostgreSQL references only after PostgreSQL is selected. Map:

- stable identities to primary and alternate keys;
- relationship cardinality to foreign keys and constraints;
- invariants to constraints, transactions, or guarded commands;
- observed versions to compare-and-swap predicates or row-version mechanisms;
- append-only facts to immutable insert paths;
- current state to projections with controlled updates;
- idempotency to unique operation keys and stored outcomes;
- staged publication and outbox behavior to transactional tables;
- queries to measured indexes rather than speculative indexing;
- schema changes to expand, migrate, contract, and rollback steps.

Record every database-specific choice as `IMPLEMENTATION_CHOICE` or `PROPOSED_ARCHITECTURE`. PostgreSQL capabilities do not create product semantics.

## Supabase adapter

Use Supabase guidance only when the project has selected Supabase. Start with the PostgreSQL mapping, then add:

- Auth identity mapping;
- RLS policies and service-role boundaries;
- Storage object references and metadata ownership;
- Realtime visibility and ordering limits;
- generated API behavior;
- platform migration and local-test requirements.

RLS is defense in depth for an already confirmed permission and Data Scope contract. Do not derive product access rules from convenient RLS expressions. Do not treat a Supabase user ID as the only enterprise identity unless product authority establishes that mapping.

## dbt analytical handoff

Use dbt only for downstream analytical transformations. Emit a handoff that names:

- authoritative operational facts and keys;
- event time and correction semantics;
- deletion, retention, and late-arrival behavior;
- tenant and privacy boundaries;
- expected dimensions, facts, measures, and freshness;
- fields prohibited from analytics.

dbt snapshots, model versions, incremental models, and tests are analytical contracts. They do not implement operational object lifecycle, command authorization, transaction atomicity, responsibility, or source-application writeback.

## Unsupported guarantees

When the selected adapter cannot satisfy a required guarantee:

1. state the exact unsupported guarantee and evidence;
2. preserve the original product requirement;
3. propose a new architecture or product operation;
4. obtain explicit acceptance for that new proposal;
5. record the replacement and invalidate prior receipts.

Never silently fall back from formal Version to copy, from atomic result to partial success, from strong authorization to best effort, or from authoritative verification to blind retry.
