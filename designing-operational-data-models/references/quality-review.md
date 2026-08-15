# Quality review

## Contents

1. Three gates
2. Finding severity
3. Review axes
4. Acceptance rules
5. Receipt rules

## Three gates

### Gate 1: deterministic self-check

Run the validator for structural integrity, stable IDs, source references, classification, logical completeness, blockers, adapter selection, migration coverage, and contract-test traceability.

### Gate 2: quality review

Review the raw authorities and package across all four axes below. Prefer an independent fresh-context reviewer when available. Do not provide the reviewer with the intended verdict.

### Gate 3: package acceptance

Present one bounded design package to the user. Ask for package-level acceptance and explicit decisions only for proposed architecture. Do not ask for confirmation of every uniquely derived field.

## Finding severity

- `P1`: product contradiction, invented authority, unsafe write contract, missing permission boundary, impossible recovery, corrupted identity/history, or a blocker hidden as ready.
- `P2`: incomplete traceability, ambiguous cardinality/state, missing migration/test coverage, unbounded adapter choice, or a material quality gap.
- `P3`: clarity, naming, organization, or low-risk improvement that does not invalidate the requested gate.

## Review axes

### Product fidelity

- Every business object, invariant, command, and failure outcome has an exact authority source.
- Research and prototypes retain evidence status.
- OPEN product questions remain blocked rather than inferred.
- Share, Copy, Version, Revision, Artifact, analytical snapshot, and source writeback remain distinct.

### Operational data modeling

- Stable identity is separate from mutable current state.
- Relationships and cardinality are explicit.
- Important facts are append-only when the product requires non-overwrite history.
- State transitions and commands are legal and complete.
- Retention references and content minimization are explicit.

### Database engineering

- Constraints enforce the declared invariants where possible.
- Transactions match business result boundaries.
- Concurrency has a one-winner or explicit conflict contract.
- Idempotency covers retries and partial success.
- Migrations include compatibility, backfill, validation, rollback, and deployment order.
- Indexes follow access paths and evidence.

### Security and reliability

- Data Scope and permission checks occur at execution time.
- Tenant identity is preserved across all relationships and queries.
- Sensitive fields are minimized and protected.
- Partial success and unknown outcomes have authoritative recovery.
- Audit records preserve necessary facts without duplicating sensitive content.

## Acceptance rules

`READY_FOR_SPEC` requires:

- zero P1 findings;
- zero unresolved P2 findings affecting the logical gate;
- complete logical model;
- no logical blocker;
- contract tests for every invariant and command outcome;
- explicit downstream handoff.

`READY_FOR_TICKETS` additionally requires:

- zero unresolved P2 findings affecting physical delivery;
- exactly one selected, validated physical adapter;
- complete migration requirements;
- physical constraint, concurrency, permission, and recovery tests;
- no blocker of any kind.

A P1 finding must be resolved. Marking P1 as `ACCEPTED_RISK` does not make either readiness gate pass.

## Receipt rules

Create a receipt only after deterministic validation, quality review, and package acceptance pass. The receipt records exact hashes for both the machine JSON and human Markdown, plus the gate, validator version, target, boundary, source authority IDs and digests, admission evidence, quality review, and package acceptance. It does not replace product authority.

Receipts are immutable. A changed JSON or Markdown design, source identity or bytes, validator contract, admission, review, acceptance, or gate requires a new receipt. Downstream consumers must verify the receipt and both referenced files before using it.
