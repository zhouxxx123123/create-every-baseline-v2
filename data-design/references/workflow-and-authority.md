# Workflow and authority

## Contents

1. Position in the delivery flow
2. Admission checklist
3. Authority order
4. Routing rules
5. Package acceptance
6. Downstream handoff

## Position in the delivery flow

Use this sequence for a bounded feature that persists operational business state:

```text
Wayfinder or product authority
  -> Prototype where behavior needs validation
  -> canonical decision absorbs admitted prototype evidence
  -> Product Readiness
  -> data-design
  -> to-spec
  -> to-tickets
  -> implement and database adapter work
  -> optional downstream dbt analytics
```

The data-design stage is not product discovery, UI prototyping, general architecture, or implementation. It defines the durable operational contract that all of those downstream activities must respect.

## Admission checklist

Record exact identities for:

- the bounded target and specification boundary;
- the current canonical product decisions;
- the locally verifiable readiness receipt, registered verifier identity, and its source identities;
- admitted prototype manifest, artifact, fixture, version, and confirmed IDs;
- domain glossary terms and existing ADRs;
- current storage, API, event, permission, and migration constraints;
- the requested readiness gate.

Stop if the readiness receipt is missing, opaque, stale, mismatched, rejected by its registered verifier, or older than a material product change. Return to Product Readiness rather than repairing its receipt.

## Authority order

Use this order when sources disagree:

1. explicit current user instruction for this bounded task;
2. canonical confirmed product decision;
3. current project instructions and accepted ADRs;
4. admitted prototype behavior linked by the product decision;
5. validated technical spike within its exact boundary;
6. existing implementation as evidence of current behavior;
7. research and external reference implementations;
8. agent inference.

Lower layers cannot override higher layers. Existing schema and code are not automatically the desired product contract. Research and reference products never confirm WorkforceOS policy.

## Routing rules

Route one unresolved blocker:

| Condition | Classification | Return target |
| --- | --- | --- |
| More than one reasonable business behavior | `BLOCKED_PRODUCT_DECISION` | Wayfinder or owning product decision |
| Missing user-visible behavior or interaction evidence | `BLOCKED_PROTOTYPE` | Prototype |
| Unknown feasibility, guarantee, provider behavior, or performance | `BLOCKED_TECHNICAL_VALIDATION` | Technical Spike |
| Material hard-to-reverse architecture choice | `PROPOSED_ARCHITECTURE` | Explicit package decision |
| Reversible choice covered by a registered standard | `IMPLEMENTATION_CHOICE` | Apply and record |
| Unique consequence of authority | `DERIVED_FROM_AUTHORITY` | Derive and validate |

Do not ask the user to confirm ordinary names, columns, indexes, join-table mechanics, or other reversible consequences individually.

## Package acceptance

Present one bounded package containing:

- scope and sources;
- object and relationship summary;
- state and command model;
- transaction, permission, concurrency, idempotency, and recovery decisions;
- physical adapter status;
- migration and compatibility status;
- contract-test plan;
- P1/P2/P3 findings;
- every proposed architecture item and every blocked item;
- requested readiness gate.

The user accepts or rejects the package and explicitly decides material proposed architecture. Derived items remain traceable to their source and do not need field-by-field confirmation.

## Downstream handoff

For `to-spec`, provide the verified `READY_FOR_SPEC` receipt and stable design IDs. For database tickets, also require `READY_FOR_TICKETS`.

If any downstream change alters an object identity, invariant, lifecycle, command effect, transaction boundary, permission check, consistency guarantee, idempotency key, or unknown-result recovery rule, invalidate the old receipt and return here. If the change is a product change, return to product authority first.
