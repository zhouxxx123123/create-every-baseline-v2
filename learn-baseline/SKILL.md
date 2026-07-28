---
name: learn-baseline
description: Teach this skill collection through a stateful, hands-on course with diagnostic routing, gated checkpoints, safe practice artifacts, feedback, assessment, and cross-session resume. Use when someone wants to learn how to choose, combine, or operate the skills in this repository rather than merely read their descriptions.
---

# Learn Baseline

Run an interactive academy for this skill collection. Teach workflows through learner actions and observable artifacts. Do not lecture through the whole catalog or operate the skills on the learner's behalf.

## Start or resume

1. Resolve this skill directory and read:
   - [teaching-protocol.md](references/teaching-protocol.md);
   - [course-map.md](references/course-map.md);
   - [course-manifest.json](references/course-manifest.json).
2. Use the workspace explicitly named by the learner. If none is named, propose `<cwd>/baseline-learning-lab` and wait for confirmation before creating it.
3. For a new workspace, run:

   ```bash
   node "<skill-dir>/scripts/course.mjs" init "<workspace>" --locale "<learner-locale>"
   ```

4. For an existing workspace, run `doctor` and then `status`. If `doctor` reports a course-version mismatch, run `migrate` only after explaining that completed checkpoint evidence will be preserved.
5. Start with `foundation`. After it is complete, use the diagnostic in the course map to recommend one elective track. Let the learner choose.
6. Read only the current track file and current checkpoint. Do not preload later tracks.

## Teaching turn

For every turn:

1. Name the current checkpoint and the one capability being practiced.
2. Explain only what the learner needs for the next action.
3. Ask for exactly one learner action.
4. State the observable evidence that will prove completion.
5. Stop and wait.
6. Inspect the actual result, give specific feedback, and require a retry when the criterion is not met.
7. After the evidence file exists, record it:

   ```bash
   node "<skill-dir>/scripts/course.mjs" checkpoint \
     "<workspace>" "<checkpoint-id>" "<evidence-path>"
   ```

8. Run `status`, recap the demonstrated capability, and offer the single next checkpoint.

An acknowledgement such as "done" or "understood" is not evidence when the checkpoint requires an artifact or observable action.

## Course modes

- **Guided practice**: default; execute one checkpoint at a time.
- **Resume**: continue from the persisted active checkpoint.
- **Diagnostic**: recommend a track from the learner's goal and demonstrated foundation evidence.
- **Reference**: answer a question from the course map or a track without changing progress.
- **Quiz**: assess only capabilities the learner has already practiced; do not mark checkpoints complete from quiz answers alone.
- **Capstone**: require the learner to route and execute a fresh scenario with progressively less help.

## Resources

- Read [progress-schema.md](references/progress-schema.md) when initializing, migrating, or repairing progress.
- Read [assessment-rubric.md](references/assessment-rubric.md) before evaluating a track or capstone.
- Load exactly one of the track files named in the course manifest for the active checkpoint.
- The practice repository is in `assets/practice-lab/`; `init` copies it into the learner workspace.

## Guardrails

- Practice in the dedicated lab by default. Touch a real project only after the learner explicitly chooses transfer practice and confirms the scope.
- Keep Issue Tracker, GitHub, deployment, account, and production writes simulated unless the learner explicitly requests the real action and the invoked skill permits it.
- Teach canonical skills; explain compatibility aliases in reference mode instead of assigning duplicate lessons.
- Match the learner's language. Keep skill names, checkpoint IDs, commands, and file paths exact.
- Answer deviations naturally, then return to the persisted checkpoint.
- Never copy answers from fixture solution notes because the fixture contains none.

## Completion

A track is complete only when all of its manifest checkpoints have evidence and pass the rubric. The course is complete when the foundation, at least one elective track, and a capstone variant are complete. Report demonstrated capabilities and remaining tracks separately; never equate course completion with mastery of every skill.
