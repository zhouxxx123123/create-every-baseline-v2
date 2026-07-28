#!/usr/bin/env node

import assert from "node:assert/strict";
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
  assert.match(result.stdout, /Covered skills: 34/);
});

test("preserves the intentional failed-rename mutation for diagnosis practice", () => {
  const store = new TaskStore();
  const task = store.add("Prepare review").task;

  const result = store.rename(task.id, "   ");

  assert.deepEqual(result, { ok: false, reason: "empty-name" });
  assert.equal(store.get(task.id).name, "");
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
    "checkpoint",
    workspace,
    "FND-02",
    secondEvidence,
  );
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.stderr, /Complete FND-01/);

  const outside = join(dirname(workspace), "outside.md");
  writeFileSync(outside, "# Outside\n");
  const escaped = runCourse(
    "checkpoint",
    workspace,
    "FND-01",
    outside,
  );
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stderr, /escapes course workspace/);
});

test("unlocks electives after completing foundation", () => {
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
    assertSuccess(runCourse("checkpoint", workspace, checkpoint, evidence));
  }

  const route = runCourse("route", workspace, "product-discovery");
  assertSuccess(route);
  assert.match(route.stdout, /Next checkpoint: PD-01/);
  assertSuccess(runCourse("doctor", workspace));
});

test("detects changed evidence and migrates stale course identity", () => {
  const workspace = initializedWorkspace();
  const evidence = join(
    workspace,
    "learner-artifacts",
    "foundation-routing.md",
  );
  writeFileSync(evidence, "# Routing\n");
  assertSuccess(runCourse("checkpoint", workspace, "FND-01", evidence));

  writeFileSync(evidence, "# Routing changed after review\n");
  const changed = runCourse("doctor", workspace);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /Evidence changed/);

  const progressPath = join(workspace, ".learn-baseline", "progress.json");
  const progress = JSON.parse(readFileSync(progressPath, "utf8"));
  progress.courseVersion = "0.9.0";
  progress.manifestDigest = "stale";
  writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);

  const migrated = runCourse("migrate", workspace);
  assertSuccess(migrated);
  assert.match(migrated.stdout, /0.9.0 -> 1.0.0/);
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
