---
name: prd-implementation-precheck
description: Implement PRDs/specs with a mandatory precheck review before coding. Use when a user asks to implement a PRD/feature spec/requirements doc or says "implement PRD/spec". Perform a preflight review, raise questions on scope/consistency/risks, then implement after confirmation.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
metadata:
  hooks:
    after_complete:
      - trigger: self-improving-agent
        mode: background
        reason: "Learn from implementation patterns"
      - trigger: session-logger
        mode: auto
        reason: "Log PRD implementation activity"
---

# PRD Implementation Precheck

## Overview

Perform a short PRD precheck, present issues and questions, then implement only after the user confirms or adjusts the PRD.

Target exactly one parent specification plus one currently selected implementation ticket. Check that ticket's executable closure; do not turn precheck into a fresh audit of the full ticket batch.

## Workflow

1. Locate the PRD and any referenced files.
2. Precheck the PRD and summarize intent in 1-2 sentences.
3. List findings and questions (blockers first), then ask for confirmation to proceed.
4. After confirmation, implement the PRD with minimal, consistent changes.
5. Validate (tests or manual steps) or state what was not run.

## Precheck Checklist

### Basic Checks

- **Scope**: Identify over-broad changes; suggest a smaller, targeted approach.
- **Alignment**: Flag conflicts with existing patterns or architecture; propose alternatives.
- **Dependencies**: Note missing hooks/providers/data sources or unclear ownership.
- **Behavior**: Verify flows and edge cases are specified; ask for gaps.
- **Risks**: Call out performance, regressions, or migration risks.
- **Testing**: Check success criteria and test coverage; request specifics if vague.

### Readiness Receipt Checks

- locate the persisted readiness receipt linked by the selected specification;
- verify its receipt ID, target, and specification boundary match the selected specification;
- treat it as historical workflow evidence only, never as a requirement or a substitute for canonical decisions;
- compare the specification and current canonical sources against the material source and prototype identities recorded by the receipt. If a material source changed after readiness or the specification now conflicts with canonical authority, block implementation until the specification is explicitly retained, updated, or superseded through the product workflow;
- do not rerun Product Readiness for unrelated file edits or unchanged decisions.

### Current Ticket Execution Closure

Before asking to enter implementation, read the selected ticket's tracker-native blocking edges and completion states, body `Blocked by` declarations, shared capabilities, existing-ticket reconciliation, readiness label, and repository ready semantics.

Mark the precheck `BLOCKED` and prohibit implementation when:

- tracker-native blockers and body `Blocked by` declarations conflict;
- repository ready semantics is missing or unsupported, or the selected ticket has not reached the configured readiness state after publication and readback;
- any direct or indirect blocker is incomplete;
- a consumed internal shared capability's owner is absent from the blocker closure or incomplete;
- a consumed external validated capability lacks precise validation evidence;
- required production prototype evidence has a delivery owner outside the completed blocker closure, except explicitly downstream integration evidence;
- an existing-ticket `CONFLICT` is unresolved;
- the selected ticket is final integration and any in-scope delivery ticket is incomplete.

The ready label does not prove blocker completion. Under `STRUCTURALLY_READY`, a ready ticket may still be blocked; under `FRONTIER_ONLY`, a ready ticket with an unresolved blocker is inconsistent and remains blocked.

Limit this check to the selected ticket and its blocker closure, except that final integration checks its complete in-scope delivery set. Do not rerun `to-tickets`, re-grill the product, redo Product Readiness, or edit the specification, ticket, labels, or product documents to make precheck pass. Route ticket-graph, traceability, capability-owner, evidence-owner, and reconciliation defects to the `to-tickets` read-only audit and authorized-repair workflow. Return to the relevant product skill only for a genuinely missing product decision.

### Prototype Evidence Checks

When the selected specification or ticket changes a user-visible workflow:

