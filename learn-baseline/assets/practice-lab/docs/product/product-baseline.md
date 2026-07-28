# Harbor Tasks Product Baseline

## Confirmed

- Users work inside one Current Workspace at a time.
- Projects and Tasks retain stable identity across rename.
- A Task can be active or archived.
- Archiving a Task does not delete it.
- Access to a Project does not automatically grant every operation on its Tasks.
- Failed writes must not be presented as successful.

## Intentionally unresolved

- Whether Review Request is a distinct product object or a view of an existing Task responsibility.
- Whether a reviewer must already have Project access before receiving a Review Request.
- Where a user recovers a dismissed review reminder.
- Whether the first version needs a cross-project review queue.
- Whether a Task rename rejected for an empty name may leave any local draft.

## Product exclusions

The lab does not define billing, production deployment, real authentication, or legal retention policy.
