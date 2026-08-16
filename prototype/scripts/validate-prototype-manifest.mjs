#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED_HEADINGS = [
  "Origin",
  "Prototype unit",
  "Product areas and linkage",
  "Question",
  "Decision sources",
  "In scope",
  "Not validated",
  "States and routes",
  "Prototype versions",
  "Selection history",
  "Journey coverage",
  "Branch coverage",
  "Composition coverage",
  "External boundaries",
  "Review",
  "Conclusion",
  "Resume at",
  "Downstream consumption",
  "Supersession",
];

const VERSION_STATUSES = new Set([
  "RESERVED",
  "CANDIDATE",
  "CURRENT_CANONICAL",
  "NOT_SELECTED",
  "SUPERSEDED",
  "DEFERRED",
]);

function usage() {
  console.error(
    "Usage: node validate-prototype-manifest.mjs <manifest.md> [--require-canonical] [--require-confirmed] [--json]",
  );
}

function parseArgs(argv) {
  const options = {
    manifest: null,
    requireCanonical: false,
    requireConfirmed: false,
    json: false,
  };
  for (const value of argv) {
    if (value === "--require-canonical") {
      options.requireCanonical = true;
    } else if (value === "--require-confirmed") {
      options.requireConfirmed = true;
      options.requireCanonical = true;
    } else if (value === "--json") {
      options.json = true;
    } else if (!options.manifest) {
      options.manifest = value;
    } else {
      throw new Error(`Unexpected argument: ${value}`);
    }
  }
  if (!options.manifest) {
    throw new Error("A prototype manifest path is required.");
  }
  return options;
}

function stripFormatting(value) {
  return String(value ?? "")
    .trim()
    .replace(/^`|`$/g, "")
    .trim();
}

function isPlaceholder(value) {
  const normalized = stripFormatting(value);
  return (
    !normalized ||
    /^<.*>$/.test(normalized) ||
    /^(tbd|todo|unknown)$/i.test(normalized)
  );
}

function isNone(value) {
  return /^(none|not applicable)$/i.test(stripFormatting(value));
}

function splitModuleIds(value) {
  return stripFormatting(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isOpaqueDisplayName(value) {
  const normalized = stripFormatting(value);
  if (/^(?:[A-Z]{1,3}|[A-Z]\d+[A-Z]?|\d+[A-Z]+)$/i.test(normalized)) {
    return true;
  }
  if (/^[A-Z0-9]+(?:[+/_-][A-Z0-9]+)+$/i.test(normalized)) {
    return true;
  }
  return /^(?:option|variant|version|route|layout|方案|版本|路线|变体)\s*[-_:]?\s*[A-Z0-9+/_-]+$/i.test(
    normalized,
  );
}

function headingSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^##\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^##\s+/.test(lines[cursor])) {
        break;
      }
      body.push(lines[cursor]);
    }
    sections.set(match[1], body.join("\n").trim());
  }
  return sections;
}

function bulletFields(body) {
  const values = new Map();
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+\*\*?([^:*]+)\*?\*?:\s*(.*?)\s*$/);
    if (match) {
      values.set(match[1].trim(), stripFormatting(match[2]));
      continue;
    }
    const plain = line.match(/^\s*-\s+([^:]+):\s*(.*?)\s*$/);
    if (plain) {
      values.set(plain[1].trim(), stripFormatting(plain[2]));
    }
  }
  return values;
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((cell) => stripFormatting(cell.replace(/\\\|/g, "|")));
}

