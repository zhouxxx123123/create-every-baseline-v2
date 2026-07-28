# Course Map

This academy teaches workflow judgment, not command memorization. The foundation is required; the learner then chooses an elective and completes a capstone suited to that route.

## Route

```text
Foundation
    |
    +-- Product discovery
    +-- Evidence validation
    +-- Delivery
    +-- Engineering maintenance
    +-- Skill authoring
    |
    `-- Capstone after at least one elective
```

## Foundation

Learn to identify the desired outcome, distinguish a standalone tool from a workflow transition, establish repository authority, and preserve a return path across sessions.

Read [track-foundation.md](track-foundation.md) only while this track is active.

## Elective tracks

| Learner goal | Track | Completion outcome |
| --- | --- | --- |
| Clarify a product, resolve decisions, or map a large effort | `product-discovery` | A bounded decision, domain model, map, and hardening review |
| Decide whether uncertainty needs sources, observation, or experiment | `evidence-validation` | Correct evidence routing and a readiness assessment |
| Convert confirmed context into buildable work | `delivery` | A traceable spec boundary, ticket plan, implementation contract, and review |
| Diagnose bugs or improve repository health | `engineering-maintenance` | A red loop, triage brief, architecture finding, and safe recovery plan |
| Create or maintain reusable skills | `skill-authoring` | A validated skill design and routing audit |

The learner can complete more than one elective. Switching tracks preserves progress.

## Capstone eligibility

Require:

- `foundation` complete;
- at least one elective complete;
- a fresh scenario not already solved in a track artifact.

Adapt the capstone:

- product route: decide, validate, and preserve a canonical return path;
- delivery route: verify readiness, slice work, and define implementation evidence;
- maintenance route: build a feedback loop, repair, and review;
- authoring route: create or revise a skill and prove registry integrity.

## Skill coverage

The manifest maps every top-level skill in this repository to one teaching track. Compatibility aliases are reference-only:

| Alias | Authority |
| --- | --- |
| `diagnose` | `diagnosing-bugs` |
| `to-prd` | `to-spec` |
| `to-issues` | `to-tickets` |

`grill-me` and `grill-with-docs` are distinct compositions around `grilling`, not compatibility aliases.

## Reference route

When the learner asks "which skill should I use?" without starting the academy:

1. identify the desired outcome;
2. name the canonical skill or flow;
3. explain the transition and stop condition;
4. mention an alias only when it helps the learner recognize an older invocation;
5. do not update course progress.
