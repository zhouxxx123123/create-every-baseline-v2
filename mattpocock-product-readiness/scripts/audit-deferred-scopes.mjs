#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PHRASES = [
  /(?:本票|本项|本轮|本确认|本问题|本段|它)不(?:再)?确认/,
  /(?:本票|本项|本轮|本确认|本问题|本段|它)不决定/,
  /本次不确认/,
  /暂不确认/,
  /尚未确认/,
  /仍未确认/,
  /后续(?:单独|分别|另行|再)?确认/,
  /留(?:到|给)(?:后续)?(?:原型|规格|技术|实现|生产)/,
  /后续(?:原型|技术|规格|实现|生产)?验证/,
  /\bdeferred\b/i,
  /\bnot yet specified\b/i,
];

function usage() {
  console.log(
    "Usage: audit-deferred-scopes.mjs [--ledger FILE] [--strict] [--json] SOURCE..."
  );
}

function parseArgs(argv) {
  const options = {
    ledger: null,
    strict: false,
    json: false,
    help: false,
    sources: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--strict") {
      options.strict = true;
    } else if (value === "--json") {
      options.json = true;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else if (value === "--ledger") {
      options.ledger = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--ledger=")) {
      options.ledger = value.slice("--ledger=".length);
    } else {
      options.sources.push(value);
    }
  }
  return options;
}

function collectMarkdownFiles(input, files) {
  const resolved = path.resolve(input);
  if (!existsSync(resolved)) {
    throw new Error(`Source does not exist: ${input}`);
  }
  const stats = statSync(resolved);
  if (stats.isFile()) {
    if (resolved.endsWith(".md")) files.add(resolved);
    return;
  }
  for (const name of readdirSync(resolved)) {
    if (name === ".git" || name === "node_modules") continue;
    collectMarkdownFiles(path.join(resolved, name), files);
  }
}

function normalizeLine(line) {
  return line
    .replace(/<!--.*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceId(relativePath, normalizedLine) {
  const identity = `${relativePath}\n${normalizedLine}`;
  const digest = createHash("sha256").update(identity).digest("hex").slice(0, 12);
  return `DS-${digest}`;
}

export function scanSources(sourcePaths, cwd = process.cwd(), excludedPaths = []) {
  const files = new Set();
  for (const source of sourcePaths) collectMarkdownFiles(source, files);
  const excluded = new Set(excludedPaths.map((item) => path.resolve(item)));

  const candidates = [];
  for (const file of [...files].filter((item) => !excluded.has(item)).sort()) {
    const relativePath = path.relative(cwd, file).split(path.sep).join("/");
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    let inFence = false;
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index];
      if (/^\s*```/.test(raw)) {
        inFence = !inFence;
        continue;
      }
      if (inFence || /deferred-source:/.test(raw)) continue;
      const normalized = normalizeLine(raw);
      if (!normalized || !PHRASES.some((pattern) => pattern.test(normalized))) continue;
      candidates.push({
        id: sourceId(relativePath, normalized),
        file: relativePath,
        line: index + 1,
        text: normalized,
      });
    }
  }
  return candidates;
}

export function auditCoverage(candidates, ledgerText = "") {
  return candidates.map((candidate) => {
    const occurrences = ledgerText.split(candidate.id).length - 1;
    const escapedId = candidate.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const classMatches = [
      ...ledgerText.matchAll(
        new RegExp(
          `deferred-source:\\s*${escapedId}\\s*;\\s*class:\\s*([A-Z_]+)`,
          "g"
        )
      ),
    ];
    const classes = classMatches.map((match) => match[1]);
    return {
      ...candidate,
      occurrences,
      covered: occurrences === 1,
      classes,
      unclassified: occurrences === 1 && classes.length === 0,
      needsClassification: classes.includes("NEEDS_CLASSIFICATION"),
    };
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.sources.length === 0) {
    usage();
    process.exitCode = 2;
    return;
  }

  const ledgerText = options.ledger
    ? readFileSync(path.resolve(options.ledger), "utf8")
    : "";
  const results = auditCoverage(
    scanSources(
      options.sources,
      process.cwd(),
      options.ledger ? [options.ledger] : []
    ),
    ledgerText
  );
  const missing = results.filter((item) => item.occurrences === 0);
  const duplicated = results.filter((item) => item.occurrences > 1);
  const unclassified = results.filter((item) => item.unclassified);
  const needsClassification = results.filter(
    (item) => item.needsClassification
  );
  const valid = results.filter(
    (item) =>
      item.occurrences === 1 &&
      !item.unclassified &&
      !item.needsClassification
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          candidates: results.length,
          covered: valid.length,
          missing: missing.length,
          duplicated: duplicated.length,
          unclassified: unclassified.length,
          needsClassification: needsClassification.length,
          results,
        },
        null,
        2
      )
    );
  } else {
    console.log(
      `Deferred sources: ${results.length}; covered: ${valid.length}; missing: ${missing.length}; duplicated: ${duplicated.length}; unclassified: ${unclassified.length}; needs-classification: ${needsClassification.length}`
    );
    for (const item of missing) {
      console.log(`MISSING\t${item.id}\t${item.file}:${item.line}\t${item.text}`);
    }
    for (const item of duplicated) {
      console.log(
        `DUPLICATED(${item.occurrences})\t${item.id}\t${item.file}:${item.line}\t${item.text}`
      );
    }
    for (const item of unclassified) {
      console.log(
        `UNCLASSIFIED\t${item.id}\t${item.file}:${item.line}\t${item.text}`
      );
    }
    for (const item of needsClassification) {
      console.log(
        `NEEDS_CLASSIFICATION\t${item.id}\t${item.file}:${item.line}\t${item.text}`
      );
    }
  }

  if (
    options.strict &&
    (missing.length > 0 ||
      duplicated.length > 0 ||
      unclassified.length > 0 ||
      needsClassification.length > 0)
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
