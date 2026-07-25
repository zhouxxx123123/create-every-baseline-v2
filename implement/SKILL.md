---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
---

Implement one bounded ticket or specification slice without inventing product decisions.

## Establish the implementation contract

Before editing code, read:

- repository instructions and relevant domain vocabulary;
- the full ticket and its parent specification;
- linked canonical product decisions and ADRs;
- linked prototype manifests and the exact reviewed states/routes in scope;
- the cross-functional handoff, source-of-truth owner, result/writeback, timing, permission boundary, and failure boundary;
- material decision status, authority or evidence, remaining assumptions, stop conditions, and acceptance criteria.

State the implementation contract briefly:

```text
Behaviour to deliver:
Product areas and handoff:
Source of truth and writeback:
Reviewed prototype states:
Material decision status:
Assumptions and stop conditions:
Not validated or out of scope:
Acceptance criteria:
```

This is a working summary, not a new source of truth. Follow the links when detail matters.

## Verify the current ticket execution closure

When the request selects a tracker ticket, scope the execution check to that one ticket and its direct and indirect blocker closure. For a final integration ticket, include every in-scope delivery ticket that it must integrate. Do not rerun `to-tickets`, reslice the work, or audit the whole ticket batch for an ordinary ticket. For a direct bounded specification slice with no tracker ticket, skip only these tracker-closure checks and retain the implementation-contract gates below.

Read and reconcile:

- tracker-native blocking edges and completion state;
- the ticket body's `Blocked by` declarations;
- shared capabilities owned and consumed by the ticket;
- existing-ticket conflicts and handoffs;
- the current readiness label and the repository's configured ready semantics.

Return `BLOCKED`, list the exact blocker or conflict, and do not edit code when:

- tracker-native edges and the ticket body disagree;
- repository ready semantics is missing or unsupported, or the selected tracker ticket has not reached the configured readiness state after its workflow's publication and readback checks;
- any blocker in the closure is not complete in the configured tracker;
- a consumed internal shared capability has no completed owner in the blocker closure;
- a consumed external validated capability lacks precise validation evidence;
- an existing-ticket `CONFLICT` is unresolved;
- a final integration ticket has any incomplete in-scope delivery ticket.

A ready label never proves that blockers are complete. Under `STRUCTURALLY_READY`, ready tickets may still wait on blockers; under `FRONTIER_ONLY`, a ready ticket that has an unresolved blocker is a configuration or tracker inconsistency and remains blocked.

Do not modify the ticket, labels, specification, or product documents to make this check pass. Route a ticket-graph, traceability, capability-owner, evidence-owner, or reconciliation defect to the `to-tickets` read-only audit and authorized-repair workflow. Return to the relevant product Workflow Authority only when the missing input is a genuine product decision.

## Stop instead of guessing

Do not begin or continue production implementation when:

- a material requirement is `CONFIRMED_NOT_VALIDATED` or `ASSUMPTION`;
- a required source, backlink, reviewed prototype state, or acceptance criterion is missing;
- the ticket, specification, canonical decision, ADR, and prototype evidence conflict;
- actual code, data, API, platform behaviour, permissions, or environment contradicts a material product assumption;
- the requested behaviour falls inside explicitly unvalidated or out-of-scope content.

Report `BLOCKED`, show the concrete conflict or missing evidence, and identify the canonical product decision or validation workflow that must resume. Do not work around the conflict, silently narrow the requirement, or edit product sources to make the implementation appear compliant.

A ticket explicitly scoped as a bounded prototype, technical spike, or pilot may implement a `CONFIRMED_NOT_VALIDATED` decision only within that non-production boundary.

## Implement the vertical slice

Use /tdd where possible, at pre-agreed seams. Implement the complete slice, including its relevant cross-functional effects and writeback, rather than only the most visible surface.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

## Review and close

Once the implementation and required tests pass, use /code-review to review the work.

Treat review findings as input to the implementation workflow, not as a terminal report. If either review axis has actionable findings:

1. fix the findings that are in scope;
2. rerun the affected tests and required checks;
3. rerun /code-review when the fixes materially change the reviewed diff;
4. record any intentionally unresolved finding with its owner and reason.

Do not commit or declare the work complete while an unaccepted blocking finding remains. Run any repository-required post-implementation checks, including prototype parity for user-facing work, against the exact linked reviewed states before completion.

Commit your work to the current branch only after the implementation contract, tests, review loop, and required post-implementation checks pass.
