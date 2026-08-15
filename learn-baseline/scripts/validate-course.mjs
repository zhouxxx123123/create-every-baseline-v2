#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const skillRoot = resolve(skillDir, "..");
const manifestPath = join(skillDir, "references", "course-manifest.json");
const requiredMarkers = [
  "**Outcome:**",
  "**Concept:**",
  "**Skill practice:**",
  "**Learner action:**",
  "**Evidence:**",
  "**Hint ladder:**",
  "**Feedback focus:**",
  "**Advance when:**",
  "**Next:**",
];

const errors = [];
let manifest;
let skillContracts;

try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`Cannot read course manifest: ${error.message}`);
  finish();
}
try {
  const contractPath = resolve(skillDir, manifest.skillContractsFile ?? "");
  skillContracts = JSON.parse(readFileSync(contractPath, "utf8"));
} catch (error) {
  fail(`Cannot read skill contract identities: ${error.message}`);
  skillContracts = { skills: {} };
}
if (skillContracts.schemaVersion !== 1) {
  fail(`Unsupported skill contract schema: ${skillContracts.schemaVersion}`);
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
const evidencePaths = new Set();
const coveredSkills = new Map();
const practicedSkills = new Map();
const referenceSkills = new Map();
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

  for (const skillName of track.referenceSkills ?? []) {
    if (!(track.skills ?? []).includes(skillName)) {
      fail(`Track ${track.id} has out-of-scope reference skill: ${skillName}`);
    }
    if (referenceSkills.has(skillName)) {
      fail(`Reference skill appears more than once: ${skillName}`);
    }
    referenceSkills.set(skillName, track.id);
    if (!content.includes(`\`${skillName}\``)) {
      fail(`Track ${track.id} does not name reference skill \`${skillName}\``);
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
    if (
      checkpoint.evidence.startsWith("/") ||
      checkpoint.evidence.includes("..") ||
      !checkpoint.evidence.startsWith("learner-artifacts/")
    ) {
      fail(`Checkpoint ${checkpoint.id} has unsafe evidence path.`);
    }
    if (evidencePaths.has(checkpoint.evidence)) {
      fail(`Duplicate checkpoint evidence path: ${checkpoint.evidence}`);
    }
    evidencePaths.add(checkpoint.evidence);

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
    for (const skillName of checkpoint.practicedSkills ?? []) {
      if (!(track.skills ?? []).includes(skillName)) {
        fail(
          `Checkpoint ${checkpoint.id} practices out-of-scope skill: ${skillName}`,
        );
      }
      if (practicedSkills.has(skillName)) {
        fail(
          `Skill ${skillName} is practiced by both ${practicedSkills.get(skillName)} and ${checkpoint.id}`,
        );
      }
      practicedSkills.set(skillName, checkpoint.id);
      if (!section.includes(`\`${skillName}\``)) {
        fail(
          `Checkpoint ${checkpoint.id} does not name practiced skill \`${skillName}\``,
        );
      }
    }
  }

  for (const skillName of track.skills ?? []) {
    const isPracticed = practicedSkills.has(skillName);
    const isReference = referenceSkills.has(skillName);
    if (isPracticed === isReference) {
      fail(
        `Skill ${skillName} must be exactly one of practiced or reference-only.`,
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

const pinnedSkillNames = Object.keys(skillContracts.skills ?? {}).sort();
if (
  JSON.stringify(pinnedSkillNames) !== JSON.stringify(topLevelSkills)
) {
  const missingPins = topLevelSkills.filter(
    (skillName) => !pinnedSkillNames.includes(skillName),
  );
  const stalePins = pinnedSkillNames.filter(
    (skillName) => !topLevelSkills.includes(skillName),
  );
  if (missingPins.length > 0) {
    fail(`Skills missing contract identity: ${missingPins.join(", ")}`);
  }
  if (stalePins.length > 0) {
    fail(`Contract identities reference removed skills: ${stalePins.join(", ")}`);
  }
}
for (const skillName of topLevelSkills) {
  const skillPath = join(skillRoot, skillName, "SKILL.md");
  const currentDigest = hashFile(skillPath);
  if (skillContracts.skills?.[skillName] !== currentDigest) {
    fail(`Skill contract changed without curriculum review: ${skillName}`);
  }
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
  if (!referenceSkills.has(alias) || practicedSkills.has(alias)) {
    fail(`Compatibility alias must be reference-only: ${alias}`);
  }
}

const foundations = (manifest.tracks ?? []).filter(
  (track) => track.kind === "foundation",
);
if (foundations.length !== 1) {
  fail(`Course requires exactly one foundation track; found ${foundations.length}.`);
}
const capstones = (manifest.tracks ?? []).filter(
  (track) => track.kind === "capstone",
);
if (capstones.length !== 1) {
  fail(`Course requires exactly one capstone track; found ${capstones.length}.`);
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
  console.log(`Practiced skills: ${practicedSkills.size}`);
  console.log(`Reference-only skills: ${referenceSkills.size}`);
  console.log("Course structure is valid.");
}

function hashFile(path) {
  const normalized = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
