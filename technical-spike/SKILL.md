---
name: technical-spike
description: Validate one material technical uncertainty with the smallest safe experiment before it is allowed to shape a product specification or implementation plan, then return to the workflow and unresolved question that requested the validation. Use when a product, architecture, integration, data, security, performance, or platform assumption cannot be resolved reliably through discussion, existing evidence, or design work alone. Produce real evidence, a feasible, not feasible, or inconclusive verdict, a fallback, and explicit effects on the product, specification, tickets, and tests. Do not use for ordinary implementation details, general research summaries, product completeness reviews, or full feature development.
---

# Technical Spike

Resolve one material technical uncertainty with a time-boxed, evidence-producing validation. Plan and run the smallest safe experiment that can answer the question. Do not stop after generating a blank spike document.

This skill may be used before a project has production code. Existing code is evidence when available, not a prerequisite.

## Confirm that a technical spike is needed

Use this skill only when all of the following are true:

- the uncertainty could change the product design, specification, architecture, privacy or security boundary, delivery plan, or acceptance criteria;
- discussion, approved product material, existing code inspection, or reliable documentation cannot settle it;
- an interface call, real sample, focused proof of concept, benchmark, compatibility check, or other minimal experiment can produce better evidence.

Do not use it for:

- deciding whether the product workflow, business fields, states, permissions, or cross-feature behavior is complete;
- ordinary implementation choices that do not change the product contract;
- broad technology research without a decision to unblock;
- initial UI or interaction exploration that belongs in `prototype`;
- building the production feature.

If the question is still a product question, return it to the product-readiness workflow. For example:

- "Which fields does an approval require?" is a product question.
- "Can the target API provide those fields with the required guarantees?" is a technical-spike question.

## Establish the constraint and one question

Read the repository instructions and authoritative product sources that define the requirement. These may include approved requirements, prototypes, decisions, business constraints, or specifications. If implementation already exists, also inspect the relevant code and configuration.

Write one primary validation question. Split unrelated unknowns into separate spikes.

Record:

- the originating workflow or skill, or `standalone` when there is none;
- the exact unresolved question that caused the workflow to detour into this spike;
- the artifact, conversation, issue, or spec the originating workflow must resume from;
- the question;
- the current hypothesis;
- why the answer could change the product or delivery contract;
- the decision that this validation must enable;
- the smallest evidence that would be sufficient.

Do not treat an approved requirement as proof that a technical mechanism is feasible.

## Plan the smallest safe validation

Define before running the experiment:

- the minimal validation method;
- required data, interfaces, accounts, environments, or samples;
- a timebox proportionate to the decision;
- explicit success and failure criteria;
- safety, privacy, cost, and external-system boundaries;
- the fallback if the hypothesis fails.

Avoid building a general framework or production-quality implementation. Prefer one API call, one representative data sample, one isolated compatibility test, or one focused proof of concept when that is enough.

If the validation would mutate a real external system, use sensitive or production data, incur material cost, change production code, or perform another risky action, obtain explicit user approval first.

## Gather evidence in the right order

Use the strongest available evidence for the question:

1. approved product requirements, prototypes, and business constraints to define what must be supported;
2. official documentation, interface definitions, source code, and real samples from the target system;
3. an independent minimal experiment;
4. relevant industry practice, followed by a plain-language fit assessment for this product and context;
5. community experience only as supporting evidence.

When existing project code is available, inspect it as additional evidence. When it is not available, validate in an isolated experiment instead of blocking solely because the project is new.

For external technical questions, prefer primary sources. Distinguish documented behavior from behavior observed in the current experiment.

## Execute without starting implementation

Run the planned validation and preserve reproducible evidence, such as:

- request and response samples with secrets removed;
- input data and resulting output;
- commands, versions, and environment conditions;
- focused test or benchmark results;
- screenshots or recordings when visible behavior matters;
- relevant official-source links;
- a minimal proof-of-concept path or commit when it must be retained.

Keep experimental code in a repository-declared spike area, a scratch location, a temporary directory, or an isolated branch. Do not mix it into production code unless the user explicitly changes the task from validation to implementation.

