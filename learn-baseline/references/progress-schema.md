# Progress Contract

Progress lives in `<workspace>/.learn-baseline/progress.json`, never in the installed skill directory.

## Identity

- `schemaVersion`: progress file format. Version 2 separates submission, acceptance, and track assessment.
- `courseId`: must match the manifest.
- `courseVersion`: curriculum version last migrated to.
- `manifestDigest`: SHA-256 identity of the manifest last admitted.
- `locale`: learner-facing language.

## Learning state

- `activeTrack`: the track currently being taught.
- `activeCheckpoint`: the next incomplete checkpoint in that track, or `null`.
- `checkpoints`: submission and review records keyed by stable checkpoint ID.
- `assessments`: track-level rubric results keyed by track ID.
- `completedTracks`: derived list; the script recalculates it from accepted checkpoints and passing assessments.
- `retiredCheckpoints`: preserved historical records whose IDs no longer exist after migration.
- `retiredAssessments`: preserved assessments invalidated by curriculum changes, resubmission, or reassessment.
- `history`: append-only course actions such as initialization, routing, completion, and migration.

Each checkpoint record contains:

- status: `submitted`, `needs-revision`, or `accepted`;
- submission timestamp and optional review timestamp;
- workspace-relative evidence path;
- SHA-256 of the evidence file at submission;
- digest of the checkpoint requirements that were reviewed;
- track ID and checkpoint title from the current manifest.
- review verdict, hint level, and evidence-specific feedback after review.

The evidence hash proves what was submitted. The requirement digest proves which
version of the checkpoint was reviewed. Neither replaces instructor judgment.
`submit` never advances the learner; only `review pass` accepts a checkpoint.

Each track assessment contains the five rubric scores, total, evidence-based feedback,
assessment timestamp, pass state, a stable assessment-record path and hash, and a
digest of the current track and rubric.

## Invariants

1. Every submitted checkpoint exists in the admitted manifest or `retiredCheckpoints`.
2. Evidence resolves inside the course workspace and is a regular file.
3. Evidence uses the checkpoint's unique manifest path and cannot be reused by another checkpoint.
4. A checkpoint belongs to exactly one track.
5. Accepted evidence must retain its submitted hash and current requirement digest.
6. A track is complete only when all checkpoints are accepted and its assessment passes.
7. The capstone does not imply completion of unpracticed elective tracks.
8. Migration preserves artifacts but invalidates acceptance when requirements changed.

Use `course.mjs doctor` to check these invariants and `course.mjs migrate` to admit a newer manifest without discarding historical evidence.
