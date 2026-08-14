---
name: reference-research
description: Research one bounded product or architecture question against fixed external reference implementations, source repositories, specifications, prototypes, or systems. Compare primary-source evidence with the current project's canonical product context, write one cited Markdown report, classify transferability, produce unconfirmed optimization candidates, and return to the originating workflow without making or closing product decisions. Use when the user explicitly requests reference research, code-level cross-project comparison, or evidence-backed design improvement research.
---

# Reference Research

Investigate one bounded question against stable reference identities. Produce evidence and product input, not a product decision.

## Preserve the caller

Before researching, record:

- the exact question;
- the originating workflow or `standalone`;
- the unresolved question and exact resume target;
- the evidence the caller needs;
- the reference targets;
- the only report path allowed for this run.

Keep one question per run. Multiple reference targets may answer the same question.

## Load the contracts

Read these files before collecting evidence:

- [references/evidence-contract.md](references/evidence-contract.md)
- [references/product-decision-boundary.md](references/product-decision-boundary.md)
- [references/report-template.md](references/report-template.md)

For cross-project or product comparison, also read [references/comparison-contract.md](references/comparison-contract.md). Read [references/user-facing-labels.md](references/user-facing-labels.md) when rendering status or evidence labels for the user.

## Prepare the run

Announce that this skill is active and report the proposed report path before writing it.

Normalize the request into JSON with:

```json
{
  "question": "one bounded question",
  "origin": {
    "workflow": "workflow name or standalone",
    "unresolvedQuestion": "the question that caused this detour",
    "resumeTarget": "exact artifact, issue, decision, or conversation"
  },
  "evidenceNeeded": ["evidence the caller needs"],
  "workspace": "absolute project path",
  "referenceTargets": [
    {
      "name": "stable short name",
      "kind": "source-repository",
      "location": "absolute local path or source URL",
      "revision": "immutable revision when known",
      "focus": ["bounded areas"],
      "mustInspect": ["required paths"]
    }
  ],
  "reportPath": "absolute report path",
  "protectedPaths": ["paths that must not change"],
  "researchRoots": ["project research directories"]
}
```

Run:

```powershell
python "<resolved-skill-dir>/scripts/reference_research.py" prepare <request.json> --output <temporary-session.json>
```

Treat the session as a read-only baseline. If it reports `BLOCKED`, report the exact mismatch and stop. Never switch branches, reset files, install dependencies, stage, commit, or push to make the baseline fit.

## Collect primary evidence

Search existing related Research before starting new reading. Build on it only after revalidating material claims against the requested fixed identities.

Use evidence in this order:

1. source code at the fixed revision;
2. static tests at the fixed revision;
3. formal specifications or first-party interfaces;
4. project documentation, labelled as a documentation claim;
5. other first-party material needed for fit assessment.

Read every user-required file completely. For fixed source revisions that differ from the checked-out HEAD, use revision-aware reads such as `git show <revision>:<path>`; do not check out the revision.

Delegate independent targets or evidence questions concurrently when the current runtime permits it. Give each worker only a read-only target and a uniform evidence return shape. The main agent must reread the critical source, reconcile disagreements, and own the final synthesis. When delegation is unavailable, perform the same work sequentially.

Create citations with:

```powershell
python "<resolved-skill-dir>/scripts/reference_research.py" cite `
  --session <temporary-session.json> `
  --target <target-name> `
  --path <repo-relative-path> `
  --lines <start:end>
```

Keep excerpts short. State what each example proves and does not prove.

## Compare without collapsing layers

For code architecture, use the exact vocabulary Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, and Locality.

Compare the same dimension across all targets. Separate:

- actual reference behaviour;
- current product behaviour;
- material difference;
- product impact;
- transfer classification;
- protected product boundary.

Consume the existing domain glossary without changing it. If the research exposes a real terminology or object-relationship decision, return that question to the caller for `domain-modeling`; do not edit the glossary during research.

Do not use a single numeric score to rank systems at different product layers.

## Draft one report

Use [references/report-template.md](references/report-template.md). Include:

- fixed source identities;
- a direct answer;
- an evidence ledger;
- comparison findings;
- transfer assessments;
- independent optimization candidates;
- unverified scope;
- return target;
- workspace changes.

Keep every optimization candidate at `PROPOSED_NOT_CONFIRMED` and display it as `待用户确认`.

## Validate and return

Run:

```powershell
python "<resolved-skill-dir>/scripts/reference_research.py" check `
  --session <temporary-session.json> `
  --report <report.md>
```

Fix report-only validation errors when possible. Never repair an unexpected workspace change by discarding or overwriting it. If the check cannot pass, return `PARTIAL` or `BLOCKED` with the exact reason.

Return a compact receipt containing:

- user-facing research status;
- report path and content identity;
- direct answer;
- finding and candidate IDs;
- unresolved items;
- workspace change summary;
- the exact workflow, target, and question being resumed;
- at most one recommended next workflow.

Do not invoke the next workflow silently. Research completion never confirms a product answer, updates a product baseline, closes a question, creates a Material or Result, or authorizes implementation.
