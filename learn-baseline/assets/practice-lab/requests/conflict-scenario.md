# Merge Conflict Scenario

Run:

```bash
node scripts/prepare-conflict.mjs
```

This creates an isolated nested Git repository at `conflict-lab/` and pauses a merge
with one conflict in `task-store.mjs`. It does not use or modify the outer course
workspace's Git history.

Inspect the active operation, both branch histories, and the conflicting hunk. Recover
both intended behaviors when they are compatible; if they are not, explain the
authority needed to choose. Run validation before completing the merge.

Do not run destructive reset or checkout commands. Do not stage or commit anything in
the outer course workspace.
