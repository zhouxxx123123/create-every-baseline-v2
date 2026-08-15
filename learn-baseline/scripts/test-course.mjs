#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { TaskStore } from "../assets/practice-lab/src/task-store.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const courseScript = join(scriptDir, "course.mjs");
const validatorScript = join(scriptDir, "validate-course.mjs");
const temporaryRoots = [];

test.after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validates course coverage and checkpoint structure", () => {
  const result = runNode(validatorScript);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Course structure is valid/);
  assert.match(result.stdout, /Covered skills: 35/);
  assert.match(result.stdout, /Practiced skills: 26/);
  assert.match(result.stdout, /Reference-only skills: 9/);
});

test("preserves the intentional failed-rename mutation for diagnosis practice", () => {
  const store = new TaskStore();
  const task = store.add("Prepare review").task;

  const result = store.rename(task.id, "   ");

  assert.deepEqual(result, { ok: false, reason: "empty-name" });
  assert.equal(store.get(task.id).name, "");
});

test("prepares a real merge conflict inside an isolated nested repository", () => {
  const workspace = initializedWorkspace();
  const prepareScript = join(workspace, "scripts", "prepare-conflict.mjs");

  const prepared = runNode(prepareScript);
  assertSuccess(prepared);
  assert.match(prepared.stdout, /Isolated conflict ready/);

  const status = spawnSync("git", ["status", "--short"], {
    cwd: join(workspace, "conflict-lab"),
    encoding: "utf8",
  });
  assertSuccess(status);
  assert.match(status.stdout, /UU task-store\.mjs/);
});

test("initializes a dedicated lab and reports healthy progress", () => {
  const workspace = newWorkspacePath();

  assertSuccess(runCourse("init", workspace, "--locale", "zh-CN"));
  assertSuccess(runCourse("doctor", workspace));
  const status = runCourse("status", workspace);

  assertSuccess(status);
  assert.match(status.stdout, /Active track: foundation/);
  assert.match(status.stdout, /Next checkpoint: FND-01/);
});

test("refuses non-empty initialization targets", () => {
  const workspace = newWorkspacePath();
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, "owned.txt"), "keep\n");

  const result = runCourse("init", workspace);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not empty/);
});

test("enforces checkpoint order and evidence containment", () => {
  const workspace = initializedWorkspace();
  const artifactDirectory = join(workspace, "learner-artifacts");
  const secondEvidence = join(
    artifactDirectory,
    "foundation-setup-review.md",
  );
  writeFileSync(secondEvidence, "# Setup review\n");

  const skipped = runCourse(
    "submit",
    workspace,
    "FND-02",
    secondEvidence,
  );
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.stderr, /Complete FND-01/);

  const outside = join(dirname(workspace), "outside.md");
  writeFileSync(outside, "# Outside\n");
  const escaped = runCourse(
    "submit",
    workspace,
    "FND-01",
    outside,
  );
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stderr, /escapes course workspace/);

  const wrongEvidence = join(artifactDirectory, "wrong-file.md");
  writeFileSync(wrongEvidence, "# Wrong path\n");
  const wrongPath = runCourse(
    "submit",
    workspace,
    "FND-01",
    wrongEvidence,
  );
  assert.notEqual(wrongPath.status, 0);
  assert.match(wrongPath.stderr, /must use learner-artifacts\/foundation-routing.md/);
});

test("requires resubmission after a retry review", () => {
  const workspace = initializedWorkspace();
  const evidence = join(
    workspace,
    "learner-artifacts",
    "foundation-routing.md",
  );
  writeFileSync(evidence, "# First attempt\n");
  assertSuccess(runCourse("submit", workspace, "FND-01", evidence));
  assertSuccess(
    runCourse(
      "review",
      workspace,
      "FND-01",
      "retry",
      "--hint",
      "prompt",
      "--feedback",
      "The route is missing an observable stop condition.",
    ),
  );

  const secondReview = runCourse(
    "review",
    workspace,
    "FND-01",
    "pass",
    "--hint",
    "none",
    "--feedback",
    "Attempted to pass without a revised submission.",
  );
  assert.notEqual(secondReview.status, 0);
  assert.match(secondReview.stderr, /must be resubmitted/);

  writeFileSync(evidence, "# Revised attempt\n\nIncludes a stop condition.\n");
  assertSuccess(runCourse("submit", workspace, "FND-01", evidence));
  assertSuccess(
    runCourse(
      "review",
      workspace,
      "FND-01",
      "pass",
      "--hint",
      "prompt",
      "--feedback",
      "The revised artifact now includes the missing stop condition.",
    ),
  );
});