Do not claim feasibility from documentation alone when the uncertainty specifically concerns real behavior that can be tested safely.

## Choose a verdict

Use exactly one verdict:

- `FEASIBLE` - the success criteria were met with sufficient evidence.
- `NOT_FEASIBLE` - the failure criteria were met or a required capability is demonstrably unavailable.
- `INCONCLUSIVE` - the evidence is insufficient, conflicting, inaccessible, or outside the approved timebox.

Do not convert `INCONCLUSIVE` into a positive assumption. State what evidence is missing and whether another smaller validation could obtain it.

## Persist the validation record

Follow the repository's declared documentation convention. If none exists, write one Markdown file per spike under:

```text
docs/spikes/<short-kebab-name>.md
```

Use this minimum structure:

```text
Title:
Status: PLANNED | IN_PROGRESS | COMPLETE
Verdict: FEASIBLE | NOT_FEASIBLE | INCONCLUSIVE

Originating workflow:
Originating question:
Return target:

Question:
Current hypothesis:
Why it matters:
Decision this must enable:

Minimal validation method:
Required data, interfaces, or samples:
Timebox:
Success criteria:
Failure criteria:
Safety boundaries:

Evidence:
Observed result:
Verdict and reason:
Fallback:

Product impact:
Specification impact:
Ticket impact:
Test impact:
Not validated:
```

Keep experiment details and evidence in the spike record. Do not put technical experiment conclusions into `CONTEXT.md`; use that document for domain language, product boundaries, and ambiguity resolution. If an accepted conclusion creates a durable architecture decision, summarize the decision in the repository's ADR location and link back to the spike evidence.

Validate the record after creating or updating it:

```bash
node "<resolved-technical-spike-skill-dir>/scripts/validate-spike-record.mjs" \
  <spike-record.md>
```

Before returning to the originating workflow, rerun with `--require-complete`. The strict check requires a canonical verdict, reproducible evidence, observed result, fallback, downstream impacts, explicit unvalidated scope, and an exact return target. It validates record completeness, not the truth of the experiment or the user's product decision.

## Return to the originating workflow

A technical spike is a bounded detour, not a replacement main flow. After recording the verdict, always return to the originating workflow and resume the exact unresolved question recorded at the start. Report the spike record by path or URL so the caller can use the evidence without copying the whole experiment.

Use these return rules:

- Origin `grill-with-docs` or `grill-me`: return to the same grilling question, present what the evidence changes, and let the user complete the product decision. A `FEASIBLE` verdict must not jump directly to `to-spec` while that decision is still open.
- Origin `product-readiness`: return to Product Readiness so it can reassess the blocking uncertainty and choose the next single step.
- Origin `to-spec`: return to the same specification and incorporate only the verified constraint, fallback, and acceptance implications.
- Origin `wayfinder`, `prototype`, or another declared workflow: return to that workflow's recorded question or decision ticket before taking any downstream action.
- Origin `standalone`: report the verdict and recommend one explicit next workflow; do not invoke it silently.

The verdict changes what the originating workflow can decide:

- `FEASIBLE`: the caller may use the verified constraints and acceptance implications, but still completes its own open decision or readiness gate.
- `NOT_FEASIBLE`: the caller must choose a fallback or change the scope before specification.
- `INCONCLUSIVE`: the caller must choose another bounded validation, explicitly pause the affected scope, or choose a fallback that does not depend on the unresolved assumption.

A material technical uncertainty must not silently pass into `to-spec`. The workflow may continue only when the uncertainty is resolved or the chosen product scope explicitly no longer depends on it.

Specifications, tickets, and tests affected by the result must link to the spike and inherit the relevant verified constraint, fallback, and acceptance condition. Do not copy the entire experiment log into each downstream artifact.

## Report in plain language

End with:

```text
Technical validation:
Originating workflow:
Originating question:
Question:
Experiment performed:
Evidence:
Verdict: FEASIBLE | NOT_FEASIBLE | INCONCLUSIVE
Plain-language reason:
Fallback:
Product/spec/ticket/test effects:
Record:
Returned to:
Resumed question:
```

Do not infer the user's preferred verdict. Report what the evidence supports.
