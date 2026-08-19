---
name: goal-builder
description: Build and audit rigorous, resumable Goal task packages with staged prompts, evidence gates, authority boundaries, progress tracking, safe automation, and deterministic validation. Use when a user asks to create, split, harden, review, or repair a complex Goal prompt or multi-stage autonomous task package.
---

# Goal Builder

Turn a complex objective into a task package that another Codex run can execute safely without flattening specialist skill behavior or confusing provisional outputs with authority.

## Choose The Mode

- **Create**: build a new task package from an objective.
- **Audit**: inspect every existing package file, repair defects, and validate cross-file consistency.
- **Extend**: add or reorder stages only after re-evaluating dependencies, recovery, and authority boundaries.

Do not execute the generated Goal unless the user separately asks to run it.

## Build The Package

1. Read repository instructions, Git status, the originating workflow, authority sources, and the requested output boundary.
2. Identify the exact objective, return target, evidence requirements, allowed mutations, forbidden mutations, blockers, and final human decision.
3. Read [design-standard.md](references/design-standard.md) before designing stages.
4. Build a dependency graph. Make a stage only when it has a distinct input, method, artifact, completion gate, failure gate, and next handoff.
5. Default to `.scratch/<goal-slug>/` when the user does not specify a package location. Refuse to overwrite an existing nonempty target.
6. Use `scripts/create_goal_package.py` for the initial scaffold, then customize every placeholder from current repository facts.
7. Keep the master prompt concise. Put detailed work in linked stage files and templates.
8. Run the audit workflow and repository-native validators before delivery.

Example scaffold:

```bash
python3 "<goal-builder-skill-root>/scripts/create_goal_package.py" \
  --root /absolute/repository/path \
  --slug example-goal \
  --title "Example Goal" \
  --stage "Authority State Check" \
  --stage "Bounded Research" \
  --stage "Synthesis" \
  --stage "Validation and Return"
```

## Audit The Package

Read [audit-checklist.md](references/audit-checklist.md). Review files in this order:

1. master prompt, contract, and progress model;
2. stages in dependency order;
3. templates and generated-artifact rules;
4. all links, paths, identities, completion gates, and mutation boundaries;
5. repository validators and final return wording.

Fix defects while auditing when the user has authorized edits. Never broaden formal product scope just to make the package appear complete.

Run the package validator:

```bash
python3 "<goal-builder-skill-root>/scripts/validate_goal_package.py" \
  /absolute/path/to/package --strict
```

## Preserve Skill Autonomy

- Name one flow-owning skill per stage when possible. Treat vocabulary or analysis skills as supporting layers, not competing orchestrators.
- Give specialist skills minimum evidence, artifacts, and safety boundaries; do not prescribe their reasoning method.
- Keep independent research tasks separate. Parallelize only when inputs and writable outputs do not overlap, then wait for all before synthesis.
- Never use a human-interview skill to let AI ask and answer its own authoritative questions.

## Preserve Authority

- Separate facts, research recommendations, simulations, and formal decisions.
- Keep formal tickets, maps, baselines, glossaries, and specifications unchanged unless the user explicitly authorizes them.
- Store simulations outside formal tracker roots and mark them non-authoritative.
- Require explicit human confirmation before promoting a simulated answer into an authoritative workflow.
- Stop on incompatible authority changes, unsafe output collisions, missing required evidence, or validation errors.

## File Reference Rules

- In a master prompt intended for copy/paste, use absolute local Markdown links.
- Inside a package, use relative Markdown links for existing files.
- Use code formatting for commands, identifiers, and not-yet-created artifact paths.
- Validate every local link before delivery.

## Deliver

Return the master prompt as a copyable Markdown block, summarize the package and validation results, disclose any warning or unresolved placeholder, and state that the Goal has not been executed unless it actually has.
