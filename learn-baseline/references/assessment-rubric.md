# Assessment Rubric

Evaluate demonstrated workflow judgment, not prose polish.

## Dimensions

Score each dimension from 0 to 3:

| Score | Routing | Boundary control | Evidence | Return path | Independence |
| --- | --- | --- | --- | --- | --- |
| 0 | Chooses an unrelated skill | Mixes product, validation, spec, and implementation | Provides no inspectable result | Loses the originating question | Cannot proceed after direct instruction |
| 1 | Reaches a plausible but wrong stage | Notices some boundaries after prompting | Produces an artifact that does not prove the outcome | Names a vague next step | Completes with a worked answer |
| 2 | Chooses the correct skill or flow | Keeps major stages separate | Produces relevant, inspectable evidence | Records an exact owner or resume target | Completes with structural hints |
| 3 | Explains why adjacent routes are wrong | Preserves authority, exclusions, and stop conditions | Selects proportionate evidence and checks it | Maintains a precise bidirectional handoff | Transfers the method to a fresh scenario |

## Passing

A track passes when:

- every checkpoint has accepted evidence;
- no dimension scores 0;
- Routing, Boundary control, and Evidence each score at least 2;
- the total is at least 10 of 15.

The capstone passes at 12 of 15 with no worked-recovery help on its final two checkpoints.

## Track-specific proof

The five scores are shared, but each track must also demonstrate its own non-negotiable
proof. A high generic score cannot compensate for a missing track-specific result.

| Track | Required proof before assessment |
| --- | --- |
| `foundation` | Correctly routes every scenario, identifies repository authority, and preserves one exact resume target |
| `product-discovery` | Keeps terms, facts, assumptions, and user-owned decisions separate; records exactly one active frontier |
| `evidence-validation` | Routes research, prototype, spike, and product decision to distinct evidence and returns each detour to an owner |
| `delivery` | Uses a current bounded receipt, preserves one-owner requirement traceability, produces a red-green result, and reports review findings before summary |
| `engineering-maintenance` | Produces a specific red signal, avoids destructive conflict recovery, and does not turn triage or architecture analysis into unapproved implementation |
| `skill-authoring` | Produces a valid invocation contract, validates an actual draft, tests deterministic scripts, and audits stale names |
| `capstone` | Executes a fresh route, preserves stop conditions, repairs one material weakness, and teaches the causal workflow back |

If any required proof is missing, keep the track incomplete even when the numeric total
would otherwise pass.

## Feedback record

Before running `course.mjs assess`, write a stable assessment artifact at
`learner-artifacts/<track>-assessment.md`. A short summary may also be appended to
`learning-journal.md`, but the per-track artifact is the immutable assessment record:

```markdown
## <track> assessment

- Demonstrated:
- Highest-leverage correction:
- Hint level used:
- Transfer challenge:
- Score: <routing>/<boundary>/<evidence>/<return>/<independence>
```

Do not convert the score into a claim that the learner has mastered every skill in the track.
