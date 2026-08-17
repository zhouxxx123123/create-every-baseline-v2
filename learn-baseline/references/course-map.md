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
| Convert confirmed context into buildable work | `delivery` | A traceable spec boundary, operational data contract when applicable, ticket plan, implementation contract, and review |
| Diagnose bugs or improve repository health | `engineering-maintenance` | A red loop, triage brief, architecture finding, and safe recovery plan |
| Create or maintain reusable skills | `skill-authoring` | A validated skill design and routing audit |

The learner can complete more than one elective. Switching tracks preserves progress.
A route completion covers one elective; full-catalog completion requires all five.

## Capstone eligibility

Require:

- `foundation` complete;
- at least one elective complete;
- a fresh scenario not already solved in a track artifact.

Use the matching built-in scenario:

- product discovery: `requests/capstone-product-scenario.md`;
- evidence validation: `requests/capstone-evidence-scenario.md`;
- delivery: `requests/capstone-delivery-scenario.md`;
- engineering maintenance: `requests/capstone-maintenance-scenario.md`;
- skill authoring: `requests/capstone-authoring-scenario.md`.

## Skill coverage

The manifest maps every top-level skill in this repository to one teaching track and
distinguishes hands-on `practicedSkills` from recognition-only `referenceSkills`.
Compatibility aliases are reference-only:

| Alias | Authority |
| --- | --- |
| `diagnose` | `diagnosing-bugs` |
| `to-prd` | `to-spec` |
| `to-issues` | `to-tickets` |

`grill-me` and `grill-with-docs` are distinct compositions around `grilling`, not compatibility aliases.

Course reports must state these levels separately:

- **practiced**: the learner invoked the Skill and produced inspected evidence;
- **reference-only**: the learner can identify its role or compatibility boundary;
- **unpracticed**: the learner has not completed the owning track.

## Reference route

When the learner asks "which skill should I use?" without starting the academy:

1. identify the desired outcome;
2. name the canonical skill or flow;
3. explain the transition and stop condition;
4. mention an alias only when it helps the learner recognize an older invocation;
5. do not update course progress.