function parseTable(body) {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = splitTableRow(lines[0]);
  const separator = splitTableRow(lines[1]);
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return { headers: [], rows: [] };
  }

  const rows = lines.slice(2).map((line) => {
    const cells = splitTableRow(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function realRows(rows, identityColumn) {
  return rows.filter((row) => {
    const identity = stripFormatting(row[identityColumn]);
    return (
      !isPlaceholder(identity) &&
      !/^(none|not applicable)$/i.test(identity)
    );
  });
}

function localLinks(body) {
  const links = [];
  for (const match of body.matchAll(/(?<!!)\[[^\]]*]\(([^)]+)\)/g)) {
    const href = match[1].trim().replace(/^<|>$/g, "");
    if (
      href.startsWith("#") ||
      /^[a-z][a-z0-9+.-]*:/i.test(href) ||
      href.includes("<")
    ) {
      continue;
    }
    links.push(href.split("#", 1)[0]);
  }
  return links.filter(Boolean);
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

  const manifestPath = path.resolve(options.manifest);
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(2);
  }

  const text = fs.readFileSync(manifestPath, "utf8");
  const sections = headingSections(text);
  const errors = [];
  const warnings = [];

  for (const heading of REQUIRED_HEADINGS) {
    if (!sections.has(heading)) {
      errors.push(`Missing section: ## ${heading}`);
    }
  }

  const unit = bulletFields(sections.get("Prototype unit") ?? "");
  for (const key of [
    "Prototype ID",
    "Type",
    "Bounded target",
    "Natural entry",
    "Terminal outcome",
    "Return path or handoff",
  ]) {
    if (isPlaceholder(unit.get(key))) {
      errors.push(`Prototype unit requires '${key}'.`);
    }
  }
  const prototypeType = unit.get("Type");
  if (prototypeType && !["STATE", "COMPONENT", "WORKFLOW"].includes(prototypeType)) {
    errors.push(`Invalid prototype Type: ${prototypeType}`);
  }

  for (const heading of ["Origin", "Question", "Decision sources", "In scope", "Not validated", "Conclusion", "Resume at"]) {
    if (sections.has(heading) && isPlaceholder(sections.get(heading))) {
      errors.push(`Section ## ${heading} is empty or still a placeholder.`);
    }
  }

  const versionsTable = parseTable(sections.get("Prototype versions") ?? "");
  const versionRows = realRows(versionsTable.rows, "Version ID");
  if (versionRows.length === 0) {
    errors.push("Prototype versions has no concrete version rows.");
  }
  const displayNameColumn = versionsTable.headers.includes("Display name")
    ? "Display name"
    : versionsTable.headers.includes("Display label")
      ? "Display label"
      : null;
  if (!displayNameColumn) {
    errors.push("Prototype versions requires a 'Display name' column.");
  } else if (displayNameColumn === "Display label") {
    warnings.push(
      "Legacy 'Display label' column found; migrate it to 'Display name' and preserve old codes under 'Legacy aliases'.",
    );
  }
  if (!versionsTable.headers.includes("Legacy aliases")) {
    const message =
      "Prototype versions has no 'Legacy aliases' column; add it when migrating historical codes.";
    if (displayNameColumn === "Display name") {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  const seenVersionIds = new Set();
  const seenReferences = new Set();
  const composedVersions = [];
  for (const row of versionRows) {
    const versionId = row["Version ID"];
    const fullReference = row["Full prototype reference"];
    const displayName = displayNameColumn ? row[displayNameColumn] : "";
    const status = stripFormatting(row.Status);
    if (seenVersionIds.has(versionId)) {
      errors.push(`Duplicate Version ID: ${versionId}`);
    }
    seenVersionIds.add(versionId);
    if (isPlaceholder(fullReference)) {
      errors.push(`Version ${versionId} lacks a full prototype reference.`);
    } else if (seenReferences.has(fullReference)) {
      errors.push(`Duplicate full prototype reference: ${fullReference}`);
    } else {
      seenReferences.add(fullReference);
    }
    if (!VERSION_STATUSES.has(status)) {
      errors.push(`Version ${versionId} has invalid status '${status}'.`);
    }
    if (isPlaceholder(displayName)) {
      errors.push(`Version ${versionId} requires a semantic display name.`);
    } else if (isOpaqueDisplayName(displayName)) {
      const message =
        `Version ${versionId} uses opaque display name '${displayName}'; ` +
        "use a semantic name and move historical codes to 'Legacy aliases'.";
      if (displayNameColumn === "Display label") {
        warnings.push(`Legacy manifest: ${message}`);
      } else {
        errors.push(message);
      }
    }

    const composedFrom = stripFormatting(row["Composed from"]);
    if (!isPlaceholder(composedFrom) && !isNone(composedFrom)) {
      const moduleIds = splitModuleIds(composedFrom);
      const duplicateModuleIds = moduleIds.filter(
        (moduleId, index) => moduleIds.indexOf(moduleId) !== index,
      );
      if (moduleIds.length === 0) {
        errors.push(`Version ${versionId} has an empty Composed from module set.`);
      }
      for (const moduleId of new Set(duplicateModuleIds)) {
        errors.push(`Version ${versionId} repeats Module ID '${moduleId}' in Composed from.`);
      }
      composedVersions.push({ row, moduleIds });
    }
  }

  if (composedVersions.length > 0 && prototypeType !== "WORKFLOW") {
    errors.push("Only a WORKFLOW prototype may declare Composed from modules.");
  }

  const canonicalRows = versionRows.filter(
    (row) => stripFormatting(row.Status) === "CURRENT_CANONICAL",
  );
  if (canonicalRows.length > 1) {
    errors.push("More than one version is CURRENT_CANONICAL.");
  }
  if (options.requireCanonical && canonicalRows.length !== 1) {
    errors.push(
      `Expected exactly one CURRENT_CANONICAL version, found ${canonicalRows.length}.`,
    );
  }

  const canonical = canonicalRows[0] ?? null;
  if (canonical) {
    if (
      isPlaceholder(canonical["Immutable artifact ref"]) ||
      /^none|not applicable$/i.test(canonical["Immutable artifact ref"])
    ) {
      errors.push("CURRENT_CANONICAL version lacks an immutable artifact ref.");
    }
    if (
      isPlaceholder(canonical["Fixture ref"]) ||
      /^none|not applicable$/i.test(canonical["Fixture ref"])
    ) {
      errors.push("CURRENT_CANONICAL version lacks a fixture ref.");
    }
  }

  const selectionRows = realRows(
    parseTable(sections.get("Selection history") ?? "").rows,
    "Full prototype reference",
  );
  if (canonical && selectionRows.length === 0) {
    errors.push("CURRENT_CANONICAL version has no selection history.");
  }
  if (
    canonical &&
    selectionRows.length > 0 &&
    selectionRows.at(-1)["Full prototype reference"] !==
      canonical["Full prototype reference"]
  ) {
    errors.push("Latest selection history row does not match CURRENT_CANONICAL.");
  }

  const journeyRows = realRows(
    parseTable(sections.get("Journey coverage") ?? "").rows,
    "Step ID",
  );
  const branchRows = realRows(
    parseTable(sections.get("Branch coverage") ?? "").rows,
    "Branch ID",
  );
  const compositionContractBody = sections.get("Composition contract") ?? "";
  const compositionContract = bulletFields(compositionContractBody);
  const compositionInventoryRows = realRows(
    parseTable(compositionContractBody).rows,
    "Module ID",
  );
  const compositionRows = realRows(
    parseTable(sections.get("Composition coverage") ?? "").rows,
    "Integrated ID",
  );
  const seenCoverageIds = new Set();
  for (const [kind, rows, idColumn] of [
    ["Step", journeyRows, "Step ID"],
    ["Branch", branchRows, "Branch ID"],
    ["Integrated", compositionRows, "Integrated ID"],
  ]) {
    for (const row of rows) {
      const id = row[idColumn];
      if (seenCoverageIds.has(id)) {
        errors.push(`Duplicate coverage ID: ${id}`);
      }
      seenCoverageIds.add(id);
      if (isPlaceholder(id)) {
        errors.push(`${kind} coverage contains a placeholder ID.`);
      }
    }
  }

  if (composedVersions.length > 0) {
    if (!sections.has("Composition contract")) {
      errors.push("Composed prototype requires section: ## Composition contract");
    }
    const requestedModuleCount = Number.parseInt(
      compositionContract.get("Requested module count") ?? "",
      10,
    );
    if (!Number.isInteger(requestedModuleCount) || requestedModuleCount < 1) {
      errors.push("Composition contract requires a positive integer Requested module count.");
    }
    for (const key of ["Integrated project", "Start command", "Formal integration URL"]) {
      const value = compositionContract.get(key);
      if (isPlaceholder(value) || isNone(value)) {
        errors.push(`Composition contract requires one concrete '${key}'.`);
      }
    }
    if (compositionInventoryRows.length === 0) {
      errors.push("Composed prototype requires concrete Composition contract inventory rows.");
    }

    const inventoryByReference = new Map();
    for (const row of compositionInventoryRows) {
      const reference = stripFormatting(row["Full prototype reference"]);
      const moduleId = stripFormatting(row["Module ID"]);
      if (isPlaceholder(reference)) {
        errors.push(`Composition Module ID '${moduleId}' lacks a full prototype reference.`);
        continue;
      }
      if (!inventoryByReference.has(reference)) {
        inventoryByReference.set(reference, []);
      }
      inventoryByReference.get(reference).push(row);

      for (const key of [
        "Requested capability",
        "Source manifest",
        "Source version",
        "Artifact ref",
        "Fixture ref",
        "Integrated surface",
      ]) {
        if (isPlaceholder(row[key]) || isNone(row[key])) {
          errors.push(`Composition Module ID '${moduleId}' requires '${key}'.`);
        }
      }
      if (stripFormatting(row["Integrated count"]) !== "1") {
        errors.push(`Composition Module ID '${moduleId}' must have Integrated count 1.`);
      }
      const runtimeCheck = stripFormatting(row["Runtime check"]);
      if (!["PASS", "FAIL", "NOT_RUN"].includes(runtimeCheck)) {
        errors.push(
          `Composition Module ID '${moduleId}' has invalid Runtime check '${runtimeCheck}'.`,
        );
      }
    }

    for (const { row: version, moduleIds } of composedVersions) {
      const reference = version["Full prototype reference"];
      const inventory = inventoryByReference.get(reference) ?? [];
      const seenModuleIds = new Set();
      const seenSurfaces = new Set();
      for (const item of inventory) {
        const moduleId = stripFormatting(item["Module ID"]);
        const surface = stripFormatting(item["Integrated surface"]);
        if (seenModuleIds.has(moduleId)) {
          errors.push(`Composition ${reference} repeats inventory Module ID '${moduleId}'.`);
        }
        seenModuleIds.add(moduleId);
        if (!isPlaceholder(surface) && !isNone(surface)) {
          if (seenSurfaces.has(surface)) {
            errors.push(`Composition ${reference} repeats integrated surface '${surface}'.`);
          }
          seenSurfaces.add(surface);
        }
      }

      const declaredSet = new Set(moduleIds);
      const inventorySet = new Set(inventory.map((item) => stripFormatting(item["Module ID"])));
      const coverageForReference = compositionRows.filter(
        (item) => stripFormatting(item["Full prototype reference"]) === reference,
      );
      const coverageSet = new Set(
        coverageForReference.map((item) => stripFormatting(item["Module ID"])),
      );

      if (Number.isInteger(requestedModuleCount) && inventory.length !== requestedModuleCount) {
        errors.push(
          `Composition ${reference} inventory has ${inventory.length} modules; expected ${requestedModuleCount}.`,
        );
      }
      for (const moduleId of declaredSet) {
        if (!inventorySet.has(moduleId)) {
          errors.push(`Composition ${reference} declares missing inventory Module ID '${moduleId}'.`);
        }
      }
      for (const moduleId of inventorySet) {
        if (!declaredSet.has(moduleId)) {
          errors.push(`Composition ${reference} inventory has undeclared Module ID '${moduleId}'.`);
        }
        if (!coverageSet.has(moduleId)) {
          errors.push(`Composition ${reference} lacks coverage for Module ID '${moduleId}'.`);
        }
      }
      for (const moduleId of coverageSet) {
        if (!inventorySet.has(moduleId)) {
          errors.push(`Composition ${reference} has orphan coverage Module ID '${moduleId}'.`);
        }
      }

      const inventoryByModuleId = new Map(
        inventory.map((item) => [stripFormatting(item["Module ID"]), item]),
      );
      for (const coverage of coverageForReference) {
        const moduleId = stripFormatting(coverage["Module ID"]);
        const expected = inventoryByModuleId.get(moduleId);
        if (!expected) {
          continue;
        }
        if (stripFormatting(coverage["Source manifest"]) !== stripFormatting(expected["Source manifest"])) {
          errors.push(`Composition ${reference} Module ID '${moduleId}' source manifest mismatch.`);
        }
        if (stripFormatting(coverage["Source version"]) !== stripFormatting(expected["Source version"])) {
          errors.push(`Composition ${reference} Module ID '${moduleId}' source version mismatch.`);
        }
      }
    }

    const composedReferences = new Set(
      composedVersions.map(({ row }) => row["Full prototype reference"]),
    );
    for (const reference of inventoryByReference.keys()) {
      if (!composedReferences.has(reference)) {
        errors.push(`Composition inventory references non-composed version '${reference}'.`);
      }
    }
  } else if (compositionInventoryRows.length > 0 || compositionRows.length > 0) {
    errors.push("Non-composed prototype must not contain concrete composition rows.");
  }

  if (prototypeType === "WORKFLOW" && journeyRows.length === 0) {
    errors.push("WORKFLOW prototype requires concrete journey coverage.");
  }

  const review = bulletFields(sections.get("Review") ?? "");
  const reviewStatus = review.get("Status");
  if (
    reviewStatus &&
    !["EXPLORING", "PARTIALLY_CONFIRMED", "CONFIRMED"].includes(reviewStatus)
  ) {
    errors.push(`Invalid Review Status: ${reviewStatus}`);
  }
  if (options.requireConfirmed && reviewStatus !== "CONFIRMED") {
    errors.push(`Expected Review Status CONFIRMED, found '${reviewStatus ?? "missing"}'.`);
  }
  if (reviewStatus === "CONFIRMED") {
    if (!canonical) {
      errors.push("CONFIRMED review requires one CURRENT_CANONICAL version.");
    } else {
      if (review.get("Version reviewed") !== canonical["Full prototype reference"]) {
        errors.push("Reviewed version does not match CURRENT_CANONICAL.");
      }
      if (review.get("Immutable artifact reviewed") !== canonical["Immutable artifact ref"]) {
        errors.push("Reviewed artifact does not match CURRENT_CANONICAL.");
      }
      if (review.get("Fixture reviewed") !== canonical["Fixture ref"]) {
        errors.push("Reviewed fixture does not match CURRENT_CANONICAL.");
      }
    }
    if (isPlaceholder(review.get("Exact reviewed scope"))) {
      errors.push("CONFIRMED review requires an exact reviewed scope.");
    }
  }

  if (options.requireConfirmed && canonical) {
    const canonicalReference = canonical["Full prototype reference"];
    for (const row of journeyRows.filter(
      (candidate) =>
        candidate["Full prototype reference"] === canonicalReference &&
        candidate.Reachability !== "OUT_OF_SCOPE",
    )) {
      if (row["Mechanical check"] !== "PASS") {
        errors.push(`Journey ${row["Step ID"]} is not mechanically PASS.`);
      }
      if (row["Product review"] !== "CONFIRMED") {
        errors.push(`Journey ${row["Step ID"]} is not product CONFIRMED.`);
      }
      if (row.Reachability === "DIRECT_STATE_ONLY") {
        errors.push(`Journey ${row["Step ID"]} is only DIRECT_STATE_ONLY.`);
      }
    }

    const canonicalComposition = composedVersions.find(
      ({ row }) => row["Full prototype reference"] === canonicalReference,
    );
    if (canonicalComposition) {
      for (const row of compositionInventoryRows.filter(
        (candidate) => candidate["Full prototype reference"] === canonicalReference,
      )) {
        const moduleId = row["Module ID"];
        if (row["Runtime check"] !== "PASS") {
          errors.push(`Composition Module ID '${moduleId}' is not runtime PASS.`);
        }
        if (isPlaceholder(row.Evidence) || isNone(row.Evidence)) {
          errors.push(`Composition Module ID '${moduleId}' lacks runtime evidence.`);
        }
      }
      for (const row of compositionRows.filter(
        (candidate) => candidate["Full prototype reference"] === canonicalReference,
      )) {
        if (isPlaceholder(row.Evidence) || isNone(row.Evidence)) {
          errors.push(`Composition coverage '${row["Integrated ID"]}' lacks evidence.`);
        }
      }
    }
  }

  const downstream = bulletFields(sections.get("Downstream consumption") ?? "");
  const downstreamCanonical = downstream.get("Current canonical prototype version");
  if (
    canonical &&
    !isPlaceholder(downstreamCanonical) &&
    downstreamCanonical !== canonical["Full prototype reference"]
  ) {
    errors.push("Downstream canonical version does not match CURRENT_CANONICAL.");
  }
  if (options.requireConfirmed && isPlaceholder(downstreamCanonical)) {
    errors.push("Confirmed manifest requires a downstream canonical version.");
  }

  for (const heading of ["Decision sources", "Resume at"]) {
    for (const href of localLinks(sections.get(heading) ?? "")) {
      const target = path.resolve(path.dirname(manifestPath), decodeURIComponent(href));
      if (!fs.existsSync(target)) {
        errors.push(`Broken local link in ## ${heading}: ${href}`);
      }
    }
  }

  const summary = {
    manifest: manifestPath,
    prototypeId: unit.get("Prototype ID") ?? null,
    type: prototypeType ?? null,
    versions: versionRows.length,
    currentCanonical: canonical?.["Full prototype reference"] ?? null,
    reviewStatus: reviewStatus ?? null,
    coverageIds: seenCoverageIds.size,
    compositionModules: compositionInventoryRows.length,
    warnings,
    errors,
    valid: errors.length === 0,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Manifest: ${manifestPath}`);
    console.log(`Prototype: ${summary.prototypeId ?? "Unknown"} (${summary.type ?? "Unknown"})`);
    console.log(`Versions: ${summary.versions}`);
    console.log(`Current canonical: ${summary.currentCanonical ?? "None"}`);
    console.log(`Review: ${summary.reviewStatus ?? "None"}`);
    for (const warning of warnings) {
      console.log(`WARN: ${warning}`);
    }
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    console.log(summary.valid ? "Prototype manifest is valid." : "Prototype manifest validation failed.");
  }

  process.exit(summary.valid ? 0 : 1);
}

main();
