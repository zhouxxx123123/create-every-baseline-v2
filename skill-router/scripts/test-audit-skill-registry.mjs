#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const AUDIT_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "audit-skill-registry.mjs",
);

const ROUTER_BODY = `
## The main flow: idea -> ship

Run \`/product-readiness\` before \`/to-spec\`.

## On-ramps

When the map clears, run \`/product-readiness\` before \`/to-spec\`.
`;

function writeSkill(root, name, body = "") {
  const skillDir = path.join(root, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test fixture for ${name}.\n---\n${body}`,
  );
}

function createValidRegistry() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-registry-test-"));
  writeSkill(root, "skill-router", ROUTER_BODY);
  writeSkill(root, "product-readiness");
  writeSkill(root, "to-spec", "Requires READY_FOR_TO_SPEC.");
  return root;
}

function runAudit(root) {
  const result = spawnSync(process.execPath, [AUDIT_SCRIPT, root, "--json"], {
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: JSON.parse(result.stdout),
    stderr: result.stderr,
  };
}

test("fails when any required routing skill is missing", () => {
  for (const missing of ["skill-router", "product-readiness", "to-spec"]) {
    const root = createValidRegistry();
    try {
      fs.rmSync(path.join(root, missing), { recursive: true, force: true });
      const result = runAudit(root);

      assert.equal(result.status, 1, `missing ${missing}\n${result.stderr}`);
      assert.ok(
        result.output.errors.includes(
          `Required routing skill '${missing}' is missing.`,
        ),
        `missing ${missing}: ${JSON.stringify(result.output.errors)}`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("fails when to-spec drops the readiness receipt requirement", () => {
  const root = createValidRegistry();
  try {
    writeSkill(root, "to-spec", "Writes a specification.");
    const result = runAudit(root);

    assert.equal(result.status, 1, result.stderr);
    assert.ok(
      result.output.errors.includes(
        "to-spec must require a READY_FOR_TO_SPEC receipt.",
      ),
      JSON.stringify(result.output.errors),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fails when product-readiness follows to-spec", () => {
  const root = createValidRegistry();
  try {
    writeSkill(
      root,
      "skill-router",
      `
## The main flow: idea -> ship

Run \`/to-spec\` before \`/product-readiness\`.

## On-ramps

When the map clears, run \`/to-spec\` before \`/product-readiness\`.
`,
    );
    const result = runAudit(root);

    assert.equal(result.status, 1, result.stderr);
    assert.ok(
      result.output.errors.includes(
        `Main flow in ${path.join(root, "skill-router", "SKILL.md")} must route through product-readiness before to-spec.`,
      ),
      JSON.stringify(result.output.errors),
    );
    assert.ok(
      result.output.errors.includes(
        `Wayfinder handoff in ${path.join(root, "skill-router", "SKILL.md")} must route through product-readiness before to-spec.`,
      ),
      JSON.stringify(result.output.errors),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("passes when all routing contracts are complete and ordered", () => {
  const root = createValidRegistry();
  try {
    const result = runAudit(root);

    assert.equal(
      result.status,
      0,
      `${result.stderr}\n${JSON.stringify(result.output.errors)}`,
    );
    assert.deepEqual(result.output.errors, []);
    assert.equal(result.output.valid, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
