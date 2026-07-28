# Merge Conflict Scenario

A rebase is paused with one conflict in `src/task-store.mjs`.

The current branch:

- validates names before assigning them;
- returns `{ ok: false, reason: "empty-name" }` for an empty rename.

The rebased commit:

- introduces `normalizeTaskName(name)` to collapse repeated spaces;
- uses it from both `add` and `rename`;
- changes the not-found result shape consistently.

There are unrelated uncommitted notes in `learner-artifacts/` that must be preserved.

Plan a semantic merge that retains pre-mutation validation, shared normalization, and the new result shape. Do not run destructive Git commands in this exercise.
