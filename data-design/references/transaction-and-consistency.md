# Transaction and consistency

## Contents

1. Start from observable outcomes
2. Transaction boundaries
3. Concurrency
4. Idempotency
5. Partial success and compensation
6. Unknown outcomes
7. Audit and history

## Start from observable outcomes

For every material command, define the externally meaningful outcomes before selecting storage mechanisms:

- completed with authoritative effect;
- rejected before effect;
- conflicted because observed state is stale;
- partially completed with explicit remaining obligations;
- result unknown and requiring authoritative verification.

Do not collapse partial success or unknown result into generic failure.

## Transaction boundaries

List all writes and external effects that belong to one business result. If a single local transaction can cover them, require atomic commit. If it cannot, define an explicit workflow such as staged publication, outbox, saga, compensating action, or pending state.

Never claim cross-system atomicity without evidence. A database transaction cannot roll back an already accepted external API call.

For publish-like operations, prefer isolated staging followed by one atomic visibility change where the selected platform supports it. Keep incomplete staging invisible and recoverable.

## Concurrency

For every contended command, record:

- the observed version or compare token;
- the authoritative state read;
- the condition under which the write wins;
- the conflict result when the condition no longer holds;
- whether a retry is safe and who authorizes it.

Use database constraints, compare-and-swap updates, row versions, locks, or provider preconditions as implementation mechanisms. Do not let last-write-wins silently decide a business conflict unless product authority explicitly accepts it.

## Idempotency

Define the business operation identity, not merely a request UUID. Record:

- idempotency key scope;
- target object and actor binding;
- request fingerprint or equivalent mismatch detection;
- retention window;
- replay response;
- behavior after partial success;
- behavior when result is unknown.

Retries must not create duplicate business objects, facts, notifications, or external effects.

## Partial success and compensation

When steps cannot be atomic, enumerate each durable intermediate state and obligation. Define which states are visible, which actions may resume, and which compensations are safe. A compensation is a new business fact; it does not erase the original effect.

If the product contract requires an all-or-nothing result but the platform cannot provide it, record `BLOCKED_TECHNICAL_VALIDATION` or `PROPOSED_ARCHITECTURE`. Do not silently weaken the contract.

## Unknown outcomes

After timeout, process loss, ambiguous provider response, or interrupted publication:

1. preserve operation identity and observed version;
2. mark the attempt `RESULT_UNKNOWN` or the product-approved equivalent;
3. prohibit blind replay when duplication is possible;
4. query the authoritative source using stable identities;
5. append the verification or recovery result;
6. update current state only from the authoritative finding;
7. retain both the original uncertainty and later resolution.

## Audit and history

Audit records should answer who attempted what, against which object and observed version, under which permission context, and with which result. Keep sensitive payloads, complete diffs, chat text, and tool logs out of durable business history unless separately required.

An audit log is not automatically a restorable version history. A formal Version or Revision requires an explicit identity, lineage, immutability, retrieval, and restoration contract.
