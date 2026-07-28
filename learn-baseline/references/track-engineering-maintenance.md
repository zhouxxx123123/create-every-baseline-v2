# Engineering Maintenance Track

Teach the learner to create reliable feedback, triage raw work, find deepening opportunities, and recover safely from merge conflicts.

## EM-01: Build a red feedback loop

**Outcome:** The learner can reproduce the fixture bug with one command before proposing a fix.

**Concept:** A diagnosis starts with a trustworthy red signal at a public seam. Hypotheses consume the loop; they do not replace it.

**Skill practice:** Invoke `diagnosing-bugs` and build a real failing regression signal. `diagnose` is only a compatibility name.

**Learner action:** Read `requests/bug-report.md`, invoke `diagnosing-bugs`, inspect `src/task-store.mjs`, and run the existing tests. Add the smallest regression test that fails on this bug. Create `learner-artifacts/maintenance-bug-loop.md` with command, captured red output, seam, minimized fixture, hypotheses, and why the signal is specific.

**Evidence:** `learner-artifacts/maintenance-bug-loop.md`

**Hint ladder:** Ask for the smallest public call that reproduces the report. Point to the test file. Provide a test skeleton only after an attempt.

**Feedback focus:** Catch diagnosis before reproduction, broad failing suites, private-method tests, and fixes without a regression signal.

**Advance when:** One repeatable command goes red for the reported behavior and would go green only when that behavior is corrected.

**Next:** `EM-02`

## EM-02: Identify a deepening opportunity

**Outcome:** The learner can describe an architecture improvement in terms of interface depth, seam, leverage, and locality.

**Concept:** Architecture maintenance looks for behavior spread across callers or shallow interfaces. It produces an improvement candidate, not an unapproved rewrite.

**Skill practice:** Use `codebase-design` vocabulary to inspect the seam, then invoke `improve-codebase-architecture` in report-only mode without applying a refactor.

**Learner action:** Inspect the fixture module and bug path with `codebase-design`, run `improve-codebase-architecture` in report-only mode, and create `learner-artifacts/maintenance-architecture.md` with current interface, implementation knowledge leaked to callers, proposed seam, deeper interface, expected leverage, migration risk, and a question to grill before changing it.

**Evidence:** `learner-artifacts/maintenance-architecture.md`

**Hint ladder:** Ask what every caller must know. Provide the deep-module vocabulary. Show an unrelated shallow wrapper example.

**Feedback focus:** Catch vague "clean code" claims, layer creation without leverage, and refactors that bundle product behavior.

**Advance when:** The proposal names a concrete seam and explains how the interface becomes smaller relative to behavior.

**Next:** `EM-03`

## EM-03: Triage a raw request

**Outcome:** The learner can turn an incoming issue into a durable agent-ready brief or route it for missing information.

**Concept:** Triage categorizes and verifies external requests. It does not silently redesign them or send generated implementation tickets back through raw triage.

**Skill practice:** Invoke `triage` against the local raw request without writing to an external tracker.

**Learner action:** Read `requests/raw-issue.md`, invoke `triage` in local-output mode, and create `learner-artifacts/maintenance-triage.md` with request type, verification evidence, missing information, selected triage state, durable brief, and the condition that makes it ready.

**Evidence:** `learner-artifacts/maintenance-triage.md`

**Hint ladder:** Ask whether the report is reproducible and bounded. Provide the triage headings. Demonstrate separating a symptom from a requested solution.

**Feedback focus:** Catch invented reproduction, premature ready labels, missing AI disclaimer for tracker output, and implementation details presented as confirmed requirements.

**Advance when:** The selected state follows the evidence and the brief gives the next actor enough context without inventing authority.

**Next:** `EM-04`

## EM-04: Resolve an isolated merge conflict safely

**Outcome:** The learner can inspect, resolve, validate, and complete an in-progress merge without discarding unrelated changes.

**Concept:** Conflict resolution preserves both sides' intent, repository status, and operation identity. It avoids destructive reset and interactive Git when a deterministic command exists.

**Skill practice:** Create the isolated nested conflict and invoke `resolving-merge-conflicts` against that real in-progress merge.

**Learner action:** Read `requests/conflict-scenario.md`, run its preparation script, and invoke `resolving-merge-conflicts` only inside `conflict-lab/`. Resolve and complete the merge, then create `learner-artifacts/maintenance-conflict-recovery.md` with inspection commands, conflict classification, intent from each side, merged result, validation commands, resulting commit identity, and proof that the outer workspace was untouched.

**Evidence:** `learner-artifacts/maintenance-conflict-recovery.md`

**Hint ladder:** Ask which Git operation is active. Provide inspect/classify/resolve/validate/continue headings. Demonstrate why `git checkout --` would be unsafe.

**Feedback focus:** Catch destructive commands, unresolved semantic conflict, validation after continuation instead of before, and loss of unrelated changes.

**Advance when:** The nested merge is complete, validation passes, both compatible intents are preserved, and the outer workspace remains unchanged.

**Next:** Run the maintenance assessment or begin a maintenance capstone.
