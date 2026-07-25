#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const STATUSES = new Set(["PLANNED", "IN_PROGRESS", "COMPLETE"]);
const VERDICTS = new Set(["FEASIBLE", "NOT_FEASIBLE", "INCONCLUSIVE"]);

const CORE_FIELDS = [
  "Originating workflow",
  "Originating question",
  "Return target",
  "Question",
  "Current hypothesis",
  "Why it matters",
  "Decision this must enable",
  "Minimal validation method",
  "Required data, interfaces, or samples",
  "Timebox",
  "Success criteria",
  "Failure criteria",
  "Safety boundaries",
];

const COMPLETE_FIELDS = [
  "Evidence",
  "Observed result",
  "Verdict and reason",
  "Fallback",
  "Product impact",
  "Specification impact",
  "Ticket impact",
  "Test impact",
  "Not validated",
];

function usage() {
  console.error(
    "Usage: node validate-spike-record.mjs <spike.md> [--require-complete] [--json]",
  );
}

function parseArgs(argv) {
  const options = { record: null, requireComplete: false, json: false };
  for (const value of argv) {
    if (value === "--require-complete") {
      options.requireComplete = true;
    } else if (value === "--json") {
      options.json = true;
    } else if (!options.record) {
      options.record = value;
    } else {
      throw new Error(`Unexpected argument: ${value}`);
    }
  }
  if (!options.record) {
    throw new Error("A spike record path is required.");
  }
  return options;
}

function isPlaceholder(value) {
  const normalized = String(value ?? "")
    .replace(/`/g, "")
    .trim();
  return (
    !normalized ||
    /^<.*>$/.test(normalized) ||
    /^(tbd|todo|unknown|not yet)$/i.test(normalized)
  );
}

function headingSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^#{1,6}\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const level = lines[index].match(/^#+/)[0].length;
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor].match(/^(#{1,6})\s+/);
      if (next && next[1].length <= level) {
        break;
      }
      body.push(lines[cursor]);
    }
    sections.set(match[1].trim(), body.join("\n").trim());
  }
  return sections;
}

function parseFields(text) {
  const fields = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:-\s+)?(?:\*\*)?([^:*]+?)(?:\*\*)?:\s*(.*?)\s*$/);
    if (match) {
      fields.set(match[1].trim(), match[2].trim());
    }
  }

  const sections = headingSections(text);
  for (const [heading, body] of sections) {
    if (!fields.has(heading) && body) {
      fields.set(heading, body);
    }
  }
  return fields;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage();
    console.error(error.message);
    process.exit(2);
  }

  const recordPath = path.resolve(options.record);
  if (!fs.existsSync(recordPath)) {
    console.error(`Spike record not found: ${recordPath}`);
    process.exit(2);
  }

  const text = fs.readFileSync(recordPath, "utf8");
  const fields = parseFields(text);
  const errors = [];
  const warnings = [];
  const status = String(fields.get("Status") ?? "").replace(/`/g, "").trim();
  const verdict = String(fields.get("Verdict") ?? "").replace(/`/g, "").trim();

  if (!STATUSES.has(status)) {
    errors.push(`Status must be PLANNED, IN_PROGRESS, or COMPLETE; found '${status || "missing"}'.`);
  }
  if (options.requireComplete && status !== "COMPLETE") {
    errors.push(`Expected Status COMPLETE, found '${status || "missing"}'.`);
  }

  for (const field of CORE_FIELDS) {
    if (isPlaceholder(fields.get(field))) {
      errors.push(`Missing or placeholder field: ${field}`);
    }
  }

  if (status === "COMPLETE" || options.requireComplete) {
    if (!VERDICTS.has(verdict)) {
      errors.push(
        `Complete spike Verdict must be FEASIBLE, NOT_FEASIBLE, or INCONCLUSIVE; found '${verdict || "missing"}'.`,
      );
    }
    for (const field of COMPLETE_FIELDS) {
      if (isPlaceholder(fields.get(field))) {
        errors.push(`Complete spike lacks: ${field}`);
      }
    }
  } else if (verdict && !VERDICTS.has(verdict)) {
    warnings.push(`Non-final verdict value is not canonical: ${verdict}`);
  }

  if (
    status === "COMPLETE" &&
    /^(none|not applicable)$/i.test(String(fields.get("Evidence") ?? "").trim())
  ) {
    errors.push("A complete spike must preserve reproducible Evidence.");
  }

  if (
    status === "COMPLETE" &&
    /^(none|not applicable)$/i.test(String(fields.get("Return target") ?? "").trim())
  ) {
    errors.push("A complete routed spike requires an exact Return target.");
  }

  const summary = {
    record: recordPath,
    status: status || null,
    verdict: verdict || null,
    originatingWorkflow: fields.get("Originating workflow") ?? null,
    returnTarget: fields.get("Return target") ?? null,
    warnings,
    errors,
    valid: errors.length === 0,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Spike: ${recordPath}`);
    console.log(`Status: ${summary.status ?? "Missing"}`);
    console.log(`Verdict: ${summary.verdict ?? "Not set"}`);
    console.log(`Return target: ${summary.returnTarget ?? "Missing"}`);
    for (const warning of warnings) {
      console.log(`WARN: ${warning}`);
    }
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    console.log(summary.valid ? "Technical spike record is valid." : "Technical spike record validation failed.");
  }

  process.exit(summary.valid ? 0 : 1);
}

main();
