# Progress Contract

Progress lives in `<workspace>/.learn-baseline/progress.json`, never in the installed skill directory.

## Identity

- `schemaVersion`: progress file format.
- `courseId`: must match the manifest.
- `courseVersion`: curriculum version last migrated to.
- `manifestDigest`: SHA-256 identity of the manifest last admitted.
- `locale`: learner-facing language.

## Learning state

- `activeTrack`: the track currently being taught.
- `activeCheckpoint`: the next incomplete checkpoint in that track, or `null`.
- `checkpoints`: completion records keyed by stable checkpoint ID.
- `completedTracks`: derived list; the script recalculates it from checkpoint records.
- `retiredCheckpoints`: preserved historical records whose IDs no longer exist after migration.
- `history`: append-only course actions such as initialization, routing, completion, and migration.

Each completion record contains:

- completion timestamp;
- workspace-relative evidence path;
- SHA-256 of the evidence file at completion;
- track ID and checkpoint title from the current manifest.

The hash proves which evidence was reviewed; it does not prove the evidence was pedagogically sufficient. The instructor still applies the rubric before recording completion.

## Invariants

1. Every completed checkpoint exists in the admitted manifest or `retiredCheckpoints`.
2. Evidence resolves inside the course workspace and is a regular file.
3. A checkpoint belongs to exactly one track.
4. A track is complete only when all current manifest checkpoints are complete.
5. The capstone does not imply completion of unpracticed elective tracks.
6. Migration preserves matching checkpoint records and never invents new completions.

Use `course.mjs doctor` to check these invariants and `course.mjs migrate` to admit a newer manifest without discarding historical evidence.
