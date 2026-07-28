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
const manifestPath = join(skillDir, "references", "course-manifest.json");
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
    case "checkpoint":
      completeCheckpoint(
        requiredWorkspace(workspaceArgument),
        required(rest[0], "checkpoint ID"),
        required(rest[1], "evidence path"),
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
  node course.mjs checkpoint <workspace> <checkpoint-id> <evidence-path>
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
    schemaVersion: 1,
    courseId: manifestState.manifest.courseId,
    courseVersion: manifestState.manifest.courseVersion,
    manifestDigest: manifestState.digest,
    locale: requestedLocale || manifestState.manifest.defaultLocale || "en",
    createdAt: now,
    updatedAt: now,
    activeTrack: firstTrack.id,
    activeCheckpoint: firstTrack.checkpoints[0]?.id ?? null,
    checkpoints: {},
    completedTracks: [],
    retiredCheckpoints: {},
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

  if (progress.schemaVersion !== 1) {
    errors.push(`Unsupported progress schema: ${progress.schemaVersion}`);
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

  const checkpointIndex = indexCheckpoints(manifestState.manifest);
  for (const [checkpointId, completion] of Object.entries(
    progress.checkpoints ?? {},
  )) {
    if (!checkpointIndex.has(checkpointId)) {
      errors.push(`Completed checkpoint is not in current course: ${checkpointId}`);
      continue;
    }
    try {
      const evidence = resolveEvidence(workspace, completion.evidence);
      const currentHash = hashFile(evidence.absolute);
      if (currentHash !== completion.sha256) {
        errors.push(`Evidence changed after completion: ${checkpointId}`);
      }
    } catch (error) {
      errors.push(`${checkpointId}: ${error.message}`);
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
  console.log(`Completed checkpoints: ${Object.keys(progress.checkpoints).length}`);
}

function status(workspace) {
  const { manifest, digest } = loadManifest();
  const progress = readProgress(workspace);
  const derived = deriveState(manifest, progress);
  const stale =
    progress.courseVersion !== manifest.courseVersion ||
    progress.manifestDigest !== digest;

  console.log(`Course: ${progress.courseId}`);
  console.log(`Installed version: ${manifest.courseVersion}`);
  console.log(`Progress version: ${progress.courseVersion}`);
  console.log(`Version status: ${stale ? "STALE - run migrate" : "CURRENT"}`);
  console.log(`Locale: ${progress.locale}`);
  console.log(`Active track: ${progress.activeTrack}`);
  console.log(`Next checkpoint: ${derived.activeCheckpoint ?? "track complete"}`);
  console.log(
    `Completed tracks: ${derived.completedTracks.join(", ") || "none"}`,
  );
  console.log(`Completed checkpoints: ${Object.keys(progress.checkpoints).length}`);
}

function tracks(workspace) {
  const { manifest } = loadManifest();
  const progress = readProgress(workspace);
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
  console.log(`Next checkpoint: ${progress.activeCheckpoint ?? "track complete"}`);
}

function completeCheckpoint(workspace, checkpointId, evidenceArgument) {
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

  const checkpointPosition = indexed.track.checkpoints.findIndex(
    (checkpoint) => checkpoint.id === checkpointId,
  );
  const missingPrior = indexed.track.checkpoints
    .slice(0, checkpointPosition)
    .find((checkpoint) => !progress.checkpoints[checkpoint.id]);
  if (missingPrior) {
    throw new Error(
      `Complete ${missingPrior.id} before ${checkpointId}; checkpoints cannot be skipped.`,
    );
  }

  const expected = nextCheckpoint(indexed.track, progress);
  if (expected !== checkpointId && !progress.checkpoints[checkpointId]) {
    throw new Error(`Next checkpoint is ${expected}, not ${checkpointId}.`);
  }

  const evidence = resolveEvidence(workspace, evidenceArgument);
  const now = new Date().toISOString();
  progress.checkpoints[checkpointId] = {
    completedAt: now,
    evidence: evidence.relative,
    sha256: hashFile(evidence.absolute),
    track: indexed.track.id,
    title: indexed.checkpoint.title,
  };
  appendHistory(progress, {
    action: "checkpoint-completed",
    track: indexed.track.id,
    checkpoint: checkpointId,
    evidence: evidence.relative,
  });
  applyDerivedState(manifestState.manifest, progress);
  writeProgress(workspace, progress);

  console.log(`Checkpoint completed: ${checkpointId}`);
  console.log(`Evidence: ${evidence.relative}`);
  console.log(`Next checkpoint: ${progress.activeCheckpoint ?? "track complete"}`);
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
    }
  }

  const previousVersion = progress.courseVersion;
  progress.schemaVersion = 1;
  progress.courseVersion = manifestState.manifest.courseVersion;
  progress.manifestDigest = manifestState.digest;
  if (
    !manifestState.manifest.tracks.some(
      (track) => track.id === progress.activeTrack,
    )
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
  console.log(`Next checkpoint: ${progress.activeCheckpoint ?? "track complete"}`);
}

function loadManifest() {
  const raw = readFileSync(manifestPath, "utf8");
  return {
    manifest: JSON.parse(raw),
    digest: createHash("sha256").update(raw).digest("hex"),
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
  if (
    progress.courseVersion !== manifestState.manifest.courseVersion ||
    progress.manifestDigest !== manifestState.digest
  ) {
    throw new Error("Course progress is stale; run migrate before continuing.");
  }
  return progress;
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
        track.checkpoints.every(
          (checkpoint) => progress.checkpoints?.[checkpoint.id],
        ),
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
      (checkpoint) => !progress.checkpoints?.[checkpoint.id],
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
