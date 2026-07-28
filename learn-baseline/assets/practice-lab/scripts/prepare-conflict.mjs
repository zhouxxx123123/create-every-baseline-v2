#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(labRoot, "conflict-lab");
const modulePath = join(target, "task-store.mjs");

if (existsSync(target)) {
  throw new Error(`Conflict lab already exists: ${target}`);
}

mkdirSync(target, { recursive: true });
run("git", ["init", "-b", "main"], target);
run("git", ["config", "user.name", "Learn Baseline"], target);
run("git", ["config", "user.email", "learn-baseline@example.invalid"], target);

writeFileSync(
  modulePath,
  `export function renameTask(name) {
  return { ok: true, name };
}
`,
);
commit(target, "base rename behavior");

run("git", ["checkout", "-b", "normalize-names"], target);
writeFileSync(
  modulePath,
  `function normalizeTaskName(name) {
  return name.trim().replaceAll(/\\s+/g, " ");
}

export function renameTask(name) {
  return { ok: true, name: normalizeTaskName(name) };
}
`,
);
commit(target, "normalize task names");

run("git", ["checkout", "main"], target);
writeFileSync(
  modulePath,
  `export function renameTask(name) {
  if (!name.trim()) {
    return { ok: false, reason: "empty-name" };
  }
  return { ok: true, name };
}
`,
);
commit(target, "reject empty task names");

const merge = spawnSync("git", ["merge", "normalize-names"], {
  cwd: target,
  encoding: "utf8",
});
if (merge.status === 0) {
  throw new Error("Expected the isolated merge to conflict.");
}

console.log(`Isolated conflict ready: ${target}`);
console.log("Inspect with: git status --short");

function commit(cwd, message) {
  run("git", ["add", "task-store.mjs"], cwd);
  run("git", ["commit", "-m", message], cwd);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result;
}
