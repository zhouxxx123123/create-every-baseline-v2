#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const skillRoot = resolve(skillDir, "..");
const manifestPath = join(skillDir, "references", "course-manifest.json");
const rubricPath = join(skillDir, "references", "assessment-rubric.md");
const fixtureDir = join(skillDir, "assets", "practice-lab");
const progressDirectoryName = ".learn-baseline";
const progressFileName = "progress.json";

const [command, workspaceArgument, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case "init":
      initWorkspace(requiredWorkspace(workspaceArgument), option(rest, "--locale"));
      break;
    case "doctor":
      doctor(requiredWorkspace(workspaceArgument));
      break;
    case "status":
      status(requiredWorkspace(workspaceArgument));
      break;
    case "tracks":
      tracks(requiredWorkspace(workspaceArgument));
      break;
    case "route":
      routeTrack(requiredWorkspace(workspaceArgument), required(rest[0], "track ID"));
      break;
    case "submit":
    case "checkpoint":
      submitCheckpoint(
        requiredWorkspace(workspaceArgument),
        required(rest[0], "checkpoint ID"),
        required(rest[1], "evidence path"),
      );
      break;
    case "review":
      reviewCheckpoint(
        requiredWorkspace(workspaceArgument),
        required(rest[0], "checkpoint ID"),
        required(rest[1], "verdict"),
        option(rest, "--hint"),
        option(rest, "--feedback"),
      );
      break;
    case "assess":
      assessTrack(
        requiredWorkspace(workspaceArgument),
        required(rest[0], "track ID"),
        required(rest[1], "scores"),
        option(rest, "--record"),
        option(rest, "--feedback"),
      );
      break;
    case "migrate":
      migrate(requiredWorkspace(workspaceArgument));
      break;
    default:
      usage();
      process.exitCode = 2;
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

function usage() {
  console.log(`Usage:
  node course.mjs init <workspace> [--locale <locale>]
  node course.mjs doctor <workspace>
  node course.mjs status <workspace>
  node course.mjs tracks <workspace>
  node course.mjs route <workspace> <track-id>
  node course.mjs submit <workspace> <checkpoint-id> <evidence-path>
  node course.mjs review <workspace> <checkpoint-id> <pass|retry> --hint <level> --feedback <text>
  node course.mjs assess <workspace> <track-id> <routing,boundary,evidence,return,independence> --record <path> --feedback <text>
  node course.mjs migrate <workspace>`);
}

function initWorkspace(workspace, requestedLocale) {
  const manifestState = loadManifest();
  assertSafeNewWorkspace(workspace);
  mkdirSync(workspace, { recursive: true });
  copyDirectory(fixtureDir, workspace);
  mkdirSync(join(workspace, progressDirectoryName), { recursive: true });

  const firstTrack = manifestState.manifest.tracks.find(
    (track) => track.kind === "foundation",
  );
  if (!firstTrack) {
    throw new Error("Course manifest has no foundation track.");
  }

  const now = new Date().toISOString();
  const progress = {
    schemaVersion: 2,
    courseId: manifestState.manifest.courseId,
    courseVersion: manifestState.manifest.courseVersion,
    manifestDigest: manifestState.digest,
    locale: requestedLocale || manifestState.manifest.defaultLocale || "en",
    createdAt: now,
    updatedAt: now,
    activeTrack: firstTrack.id,
    activeCheckpoint: firstTrack.checkpoints[0]?.id ?? null,
    checkpoints: {},
    assessments: {},
    completedTracks: [],
    retiredCheckpoints: {},
    retiredAssessments: {},
    history: [
      {
        at: now,
        action: "initialized",
        track: firstTrack.id,
      },
    ],
  };

  writeProgress(workspace, progress);
  const journalPath = join(workspace, "learning-journal.md");
  if (!existsSync(journalPath)) {
    writeFileSync(
      journalPath,
      "# Learning Journal\n\nCourse reflections and track assessments live here.\n",
    );
  }

  console.log(`Course workspace initialized: ${workspace}`);
  console.log(`Active track: ${firstTrack.id}`);
  console.log(`Next checkpoint: ${progress.activeCheckpoint}`);
}

function doctor(workspace) {
  const manifestState = loadManifest();
  const progress = readProgress(workspace);
  const errors = [];

  if (progress.schemaVersion !== 2) {
    errors.push(
      `Progress schema ${progress.schemaVersion} requires migration to schema 2.`,
    );
  }
  if (progress.courseId !== manifestState.manifest.courseId) {
    errors.push(
      `Course ID mismatch: ${progress.courseId} != ${manifestState.manifest.courseId}`,
    );
  }
  if (
    progress.courseVersion !== manifestState.manifest.courseVersion ||
    progress.manifestDigest !== manifestState.digest
  ) {
    errors.push(
      `Course version is stale. Run migrate for ${manifestState.manifest.courseVersion}.`,
    );
  }
  if (!existsSync(join(workspace, "README.md"))) {
    errors.push("Practice lab README.md is missing.");
  }
  errors.push(...skillContractErrors(manifestState.manifest));

  const checkpointIndex = indexCheckpoints(manifestState.manifest);
  for (const [checkpointId, completion] of Object.entries(
    progress.checkpoints ?? {},
  )) {
    if (!checkpointIndex.has(checkpointId)) {
      errors.push(`Completed checkpoint is not in current course: ${checkpointId}`);
      continue;
    }
    const indexed = checkpointIndex.get(checkpointId);
    try {
      const evidence = resolveEvidence(workspace, completion.evidence);
      const currentHash = hashFile(evidence.absolute);
      if (currentHash !== completion.sha256) {
        errors.push(`Evidence changed after submission: ${checkpointId}`);
      }
      const requirementDigest = checkpointRequirementDigest(
        indexed.track,
        indexed.checkpoint,
      );
      if (completion.requirementDigest !== requirementDigest) {
        errors.push(`Checkpoint requirements changed: ${checkpointId}`);
      }
    } catch (error) {
      errors.push(`${checkpointId}: ${error.message}`);
    }
  }

  for (const [trackId, assessment] of Object.entries(
    progress.assessments ?? {},
  )) {
    const track = manifestState.manifest.tracks.find(
      (candidate) => candidate.id === trackId,
    );
    if (!track) {
      errors.push(`Assessment references unknown track: ${trackId}`);
      continue;
    }
    if (assessment.requirementDigest !== trackRequirementDigest(track)) {
      errors.push(`Track assessment requirements changed: ${trackId}`);
    }
    try {
      const record = resolveEvidence(workspace, assessment.record);
      if (hashFile(record.absolute) !== assessment.recordSha256) {
        errors.push(`Track assessment record changed: ${trackId}`);
      }
    } catch (error) {
      errors.push(`${trackId} assessment: ${error.message}`);
    }
  }

  const derived = deriveState(manifestState.manifest, progress);
  if (!manifestState.manifest.tracks.some((track) => track.id === progress.activeTrack)) {
    errors.push(`Unknown active track: ${progress.activeTrack}`);
  } else if (progress.activeCheckpoint !== derived.activeCheckpoint) {
    errors.push(
      `Active checkpoint is inconsistent: ${progress.activeCheckpoint} != ${derived.activeCheckpoint}`,
    );
  }
  if (!sameStrings(progress.completedTracks ?? [], derived.completedTracks)) {
    errors.push("Completed track list is inconsistent with checkpoint evidence.");
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    throw new Error(`Course workspace failed doctor with ${errors.length} issue(s).`);
  }

  console.log("Course workspace is healthy.");
  console.log(`Course version: ${manifestState.manifest.courseVersion}`);
  console.log(`Accepted checkpoints: ${acceptedCheckpointCount(progress)}`);
  console.log(`Submitted checkpoints: ${Object.keys(progress.checkpoints).length}`);
  const coverage = completedSkillCoverage(
    manifestState.manifest,
    derived.completedTracks,
  );
  console.log(`Practiced skills demonstrated: ${coverage.practiced.length}`);
  console.log(`Reference-only skills encountered: ${coverage.reference.length}`);
  console.log(
    `Completed electives: ${coverage.completedElectives}/${coverage.totalElectives}`,
  );
}

function status(workspace) {
  const manifestState = loadManifest();
  const { manifest, digest } = manifestState;
  const progress = readProgress(workspace);
  const derived = deriveState(manifest, progress);
  const stale =
    progress.courseVersion !== manifest.courseVersion ||
    progress.manifestDigest !== digest;
  if (!stale && progress.schemaVersion === 2) {
    const contractErrors = skillContractErrors(manifest);
    if (contractErrors.length > 0) {
      throw new Error(contractErrors[0]);
    }
    assertProgressEvidenceIntegrity(workspace, manifest, progress);
  }

  console.log(`Course: ${progress.courseId}`);
  console.log(`Installed version: ${manifest.courseVersion}`);
  console.log(`Progress version: ${progress.courseVersion}`);
  console.log(`Version status: ${stale ? "STALE - run migrate" : "CURRENT"}`);
  console.log(`Locale: ${progress.locale}`);
  console.log(`Active track: ${progress.activeTrack}`);
  const activeTrack = manifest.tracks.find(
    (track) => track.id === progress.activeTrack,
  );
  const awaitingAssessment =
    activeTrack &&
    derived.activeCheckpoint === null &&
    !derived.completedTracks.includes(activeTrack.id);
  console.log(
    `Next checkpoint: ${
      derived.activeCheckpoint ??
      (awaitingAssessment ? "track assessment required" : "track complete")
    }`,
  );
  console.log(
    `Completed tracks: ${derived.completedTracks.join(", ") || "none"}`,
  );
  console.log(`Accepted checkpoints: ${acceptedCheckpointCount(progress)}`);
  console.log(`Submitted checkpoints: ${Object.keys(progress.checkpoints).length}`);
  const coverage = completedSkillCoverage(manifest, derived.completedTracks);
  console.log(`Practiced skills demonstrated: ${coverage.practiced.length}`);
  console.log(`Reference-only skills encountered: ${coverage.reference.length}`);
  console.log(
    `Completed electives: ${coverage.completedElectives}/${coverage.totalElectives}`,
  );
}

function tracks(workspace) {
  const manifestState = loadManifest();
  const { manifest } = manifestState;
  const progress = readCurrentProgress(workspace, manifestState);
  const completed = new Set(deriveState(manifest, progress).completedTracks);

  for (const track of manifest.tracks) {
    const eligible = isTrackEligible(manifest, progress, track);
    const state = completed.has(track.id)
      ? "complete"
      : track.id === progress.activeTrack
        ? "active"
        : eligible
          ? "available"
          : "locked";
    console.log(`${track.id}\t${state}\t${track.title}`);
  }
}

function routeTrack(workspace, trackId) {
  const manifestState = loadManifest();
  const progress = readCurrentProgress(workspace, manifestState);
  const track = manifestState.manifest.tracks.find(
    (candidate) => candidate.id === trackId,
  );
  if (!track) {
    throw new Error(`Unknown track: ${trackId}`);
  }
  if (!isTrackEligible(manifestState.manifest, progress, track)) {
    throw new Error(`Track prerequisites are not complete: ${trackId}`);
  }

  progress.activeTrack = track.id;
  progress.activeCheckpoint = nextCheckpoint(track, progress);
  appendHistory(progress, {
    action: "routed",
    track: track.id,
    checkpoint: progress.activeCheckpoint,
  });
  writeProgress(workspace, progress);

  console.log(`Active track: ${track.id}`);
  console.log(
    `Next checkpoint: ${
      progress.activeCheckpoint ??
      (progress.completedTracks.includes(track.id)
        ? "track complete"
        : "track assessment required")
    }`,
  );
}

function submitCheckpoint(workspace, checkpointId, evidenceArgument) {
  const manifestState = loadManifest();
  const progress = readCurrentProgress(workspace, manifestState);
  const checkpointIndex = indexCheckpoints(manifestState.manifest);
  const indexed = checkpointIndex.get(checkpointId);
  if (!indexed) {
    throw new Error(`Unknown checkpoint: ${checkpointId}`);
  }
  if (indexed.track.id !== progress.activeTrack) {
    throw new Error(
      `Checkpoint ${checkpointId} belongs to ${indexed.track.id}; active track is ${progress.activeTrack}.`,
    );
  }
  if (!isTrackEligible(manifestState.manifest, progress, indexed.track)) {
    throw new Error(`Track prerequisites are not complete: ${indexed.track.id}`);
  }

  const checkpointPosition = indexed.track.checkpoints.findIndex(
    (checkpoint) => checkpoint.id === checkpointId,
  );
  const missingPrior = indexed.track.checkpoints
    .slice(0, checkpointPosition)
    .find(
      (checkpoint) =>
        progress.checkpoints[checkpoint.id]?.status !== "accepted",
    );
  if (missingPrior) {
    throw new Error(
      `Complete ${missingPrior.id} before ${checkpointId}; checkpoints cannot be skipped.`,
    );
  }

  const expected = nextCheckpoint(indexed.track, progress);
  if (
    expected !== checkpointId &&
    progress.checkpoints[checkpointId]?.status !== "accepted"
  ) {
    throw new Error(`Next checkpoint is ${expected}, not ${checkpointId}.`);
  }

  const evidence = resolveEvidence(workspace, evidenceArgument);
  if (evidence.relative !== indexed.checkpoint.evidence) {
    throw new Error(
      `Checkpoint ${checkpointId} evidence must use ${indexed.checkpoint.evidence}.`,
    );
  }
  const now = new Date().toISOString();
  progress.checkpoints[checkpointId] = {
    status: "submitted",
    submittedAt: now,
    evidence: evidence.relative,
    sha256: hashFile(evidence.absolute),
    requirementDigest: checkpointRequirementDigest(
      indexed.track,
      indexed.checkpoint,
    ),
    track: indexed.track.id,
    title: indexed.checkpoint.title,
  };
  retireAssessment(progress, indexed.track.id, "checkpoint-resubmitted");
  appendHistory(progress, {
    action: "checkpoint-submitted",
    track: indexed.track.id,
    checkpoint: checkpointId,
    evidence: evidence.relative,
  });
  applyDerivedState(manifestState.manifest, progress);
  writeProgress(workspace, progress);

  console.log(`Checkpoint submitted: ${checkpointId}`);
  console.log(`Evidence: ${evidence.relative}`);
  console.log("Instructor review required before the next checkpoint.");
}

function reviewCheckpoint(
  workspace,
  checkpointId,
  verdict,
  hintLevel,
  feedback,
) {
  const manifestState = loadManifest();
  const progress = readCurrentProgress(workspace, manifestState);
  const indexed = indexCheckpoints(manifestState.manifest).get(checkpointId);
  if (!indexed) {
    throw new Error(`Unknown checkpoint: ${checkpointId}`);
  }
  if (indexed.track.id !== progress.activeTrack) {
    throw new Error(
      `Checkpoint ${checkpointId} belongs to ${indexed.track.id}; active track is ${progress.activeTrack}.`,
    );
  }
  if (!isTrackEligible(manifestState.manifest, progress, indexed.track)) {
    throw new Error(`Track prerequisites are not complete: ${indexed.track.id}`);
  }
  if (!["pass", "retry"].includes(verdict)) {
    throw new Error("Review verdict must be pass or retry.");
  }
  const normalizedHint = required(hintLevel, "--hint");
  if (
    !["none", "prompt", "structure", "adjacent-example", "worked-recovery"].includes(
      normalizedHint,
    )
  ) {
    throw new Error(`Unknown hint level: ${normalizedHint}`);
  }
  const normalizedFeedback = required(feedback, "--feedback").trim();
  if (normalizedFeedback.length < 8) {
    throw new Error("Review feedback must name an observed strength or correction.");
  }

  const completion = progress.checkpoints[checkpointId];
  if (!completion) {
    throw new Error(`Submit evidence before reviewing ${checkpointId}.`);
  }
  if (completion.status !== "submitted") {
    throw new Error(
      `Checkpoint ${checkpointId} must be resubmitted before another review.`,
    );
  }
  const evidence = resolveEvidence(workspace, completion.evidence);
  if (hashFile(evidence.absolute) !== completion.sha256) {
    throw new Error(`Evidence changed after submission: ${checkpointId}`);
  }
  const currentRequirementDigest = checkpointRequirementDigest(
    indexed.track,
    indexed.checkpoint,
  );
  if (completion.requirementDigest !== currentRequirementDigest) {
    throw new Error(
      `Checkpoint requirements changed; resubmit ${checkpointId} before review.`,
    );
  }

  const now = new Date().toISOString();
  completion.status = verdict === "pass" ? "accepted" : "needs-revision";
  completion.reviewedAt = now;
  completion.review = {
    verdict,
    hintLevel: normalizedHint,
    feedback: normalizedFeedback,
  };
  retireAssessment(progress, indexed.track.id, "checkpoint-reviewed-again");
  appendHistory(progress, {
    action: "checkpoint-reviewed",
    track: indexed.track.id,
    checkpoint: checkpointId,
    verdict,
    hintLevel: normalizedHint,
  });
  applyDerivedState(manifestState.manifest, progress);
  writeProgress(workspace, progress);

  console.log(`Checkpoint review: ${checkpointId} -> ${verdict}`);
  console.log(
    `Next checkpoint: ${
      progress.activeCheckpoint ??
      (allCheckpointsAccepted(indexed.track, progress)
        ? "track assessment required"
        : checkpointId)
    }`,
  );
}

function assessTrack(workspace, trackId, scoreArgument, recordArgument, feedback) {
  const manifestState = loadManifest();
  const progress = readCurrentProgress(workspace, manifestState);
  const track = manifestState.manifest.tracks.find(
    (candidate) => candidate.id === trackId,
  );
  if (!track) {
    throw new Error(`Unknown track: ${trackId}`);
  }
  if (track.id !== progress.activeTrack) {
    throw new Error(
      `Track ${trackId} is not active; active track is ${progress.activeTrack}.`,
    );
  }
  if (!allCheckpointsAccepted(track, progress)) {
    throw new Error(`Every checkpoint in ${trackId} must be accepted first.`);
  }

  const scores = parseScores(scoreArgument);
  const assessmentRecord = resolveEvidence(
    workspace,
    required(recordArgument, "--record"),
  );
  const normalizedFeedback = required(feedback, "--feedback").trim();
  if (normalizedFeedback.length < 8) {
    throw new Error("Assessment feedback must name demonstrated evidence.");
  }
  const total = scores.reduce((sum, score) => sum + score, 0);
  const corePass = scores[0] >= 2 && scores[1] >= 2 && scores[2] >= 2;
  const noZero = scores.every((score) => score > 0);
  let passed = noZero && corePass && total >= (track.kind === "capstone" ? 12 : 10);
  if (track.kind === "capstone") {
    passed =
      passed &&
      ["CP-04", "CP-05"].every(
        (checkpointId) =>
          progress.checkpoints[checkpointId]?.review?.hintLevel !==
          "worked-recovery",
      );
  }

  const now = new Date().toISOString();
  progress.assessments ??= {};
  retireAssessment(progress, track.id, "track-reassessed");
  progress.assessments[track.id] = {
    status: passed ? "passed" : "needs-review",
    assessedAt: now,
    scores: {
      routing: scores[0],
      boundaryControl: scores[1],
      evidence: scores[2],
      returnPath: scores[3],
      independence: scores[4],
      total,
    },
    feedback: normalizedFeedback,
    record: assessmentRecord.relative,
    recordSha256: hashFile(assessmentRecord.absolute),
    requirementDigest: trackRequirementDigest(track),
  };
  appendHistory(progress, {
    action: "track-assessed",
    track: track.id,
    verdict: passed ? "passed" : "needs-review",
    total,
  });
  applyDerivedState(manifestState.manifest, progress);
  writeProgress(workspace, progress);

  console.log(`Track assessment: ${track.id} -> ${passed ? "passed" : "needs-review"}`);
  console.log(`Score: ${total}/15`);
}

function migrate(workspace) {
  const manifestState = loadManifest();
  const progress = readProgress(workspace);
  if (progress.courseId !== manifestState.manifest.courseId) {
    throw new Error("Cannot migrate progress for a different course.");
  }

  const currentIds = indexCheckpoints(manifestState.manifest);
  progress.retiredCheckpoints ??= {};
  for (const [checkpointId, completion] of Object.entries(
    progress.checkpoints ?? {},
  )) {
    if (!currentIds.has(checkpointId)) {
      progress.retiredCheckpoints[checkpointId] = {
        ...completion,
        retiredAt: new Date().toISOString(),
      };
      delete progress.checkpoints[checkpointId];
      continue;
    }

    const indexed = currentIds.get(checkpointId);
    const currentRequirementDigest = checkpointRequirementDigest(
      indexed.track,
      indexed.checkpoint,
    );
    const legacyCompletion = !completion.status;
    const requirementsChanged =
      completion.requirementDigest !== currentRequirementDigest;
    if (legacyCompletion || requirementsChanged) {
      progress.retiredCheckpoints[`${checkpointId}@${progress.courseVersion}`] = {
        ...completion,
        retiredAt: new Date().toISOString(),
        reason: legacyCompletion
          ? "legacy-completion-requires-review"
          : "checkpoint-requirements-changed",
      };
      completion.status = "submitted";
      completion.submittedAt ??= completion.completedAt ?? new Date().toISOString();
      completion.requirementDigest = currentRequirementDigest;
      delete completion.completedAt;
      delete completion.reviewedAt;
      delete completion.review;
    }
  }

  const previousVersion = progress.courseVersion;
  progress.schemaVersion = 2;
  progress.courseVersion = manifestState.manifest.courseVersion;
  progress.manifestDigest = manifestState.digest;
  progress.assessments ??= {};
  progress.retiredAssessments ??= {};
  for (const [trackId, assessment] of Object.entries(progress.assessments)) {
    const track = manifestState.manifest.tracks.find(
      (candidate) => candidate.id === trackId,
    );
    if (
      !track ||
      assessment.requirementDigest !== trackRequirementDigest(track) ||
      !allCheckpointsAccepted(track, progress)
    ) {
      progress.retiredAssessments[`${trackId}@${previousVersion}`] = {
        ...assessment,
        retiredAt: new Date().toISOString(),
        reason: "track-requirements-or-evidence-changed",
      };
      delete progress.assessments[trackId];
    }
  }
  if (
    !manifestState.manifest.tracks.some(
      (track) => track.id === progress.activeTrack,
    )
  ) {
    progress.activeTrack =
      manifestState.manifest.tracks.find((track) => track.kind === "foundation")
        ?.id ?? manifestState.manifest.tracks[0]?.id;
  }
  const activeTrack = manifestState.manifest.tracks.find(
    (track) => track.id === progress.activeTrack,
  );
  if (
    activeTrack &&
    !isTrackEligible(manifestState.manifest, progress, activeTrack)
  ) {
    progress.activeTrack =
      manifestState.manifest.tracks.find((track) => track.kind === "foundation")
        ?.id ?? manifestState.manifest.tracks[0]?.id;
  }
  applyDerivedState(manifestState.manifest, progress);
  appendHistory(progress, {
    action: "migrated",
    fromVersion: previousVersion,
    toVersion: progress.courseVersion,
  });
  writeProgress(workspace, progress);

  console.log(`Migrated course progress: ${previousVersion} -> ${progress.courseVersion}`);
  console.log(
    `Retired checkpoints preserved: ${Object.keys(progress.retiredCheckpoints).length}`,
  );
  console.log(
    `Retired assessments preserved: ${Object.keys(progress.retiredAssessments).length}`,
  );
  console.log(`Next checkpoint: ${progress.activeCheckpoint ?? "track complete"}`);
}

function loadManifest() {
  const raw = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const curriculumParts = [
    raw,
    readFileSync(rubricPath, "utf8"),
    readFileSync(resolve(skillDir, manifest.skillContractsFile), "utf8"),
    ...manifest.tracks.map((track) =>
      readFileSync(resolve(skillDir, track.file), "utf8"),
    ),
  ];
  return {
    manifest,
    digest: hashText(curriculumParts.join("\n---CURRICULUM---\n")),
  };
}

function readProgress(workspace) {
  const path = progressPath(workspace);
  if (!existsSync(path)) {
    throw new Error(`Progress file not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function readCurrentProgress(workspace, manifestState) {
  const progress = readProgress(workspace);
  if (progress.schemaVersion !== 2) {
    throw new Error("Course progress uses an older schema; run migrate before continuing.");
  }
  if (
    progress.courseVersion !== manifestState.manifest.courseVersion ||
    progress.manifestDigest !== manifestState.digest
  ) {
    throw new Error("Course progress is stale; run migrate before continuing.");
  }
  const contractErrors = skillContractErrors(manifestState.manifest);
  if (contractErrors.length > 0) {
    throw new Error(contractErrors[0]);
  }
  assertProgressEvidenceIntegrity(
    workspace,
    manifestState.manifest,
    progress,
  );
  return progress;
}

function assertProgressEvidenceIntegrity(workspace, manifest, progress) {
  const checkpointIndex = indexCheckpoints(manifest);
  for (const [checkpointId, completion] of Object.entries(
    progress.checkpoints ?? {},
  )) {
    const indexed = checkpointIndex.get(checkpointId);
    if (!indexed) {
      throw new Error(`Progress references unknown checkpoint: ${checkpointId}`);
    }
    if (completion.status !== "accepted") {
      continue;
    }
    const evidence = resolveEvidence(workspace, completion.evidence);
    if (hashFile(evidence.absolute) !== completion.sha256) {
      throw new Error(`Evidence changed after submission: ${checkpointId}`);
    }
    if (
      completion.requirementDigest !==
      checkpointRequirementDigest(indexed.track, indexed.checkpoint)
    ) {
      throw new Error(`Checkpoint requirements changed: ${checkpointId}`);
    }
  }
  for (const [trackId, assessment] of Object.entries(
    progress.assessments ?? {},
  )) {
    const track = manifest.tracks.find((candidate) => candidate.id === trackId);
    if (!track) {
      throw new Error(`Assessment references unknown track: ${trackId}`);
    }
    if (assessment.requirementDigest !== trackRequirementDigest(track)) {
      throw new Error(`Track assessment requirements changed: ${trackId}`);
    }
    const record = resolveEvidence(workspace, assessment.record);
    if (hashFile(record.absolute) !== assessment.recordSha256) {
      throw new Error(`Track assessment record changed: ${trackId}`);
    }
  }
}

function writeProgress(workspace, progress) {
  progress.updatedAt = new Date().toISOString();
  const path = progressPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(progress, null, 2)}\n`);
  renameSync(temporary, path);
}

function progressPath(workspace) {
  return join(workspace, progressDirectoryName, progressFileName);
}

function deriveState(manifest, progress) {
  const completedTracks = manifest.tracks
    .filter(
      (track) =>
        track.checkpoints.length > 0 &&
        allCheckpointsAccepted(track, progress) &&
        progress.assessments?.[track.id]?.status === "passed" &&
        progress.assessments[track.id].requirementDigest ===
          trackRequirementDigest(track),
    )
    .map((track) => track.id);
  const activeTrack = manifest.tracks.find(
    (track) => track.id === progress.activeTrack,
  );
  return {
    completedTracks,
    activeCheckpoint: activeTrack
      ? nextCheckpoint(activeTrack, progress)
      : null,
  };
}

function applyDerivedState(manifest, progress) {
  const derived = deriveState(manifest, progress);
  progress.completedTracks = derived.completedTracks;
  progress.activeCheckpoint = derived.activeCheckpoint;
}

function isTrackEligible(manifest, progress, track) {
  const completed = new Set(deriveState(manifest, progress).completedTracks);
  if (!track.prerequisites.every((prerequisite) => completed.has(prerequisite))) {
    return false;
  }
  if (track.kind === "capstone") {
    return manifest.tracks.some(
      (candidate) =>
        candidate.kind === "elective" && completed.has(candidate.id),
    );
  }
  return true;
}

function nextCheckpoint(track, progress) {
  return (
    track.checkpoints.find(
      (checkpoint) =>
        progress.checkpoints?.[checkpoint.id]?.status !== "accepted",
    )?.id ?? null
  );
}

function indexCheckpoints(manifest) {
  const index = new Map();
  for (const track of manifest.tracks) {
    for (const checkpoint of track.checkpoints) {
      index.set(checkpoint.id, { track, checkpoint });
    }
  }
  return index;
}

function allCheckpointsAccepted(track, progress) {
  return (
    track.checkpoints.length > 0 &&
    track.checkpoints.every(
      (checkpoint) =>
        progress.checkpoints?.[checkpoint.id]?.status === "accepted",
    )
  );
}

function acceptedCheckpointCount(progress) {
  return Object.values(progress.checkpoints ?? {}).filter(
    (completion) => completion.status === "accepted",
  ).length;
}

function completedSkillCoverage(manifest, completedTrackIds) {
  const completed = new Set(completedTrackIds);
  const tracks = manifest.tracks.filter((track) => completed.has(track.id));
  return {
    practiced: [
      ...new Set(
        tracks.flatMap((track) =>
          track.checkpoints.flatMap(
            (checkpoint) => checkpoint.practicedSkills ?? [],
          ),
        ),
      ),
    ].sort(),
    reference: [
      ...new Set(tracks.flatMap((track) => track.referenceSkills ?? [])),
    ].sort(),
    completedElectives: tracks.filter((track) => track.kind === "elective")
      .length,
    totalElectives: manifest.tracks.filter((track) => track.kind === "elective")
      .length,
  };
}

function checkpointRequirementDigest(track, checkpoint) {
  const trackPath = resolve(skillDir, track.file);
  const content = readFileSync(trackPath, "utf8");
  const heading = `## ${checkpoint.id}:`;
  const start = content.indexOf(heading);
  if (start === -1) {
    throw new Error(`Track ${track.id} is missing checkpoint ${checkpoint.id}.`);
  }
  const nextHeading = content.indexOf("\n## ", start + heading.length);
  const section = content.slice(
    start,
    nextHeading === -1 ? content.length : nextHeading,
  );
  return hashText(
    JSON.stringify({
      id: checkpoint.id,
      title: checkpoint.title,
      evidence: checkpoint.evidence,
      practicedSkills: checkpoint.practicedSkills ?? [],
      section,
    }),
  );
}

function trackRequirementDigest(track) {
  return hashText(
    JSON.stringify({
      id: track.id,
      kind: track.kind,
      prerequisites: track.prerequisites,
      rubric: hashFile(rubricPath),
      checkpoints: track.checkpoints.map((checkpoint) =>
        checkpointRequirementDigest(track, checkpoint),
      ),
    }),
  );
}

function skillContractErrors(manifest) {
  const errors = [];
  const contractPath = resolve(skillDir, manifest.skillContractsFile ?? "");
  if (!manifest.skillContractsFile || !existsSync(contractPath)) {
    return ["Skill contract identity file is missing."];
  }
  let contracts;
  try {
    contracts = JSON.parse(readFileSync(contractPath, "utf8")).skills;
  } catch (error) {
    return [`Cannot read skill contract identities: ${error.message}`];
  }
  const coveredSkills = new Set(
    manifest.tracks.flatMap((track) => track.skills ?? []),
  );
  for (const skillName of coveredSkills) {
    const path = join(skillRoot, skillName, "SKILL.md");
    if (!existsSync(path)) {
      errors.push(`Covered skill is missing: ${skillName}`);
      continue;
    }
    if (!contracts?.[skillName]) {
      errors.push(`Covered skill has no pinned contract identity: ${skillName}`);
      continue;
    }
    if (hashFile(path) !== contracts[skillName]) {
      errors.push(
        `Skill contract changed without curriculum review: ${skillName}`,
      );
    }
  }
  for (const skillName of Object.keys(contracts ?? {})) {
    if (!coveredSkills.has(skillName)) {
      errors.push(`Pinned skill contract is not covered: ${skillName}`);
    }
  }
  return errors;
}

function parseScores(argument) {
  const scores = argument.split(",").map((value) => Number(value.trim()));
  if (
    scores.length !== 5 ||
    scores.some(
      (score) => !Number.isInteger(score) || score < 0 || score > 3,
    )
  ) {
    throw new Error("Scores must be five comma-separated integers from 0 to 3.");
  }
  return scores;
}

function resolveEvidence(workspace, evidenceArgument) {
  const workspaceReal = realpathSync(workspace);
  const candidate = isAbsolute(evidenceArgument)
    ? resolve(evidenceArgument)
    : resolve(workspace, evidenceArgument);
  if (!existsSync(candidate)) {
    throw new Error(`Evidence file does not exist: ${evidenceArgument}`);
  }
  if (lstatSync(candidate).isSymbolicLink()) {
    throw new Error(`Evidence cannot be a symbolic link: ${evidenceArgument}`);
  }
  const candidateReal = realpathSync(candidate);
  assertContained(workspaceReal, candidateReal, "Evidence escapes course workspace");
  if (!statSync(candidateReal).isFile()) {
    throw new Error(`Evidence must be a regular file: ${evidenceArgument}`);
  }
  return {
    absolute: candidateReal,
    relative: relative(workspaceReal, candidateReal).split(sep).join("/"),
  };
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function retireAssessment(progress, trackId, reason) {
  const assessment = progress.assessments?.[trackId];
  if (!assessment) {
    return;
  }
  progress.retiredAssessments ??= {};
  const identity = `${trackId}@${assessment.assessedAt ?? new Date().toISOString()}`;
  progress.retiredAssessments[identity] = {
    ...assessment,
    retiredAt: new Date().toISOString(),
    reason,
  };
  delete progress.assessments[trackId];
}

function appendHistory(progress, event) {
  progress.history ??= [];
  progress.history.push({
    at: new Date().toISOString(),
    ...event,
  });
}

function assertSafeNewWorkspace(workspace) {
  if (!existsSync(workspace)) {
    return;
  }
  const info = lstatSync(workspace);
  if (info.isSymbolicLink()) {
    throw new Error("Workspace cannot be a symbolic link.");
  }
  if (!info.isDirectory()) {
    throw new Error("Workspace path exists and is not a directory.");
  }
  if (readdirSync(workspace).length > 0) {
    throw new Error("Workspace already exists and is not empty.");
  }
}

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Fixture cannot contain symbolic links: ${sourcePath}`);
    }
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

function assertContained(root, candidate, message) {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(message);
  }
}

function sameStrings(left, right) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function requiredWorkspace(value) {
  return resolve(required(value, "workspace path"));
}

function required(value, label) {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return required(args[index + 1], `${name} value`);
}