test("requires accepted checkpoints and a passing assessment before unlocking electives", () => {
  const workspace = initializedWorkspace();
  const earlyRoute = runCourse("route", workspace, "product-discovery");
  assert.notEqual(earlyRoute.status, 0);
  assert.match(earlyRoute.stderr, /prerequisites/);

  const checkpoints = [
    ["FND-01", "foundation-routing.md"],
    ["FND-02", "foundation-setup-review.md"],
    ["FND-03", "foundation-handoff.md"],
    ["FND-04", "foundation-standalone-tools.md"],
  ];
  for (const [checkpoint, file] of checkpoints) {
    const evidence = join(workspace, "learner-artifacts", file);
    writeFileSync(evidence, `# ${checkpoint}\n`);
    assertSuccess(runCourse("submit", workspace, checkpoint, evidence));
    const stillLocked = runCourse("route", workspace, "product-discovery");
    assert.notEqual(stillLocked.status, 0);
    assert.match(stillLocked.stderr, /prerequisites/);
    assertSuccess(
      runCourse(
        "review",
        workspace,
        checkpoint,
        "pass",
        "--hint",
        "none",
        "--feedback",
        `Reviewed evidence for ${checkpoint}`,
      ),
    );
  }

  const assessmentRequired = runCourse(
    "route",
    workspace,
    "product-discovery",
  );
  assert.notEqual(assessmentRequired.status, 0);
  assert.match(assessmentRequired.stderr, /prerequisites/);

  const assessmentRecord = join(
    workspace,
    "learner-artifacts",
    "foundation-assessment.md",
  );
  writeFileSync(
    assessmentRecord,
    "# Foundation assessment\n\nEvidence supports every required dimension.\n",
  );
  const failedAssessment = runCourse(
    "assess",
    workspace,
    "foundation",
    "1,2,2,2,2",
    "--record",
    assessmentRecord,
    "--feedback",
    "Routing evidence still needs one independent correction.",
  );
  assertSuccess(failedAssessment);
  assert.match(failedAssessment.stdout, /needs-review/);
  const routeAfterFailedAssessment = runCourse(
    "route",
    workspace,
    "product-discovery",
  );
  assert.notEqual(routeAfterFailedAssessment.status, 0);
  assert.match(routeAfterFailedAssessment.stderr, /prerequisites/);

  assertSuccess(
    runCourse(
      "assess",
      workspace,
      "foundation",
      "2,2,2,2,2",
      "--record",
      assessmentRecord,
      "--feedback",
      "Foundation evidence demonstrates the required routing boundaries.",
    ),
  );
  const route = runCourse("route", workspace, "product-discovery");
  assertSuccess(route);
  assert.match(route.stdout, /Next checkpoint: PD-01/);
  assertSuccess(runCourse("doctor", workspace));
  const finalProgress = JSON.parse(
    readFileSync(join(workspace, ".learn-baseline", "progress.json"), "utf8"),
  );
  assert.equal(Object.keys(finalProgress.retiredAssessments).length, 1);

  const acceptedEvidence = join(
    workspace,
    "learner-artifacts",
    "foundation-routing.md",
  );
  writeFileSync(acceptedEvidence, "# Accepted evidence changed\n");
  const routeWithChangedEvidence = runCourse(
    "route",
    workspace,
    "evidence-validation",
  );
  assert.notEqual(routeWithChangedEvidence.status, 0);
  assert.match(routeWithChangedEvidence.stderr, /Evidence changed after submission/);
  writeFileSync(acceptedEvidence, "# FND-01\n");

  writeFileSync(assessmentRecord, "# Assessment changed after acceptance\n");
  const changedAssessment = runCourse("doctor", workspace);
  assert.notEqual(changedAssessment.status, 0);
  assert.match(changedAssessment.stderr, /Track assessment record changed/);
  const routeWithChangedAssessment = runCourse(
    "route",
    workspace,
    "evidence-validation",
  );
  assert.notEqual(routeWithChangedAssessment.status, 0);
  assert.match(routeWithChangedAssessment.stderr, /Track assessment record changed/);
});

test("detects changed evidence and migrates stale course identity", () => {
  const workspace = initializedWorkspace();
  const evidence = join(
    workspace,
    "learner-artifacts",
    "foundation-routing.md",
  );
  writeFileSync(evidence, "# Routing\n");
  assertSuccess(runCourse("submit", workspace, "FND-01", evidence));

  writeFileSync(evidence, "# Routing changed after review\n");
  const changed = runCourse("doctor", workspace);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /Evidence changed after submission/);

  const progressPath = join(workspace, ".learn-baseline", "progress.json");
  const progress = JSON.parse(readFileSync(progressPath, "utf8"));
  progress.schemaVersion = 1;
  progress.courseVersion = "1.0.0";
  progress.manifestDigest = "stale";
  progress.checkpoints["FND-01"] = {
    completedAt: new Date().toISOString(),
    evidence: "learner-artifacts/foundation-routing.md",
    sha256: hashText("# Routing changed after review\n"),
    track: "foundation",
    title: "Route requests by outcome",
  };
  writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);

  const migrated = runCourse("migrate", workspace);
  assertSuccess(migrated);
  assert.match(migrated.stdout, /1.0.0 -> 1.2.0/);
  const migratedProgress = JSON.parse(readFileSync(progressPath, "utf8"));
  assert.equal(migratedProgress.schemaVersion, 2);
  assert.equal(migratedProgress.checkpoints["FND-01"].status, "submitted");
  assert.equal(migratedProgress.assessments.foundation, undefined);
});

function initializedWorkspace() {
  const workspace = newWorkspacePath();
  assertSuccess(runCourse("init", workspace));
  return workspace;
}

function newWorkspacePath() {
  const root = mkdtempSync(join(tmpdir(), "learn-baseline-test-"));
  temporaryRoots.push(root);
  return resolve(root, "lab");
}

function runCourse(...args) {
  return runNode(courseScript, ...args);
}

function runNode(script, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
}

function assertSuccess(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}
