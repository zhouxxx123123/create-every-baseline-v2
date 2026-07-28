#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const skillRoot = resolve(skillDir, "..");
const manifestPath = join(skillDir, "references", "course-manifest.json");
const requiredMarkers = [
  "**Outcome:**",
  "**Concept:**",
  "**Learner action:**",
  "**Evidence:**",
  "**Hint ladder:**",
  "**Feedback focus:**",
  "**Advance when:**",
  "**Next:**",
];

const errors = [];
let manifest;

try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`Cannot read course manifest: ${error.message}`);
  finish();
}

if (manifest.schemaVersion !== 1) {
  fail(`Unsupported manifest schema: ${manifest.schemaVersion}`);
}
if (!manifest.courseId || !manifest.courseVersion) {
  fail("Manifest requires courseId and courseVersion.");
}
if (!Array.isArray(manifest.tracks) || manifest.tracks.length === 0) {
  fail("Manifest requires at least one track.");
}

const trackIds = new Set();
const checkpointIds = new Set();
const coveredSkills = new Map();
let checkpointCount = 0;

for (const track of manifest.tracks ?? []) {
  if (trackIds.has(track.id)) {
    fail(`Duplicate track ID: ${track.id}`);
  }
  trackIds.add(track.id);

  const trackPath = resolve(skillDir, track.file ?? "");
  if (!existsSync(trackPath)) {
    fail(`Missing track file for ${track.id}: ${track.file}`);
    continue;
  }
  const content = readFileSync(trackPath, "utf8");

  for (const skillName of track.skills ?? []) {
    if (coveredSkills.has(skillName)) {
      fail(
        `Skill ${skillName} appears in both ${coveredSkills.get(skillName)} and ${track.id}`,
      );
    }
    coveredSkills.set(skillName, track.id);
    const skillPath = join(skillRoot, skillName, "SKILL.md");
    if (!existsSync(skillPath)) {
      fail(`Track ${track.id} references missing skill: ${skillName}`);
    }
  }

  for (const checkpoint of track.checkpoints ?? []) {
    checkpointCount += 1;
    if (checkpointIds.has(checkpoint.id)) {
      fail(`Duplicate checkpoint ID: ${checkpoint.id}`);
    }
    checkpointIds.add(checkpoint.id);
    if (!checkpoint.title || !checkpoint.evidence) {
      fail(`Checkpoint ${checkpoint.id} requires title and evidence.`);
    }

    const heading = `## ${checkpoint.id}:`;
    const start = content.indexOf(heading);
    if (start === -1) {
      fail(`Track file ${track.file} is missing heading ${heading}`);
      continue;
    }
    if (content.indexOf(heading, start + heading.length) !== -1) {
      fail(`Track file ${track.file} repeats heading ${heading}`);
    }

    const nextHeading = content.indexOf("\n## ", start + heading.length);
    const section = content.slice(
      start,
      nextHeading === -1 ? content.length : nextHeading,
    );
    for (const marker of requiredMarkers) {
      if (!section.includes(marker)) {
        fail(`${checkpoint.id} is missing ${marker}`);
      }
    }
    if (!section.includes(checkpoint.evidence)) {
      fail(
        `${checkpoint.id} does not name manifest evidence path ${checkpoint.evidence}`,
      );
    }
  }
}

for (const track of manifest.tracks ?? []) {
  for (const prerequisite of track.prerequisites ?? []) {
    if (!trackIds.has(prerequisite)) {
      fail(`Track ${track.id} has unknown prerequisite: ${prerequisite}`);
    }
    if (prerequisite === track.id) {
      fail(`Track ${track.id} cannot require itself.`);
    }
  }
}

const topLevelSkills = readdirSync(skillRoot, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      entry.name !== manifest.courseId &&
      existsSync(join(skillRoot, entry.name, "SKILL.md")),
  )
  .map((entry) => entry.name)
  .sort();
const missingCoverage = topLevelSkills.filter(
  (skillName) => !coveredSkills.has(skillName),
);
const unknownCoverage = [...coveredSkills.keys()].filter(
  (skillName) => !topLevelSkills.includes(skillName),
);
if (missingCoverage.length > 0) {
  fail(`Skills missing course coverage: ${missingCoverage.join(", ")}`);
}
if (unknownCoverage.length > 0) {
  fail(`Course covers unknown skills: ${unknownCoverage.join(", ")}`);
}

for (const [alias, authority] of Object.entries(manifest.aliases ?? {})) {
  if (!coveredSkills.has(alias)) {
    fail(`Alias is not covered by a track: ${alias}`);
  }
  if (!coveredSkills.has(authority)) {
    fail(`Alias authority is not covered by a track: ${authority}`);
  }
  if (alias === authority) {
    fail(`Alias cannot point to itself: ${alias}`);
  }
}

finish();

function fail(message) {
  errors.push(message);
}

function finish() {
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    console.error(`Course validation failed with ${errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`Tracks: ${manifest.tracks.length}`);
  console.log(`Checkpoints: ${checkpointCount}`);
  console.log(`Covered skills: ${coveredSkills.size}`);
  console.log("Course structure is valid.");
}