- locate the approved prototype manifest through the canonical decision and specification links;
- verify the selected ticket names exact source user-story and acceptance-criterion IDs and that those IDs exist in the selected specification;
- derive the complete required prototype-ID set from the selected ticket's acceptance criteria and the specification's AC-to-prototype mapping; require each ID to be marked `OWNED HERE` or to name its delivery-owner dependency, and block omitted, substituted, multiply owned, or unowned IDs instead of trusting the ticket's declaration alone;
- verify bidirectional traceability, the repository identity convention, stable full prototype references, the exact immutable artifact and fixture refs pinned by the specification, and the complete journey/branch/state/interaction ID set required by the current ticket; block a bare version number, mutable route, branch name, filename, screenshot, or display label used as the only version identity;
- reproduce or inspect the reviewed behaviour from the pinned artifact and fixture refs. If the same full prototype reference now resolves to different observable content, block implementation and return to `prototype` to create a new version;
- for a composed workflow, verify the exact composed full reference + artifact + fixture identity, all integration IDs, the complete source manifest + full prototype reference + artifact + fixture + source-ID set, and the ticket's position in the one-shell dependency graph; reject isolated pages or flows that are not connected into that shell;
- compare every specification-pinned full prototype reference, including composed sources, with its manifest's current selection; if any differ, block until an authoritative source records that the product authority explicitly keeps that exact historical pin set for this specification, or updates and supersedes it;
- verify the ticket implements natural entry and visible outcome where its assigned IDs require them, rather than only a directly addressable state;
- block implementation when a required ID is rejected, deferred, not reviewed, mechanically failed, missing, or conflicts with the specification. A historical or superseded prototype version is allowed only when its exact full prototype reference + artifact + fixture identity is pinned by the specification and the explicit keep decision above is recorded; this exception does not admit any other reference, artifact, fixture, or ID;
- block behaviour that extends beyond reviewed evidence and canonical decisions instead of proposing an unconfirmed product default;
- treat prototype code, debug controls, fixtures, and mock data as design evidence only, never as production code authority.

For a composed workflow's final integration-acceptance ticket, also verify that all in-scope delivery-owner tickets are complete, the repeatable full-journey check covers every composed integration ID and admitted source ID from natural entry to terminal handoff, and any integration correction remains inside the pinned specification. Do not pass the composed scope from separate page checks.

Report a missing or conflicting approved source as a precheck blocker and return it to the originating product or prototype workflow. Do not repair the design inside implementation precheck.

### Edge Case Coverage Checks

Verify the PRD addresses these edge cases (mark as ⚠️ if missing):

#### Data Boundaries
- [ ] **Null/Empty handling** - What happens with empty inputs or null values?
- [ ] **Boundary values** - Are min/max limits defined? What happens at boundaries?
- [ ] **Duplicate data** - How are duplicates detected and handled?
- [ ] **Data format** - Are input formats validated? What about special characters?

#### State Boundaries
- [ ] **State transitions** - Are all valid state transitions defined?
- [ ] **Invalid transitions** - What happens on illegal state changes?
- [ ] **Concurrent modifications** - How are simultaneous edits handled?
- [ ] **Rollback scenarios** - Can operations be undone? How?

#### Error Boundaries
- [ ] **Network failures** - What happens when API calls fail?
- [ ] **Timeout behavior** - Are timeouts defined? What's the retry strategy?
- [ ] **Partial failures** - If step 2 of 3 fails, what happens to step 1?
- [ ] **Error messages** - Are user-facing error messages defined?

#### UX Boundaries
- [ ] **Empty states** - What does the user see with no data?
- [ ] **Loading states** - How is loading indicated?
- [ ] **Success feedback** - How does the user know the action succeeded?
- [ ] **Permission denied** - What happens when user lacks permission?

### Codebase Consistency Checks

Scan the codebase to verify PRD aligns with existing patterns:

```bash
# Check if PRD's proposed patterns match existing code
grep -r "pattern_from_prd" src/ --include="*.ts"
```

- [ ] **Delete strategy** - Does PRD match existing soft/hard delete pattern?
- [ ] **Error handling** - Does PRD use the same error display mechanism?
- [ ] **Component reuse** - Does PRD leverage existing components?
- [ ] **API patterns** - Does PRD follow existing API conventions?

## Output Format

### Precheck Report Template

```markdown
## PRD Precheck Report

### Summary
{1-2 sentence summary of what the PRD aims to achieve}

### ✅ Covered Edge Cases
- {List edge cases that are well-defined in the PRD}

### ⚠️ Missing Edge Cases
| Edge Case | Category | Suggested Default | Needs Confirmation |
|-----------|----------|-------------------|-------------------|
| Empty list display | UX | Use existing EmptyState | No |
| Concurrent edit | State | Last write wins | **Yes** |

### 🔴 Blockers
- {Critical issues that must be resolved before implementation}

### 🟡 Warnings
- {Non-critical issues that should be addressed}

### Questions for User
1. {Specific question about missing edge case}
2. {Specific question about ambiguous requirement}

---

**Proceed as-is, or update the PRD?**
```

## Output Expectations

- Provide a concise precheck report with questions and risks.
- Ask explicitly: "Proceed as-is, or update the PRD?"
- If no blockers, state assumptions and continue only with user approval.
