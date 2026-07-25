#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const adapter = path.join(scriptDirectory, "project-board.mjs");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-board-test-"));
const projectRoot = path.join(temporaryRoot, "project");
const configPath = path.join(projectRoot, ".project-board", "config.json");
let server = null;

try {
  createFixture();
  testHierarchyAndFrontier();
  testPathContainment();
  await testServerAndLiveRefresh();
  process.stdout.write("Project board regression tests passed.\n");
} finally {
  if (server && !server.killed) server.kill("SIGTERM");
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

function createFixture() {
  write(
    ".scratch/current/map.md",
    `# Current product effort

## Active frontier

[Decision 02](decisions/02-current-frontier.md)
`,
  );
  write(
    ".scratch/current/decisions/01-complete.md",
    `# Decision 01

Type: grilling
Status: resolved
Blocked by: None
`,
  );
  write(
    ".scratch/current/decisions/02-current-frontier.md",
    `# Decision 02

Type: grilling
Status: claimed
Blocked by: 01
`,
  );
  write(
    ".scratch/current/spec.md",
    `# Current product specification

This is a real specification artifact.
`,
  );
  write(
    ".scratch/current/issues/01-build.md",
    `# Build the product

Type: task
Status: open
Blocked by: None
`,
  );
  write(
    ".scratch/current/issues/02-verify.md",
    `# Verify the product

Type: task
Status: open
Blocked by: [01](01-build.md)
Parent: [01](01-build.md)
`,
  );
  write(
    ".scratch/legacy/map.md",
    `# Historical effort

## Active frontier

Prototype validation is active outside the decision tracker.
`,
  );
  write(
    ".scratch/legacy/decisions/44-second-stage.md",
    `# Second-stage decision

Type: grilling
Status: open
Blocked by: None
`,
  );

  const outsideSource = path.join(temporaryRoot, "outside.md");
  fs.writeFileSync(outsideSource, "outside repository", "utf8");
  fs.symlinkSync(
    outsideSource,
    path.join(projectRoot, ".scratch", "current", "escape.md"),
  );

  writeJson(".project-board/config.json", {
    schemaVersion: 1,
    adapterVersion: 2,
    title: "Regression board",
    locale: "en",
    canonicalTracker: "local-markdown",
    repoRoot: "..",
    localMarkdown: { roots: [".scratch"] },
    surfaces: {
      githubProject: { enabled: false },
      localHtml: {
        enabled: true,
        output: ".project-board/index.html",
        port: 4173,
        liveRefresh: {
          enabled: true,
          debounceMs: 50,
          localPollMs: 100,
        },
      },
    },
  });
}

function testHierarchyAndFrontier() {
  runAdapter("sync");
  const items = readRenderedItems();
  const frontier = items.filter((item) => item.isFrontier);
  const specification = items.find((item) => item.id === "SPEC");
  const implementation = items.find((item) => item.id === "02" && item.stage === "implementation");
  const historical = items.find(
    (item) => item.id === "44" && item.group === "legacy",
  );

  assert.deepEqual(frontier.map((item) => item.title), ["Decision 02"]);
  assert.equal(specification?.stage, "specification");
  assert.match(implementation?.parentId || "", /01-build\.md$/);
  assert.equal(historical?.isFrontier, false);
  assert.equal(
    items.filter(
      (item) => item.stage === "specification" && item.group === "legacy",
    ).length,
    0,
  );

  const doctor = runAdapter("doctor");
  assert.match(doctor.stdout, /configuration valid \(adapter 2, 6 item\(s\), 1 frontier\(s\)\)/);
}

function testPathContainment() {
  const unsafeConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  unsafeConfig.surfaces.localHtml.output = "../outside.html";
  const unsafePath = path.join(projectRoot, ".project-board", "unsafe.json");
  fs.writeFileSync(unsafePath, JSON.stringify(unsafeConfig, null, 2), "utf8");
  const result = runAdapter("sync", unsafePath, false);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local HTML output escapes repoRoot/);
  assert.equal(fs.existsSync(path.join(temporaryRoot, "outside.html")), false);
}

async function testServerAndLiveRefresh() {
  const port = await freePort();
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.surfaces.localHtml.port = port;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

  server = spawn(process.execPath, [adapter, "serve", "--config", configPath], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });

  await waitFor(async () => {
    const response = await request(`http://127.0.0.1:${port}/health`);
    return response.status === 200;
  });
  const health = JSON.parse((await request(`http://127.0.0.1:${port}/health`)).body);
  assert.equal(health.adapterVersion, 2);

  const escaped = await request(
    `http://127.0.0.1:${port}/source?path=.scratch/current/escape.md`,
  );
  assert.equal(escaped.status, 403);

  const event = waitForBoardEvent(port);
  const ticketPath = path.join(
    projectRoot,
    ".scratch",
    "current",
    "issues",
    "01-build.md",
  );
  fs.appendFileSync(ticketPath, "\nUpdated: live-refresh-test\n", "utf8");
  await event;

  const rendered = await request(`http://127.0.0.1:${port}/`);
  assert.equal(rendered.status, 200);
  assert.match(rendered.body, /start-setup-project-board/);
  assert.match(output, /Project board refreshed/);

  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  server = null;
}

function write(relativePath, contents) {
  const target = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
}

function writeJson(relativePath, value) {
  write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runAdapter(command, selectedConfig = configPath, requireSuccess = true) {
  const result = spawnSync(
    process.execPath,
    [adapter, command, "--config", selectedConfig],
    { cwd: projectRoot, encoding: "utf8" },
  );
  if (requireSuccess && result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `adapter exited ${result.status}`);
  }
  return result;
}

function readRenderedItems() {
  const html = fs.readFileSync(
    path.join(projectRoot, ".project-board", "index.html"),
    "utf8",
  );
  const match = html.match(/const items = (\[[\s\S]*?\]);\n\s+const copy/);
  assert.ok(match, "rendered item data is present");
  return JSON.parse(match[1]);
}

function request(url) {
  return new Promise((resolve, reject) => {
    const requestHandle = http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () =>
        resolve({ status: response.statusCode, body }),
      );
    });
    requestHandle.on("error", reject);
    requestHandle.setTimeout(1_000, () => requestHandle.destroy());
  });
}

function waitForBoardEvent(port) {
  return new Promise((resolve, reject) => {
    const requestHandle = http.get(
      `http://127.0.0.1:${port}/events`,
      (response) => {
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (chunk.includes("event: board-updated")) {
            requestHandle.destroy();
            resolve();
          }
        });
      },
    );
    requestHandle.on("error", reject);
    setTimeout(() => {
      requestHandle.destroy();
      reject(new Error("timed out waiting for board-updated event"));
    }, 5_000).unref();
  });
}

async function waitFor(check) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for local board server");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}
