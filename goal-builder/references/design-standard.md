# Goal Task Package Design Standard

## Contents

1. [Package anatomy](#package-anatomy)
2. [Contract design](#contract-design)
3. [Stage design](#stage-design)
4. [Skill routing](#skill-routing)
5. [Evidence and identity](#evidence-and-identity)
6. [Automation and human gates](#automation-and-human-gates)
7. [Output and reference rules](#output-and-reference-rules)
8. [Failure and recovery](#failure-and-recovery)

## Package Anatomy

Use this minimum structure for a complex Goal:

```text
<goal-package>/
├── README.md
├── GOAL-PROMPT.md
├── 00-goal-contract.md
├── 01-<stage>.md
├── ...
├── NN-validation-and-return.md
├── progress.md
├── templates/               # only when generated artifacts need structure
└── outputs/                 # only for non-authoritative package-local outputs
```

Do not create a multi-file package for a short, linear task that can be expressed safely in one prompt. A package is justified when the work has multiple evidence gates, independent research, long-running recovery, multiple artifacts, or authority-sensitive simulation.

## Contract Design

The contract must state:

- one bounded objective;
- originating workflow and exact return point;
- authority hierarchy;
- skill-routing ownership;
- stage order and gates;
- run identity, resumability, and idempotency;
- concurrent-change policy;
- exhaustive allowed mutation set;
- explicit forbidden actions;
- final human decision boundary.

Allowed mutations must be path-addressable. Avoid vague phrases such as “related files.” Dynamic outputs need a deterministic naming rule and collision policy.

## Stage Design

Every stage must contain:

- **Goal**: one result, not a list of unrelated activities.
- **Inputs**: existing files or prior-stage artifacts with identities.
- **Method**: minimum evidence and safety constraints without dictating all reasoning.
- **Output**: one or more exact artifacts and their authority status.
- **Completion conditions**: mechanically or evidentially verifiable.
- **Failure conditions**: states that stop or return to an earlier stage.
- **Next handoff**: one explicit next stage or return target.

Order stages by dependency, not by narrative convenience. Research must finish before synthesis; synthesis and authority mapping must finish before simulation; all artifacts must finish before final validation.

Do not use a fixed stage count. Add a stage only when combining it with an adjacent stage would blur evidence ownership, mutation rights, or completion criteria.

## Skill Routing

Choose the flow owner from the work being performed:

- investigation against sources: research;
- user decision interview: grilling or another human-in-the-loop workflow;
- product readiness routing: product-readiness;
- domain vocabulary and invariants: domain-modeling;
- code architecture vocabulary: codebase-design;
- route and ticket state: wayfinder.

Do not invoke every potentially useful skill in the master prompt. A supporting skill may contribute vocabulary or checks beneath the flow-owning skill. Respect each skill’s own contract, especially background-research and human-answer requirements.

## Evidence And Identity

At run start record:

- run ID, branch, HEAD, and timestamp;
- task-instruction identity, excluding mutable progress state;
- authority-source identities;
- existing worktree path set;
- output collision status;
- validator command identities.

At each stage boundary record input identity, output hash, checks, warnings, blocker, and safe resume point. Recheck direct inputs before generating an artifact. Never merge evidence from incompatible source identities.

Separate source facts, tests, documentation claims, inference, recommendation, simulation, and formal answer. “Not found” must include the reviewed scope and must not be stated as proof of nonexistence.

## Automation And Human Gates

The Goal may automatically run all non-authoritative stages without asking for approval between stages. Stop only for a real blocker or an explicit contract gate.

Automation must not silently confirm product choices, security exceptions, irreversible operations, or formal ticket answers. A shadow or simulated answer may continue a branch only when clearly marked non-authoritative and preserved with alternatives.

The final return should ask one concise question that hands control back to the originating workflow.

## Output And Reference Rules

- Master prompts copied into another conversation use absolute local Markdown links.
- Package-internal navigation uses relative Markdown links.
- Existing authority files should be linked; future artifacts remain code-formatted paths until created.
- Each file has one H1, no heading-level jumps, a final newline, and no trailing whitespace.
- A non-authoritative package must not contain tracker-recognizable formal status or answer headings.
- Research reports belong in the repository’s configured reference location. Simulations do not masquerade as research.

For Chinese-facing repositories, apply the repository’s bilingual terminology rule to user-facing text and persisted reports.

## Failure And Recovery

Use states such as `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, and `BLOCKED`. A status is evidence-backed, not a progress estimate.

Resume only from the last verified completed stage. Before resuming, revalidate task instructions, direct inputs, existing outputs, and authority state. Return to the earliest affected stage after a compatible change; stop after an incompatible authority change.

When context or execution limits threaten evidence quality, persist at a stage boundary and resume later. Do not compress research, skip citation checks, or collapse independent tasks merely to finish one run.
