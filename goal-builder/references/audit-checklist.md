# Goal Task Package Audit Checklist

## Contents

1. [Scope and authority](#scope-and-authority)
2. [Master prompt](#master-prompt)
3. [Contract and progress](#contract-and-progress)
4. [Stage files](#stage-files)
5. [Research and simulation](#research-and-simulation)
6. [Cross-file consistency](#cross-file-consistency)
7. [Validation and delivery](#validation-and-delivery)

## Scope And Authority

- Confirm the package solves one bounded objective.
- Confirm the originating workflow, current state, and return point from disk.
- List every allowed mutation and ensure no stage writes elsewhere.
- Ensure non-authoritative outputs cannot be discovered as formal tracker artifacts.
- Ensure later stages do not silently answer questions reserved for a human.

## Master Prompt

- Verify every referenced skill exists and has the role assigned to it.
- Verify detailed work lives in linked stage files rather than duplicating the master prompt.
- Use absolute local Markdown links because the prompt may be copied out of its source file.
- State automatic progression, blocker behavior, authority freeze, and final return behavior.
- Ensure it does not require unnecessary user approval between non-authoritative stages.

## Contract And Progress

- Check authority hierarchy, output collision policy, run identity, input hashing, and concurrent-change handling.
- Check task-instruction identity excludes mutable progress state.
- Check resumability requires evidence revalidation, not just a status label.
- Check progress tracks each dynamic artifact separately after discovery.
- Check warnings and evidence degradation are separate from errors.

## Stage Files

For every stage, verify goal, inputs, method, output, completion, failure, and next handoff.

- No stage may depend on an artifact produced later.
- No stage may write an artifact owned by another stage or background task.
- Independent tasks may run in parallel only with disjoint writable paths.
- Synthesis waits for all required research and citation spot-checks.
- Validation discovers canonical repository commands instead of guessing them.

## Research And Simulation

- Each bounded research task has one question, one report, one return point, and primary evidence.
- Source identity, license, dirty state, tests, negative-evidence scope, and evidence strength are recorded.
- Research recommendations do not become formal answers.
- Simulation has local-only IDs, branch assumptions, alternatives, dependencies, and a stopping rule.
- Human migration re-reads current authority and waits for explicit answers one question at a time.

## Cross-File Consistency

- Master stage order equals README order, stage navigation, and progress-table order.
- All paths match the allowed mutation list exactly.
- All existing-file references are Markdown links and resolve.
- Master-prompt links are absolute; internal links are relative.
- Templates do not require a writer to modify an artifact it is forbidden to edit.
- Hash fields do not require a file to contain its own final hash.
- Formal counts and authority files are unchanged unless explicitly authorized.

## Validation And Delivery

Run `validate_goal_package.py --strict`, repository-native validators, Markdown checks, relative-link checks, and `git diff --check`.

Before delivery:

- attribute all modified paths against the starting snapshot;
- report errors separately from warnings;
- state whether the Goal was merely built or actually executed;
- provide the master prompt as one copyable Markdown block;
- do not stage, commit, or push unless explicitly requested.
