#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const MACHINE_BLOCK =
  /<!--\s*product-readiness-receipt:v1\s*\n([\s\S]*?)\n-->/;

function usage() {
  console.error(
    [
      "Usage:",
      "  node readiness-receipt.mjs create --config <config.json> --output <receipt.md>",
      "  node readiness-receipt.mjs verify <receipt.md> [--json]",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const command = argv[0];
  const options = { command, config: null, output: null, receipt: null, json: false };

  if (command === "create") {
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === "--config") {
        options.config = argv[index + 1];
        index += 1;
      } else if (argv[index] === "--output") {
        options.output = argv[index + 1];
        index += 1;
      } else {
        throw new Error(`Unexpected argument: ${argv[index]}`);
      }
    }
    if (!options.config || !options.output) {
      throw new Error("create requires --config and --output.");
    }
  } else if (command === "verify") {
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === "--json") {
        options.json = true;
      } else if (!options.receipt) {
        options.receipt = argv[index];
      } else {
        throw new Error(`Unexpected argument: ${argv[index]}`);
      }
    }
    if (!options.receipt) {
      throw new Error("verify requires a receipt path.");
    }
  } else {
    throw new Error("Command must be create or verify.");
  }

  return options;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeHeading(value) {
  return value.replace(/^#{1,6}\s+/, "").trim();
}

function extractScope(text, heading, filePath) {
  if (!heading) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  const wanted = normalizeHeading(heading);
  let start = -1;
  let level = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match && normalizeHeading(match[2]) === wanted) {
      start = index;
      level = match[1].length;
      break;
    }
  }

  if (start === -1) {
    throw new Error(`Heading '${heading}' not found in ${filePath}`);
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }

  return `${lines.slice(start, end).join("\n")}\n`;
}

function slugifyHeading(value) {
  return normalizeHeading(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function markdownEscape(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function relativeLink(fromFile, toFile, heading) {
  let relative = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
  if (!relative.startsWith(".")) {
    relative = `./${relative}`;
  }
  return heading ? `${relative}#${slugifyHeading(heading)}` : relative;
}

function listOrDefault(values, fallback) {
  return Array.isArray(values) && values.length > 0 ? values : [fallback];
}

function requireText(config, key) {
  if (typeof config[key] !== "string" || !config[key].trim()) {
    throw new Error(`Config requires non-empty '${key}'.`);
  }
  return config[key].trim();
}

function createReceipt(configPathValue, outputPathValue) {
  const configPath = path.resolve(configPathValue);
  const outputPath = path.resolve(outputPathValue);
  if (fs.existsSync(outputPath)) {
    throw new Error(`Receipt already exists and is immutable: ${outputPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const id = requireText(config, "id");
  const target = requireText(config, "target");
  const specificationBoundary = requireText(config, "specificationBoundary");
  const verdict = requireText(config, "verdict");
  if (verdict !== "READY_FOR_TO_SPEC") {
    throw new Error("A persisted readiness receipt must use verdict READY_FOR_TO_SPEC.");
  }
  if (!Array.isArray(config.sources) || config.sources.length === 0) {
    throw new Error("Config requires at least one canonical source.");
  }

  const assessedAt =
    typeof config.assessedAt === "string" && config.assessedAt.trim()
      ? config.assessedAt.trim()
      : new Date().toISOString();
  const supersedes =
    typeof config.supersedes === "string" && config.supersedes.trim()
      ? config.supersedes.trim()
      : "None";

  const sourceIdentities = config.sources.map((source, index) => {
    if (!source || typeof source.path !== "string" || !source.path.trim()) {
      throw new Error(`Source ${index + 1} requires a path.`);
    }
    const sourcePath = path.resolve(path.dirname(configPath), source.path);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`Canonical source not found: ${sourcePath}`);
    }
    const text = fs.readFileSync(sourcePath, "utf8");
    const heading =
      typeof source.heading === "string" && source.heading.trim()
        ? source.heading.trim()
        : null;
    const content = extractScope(text, heading, sourcePath);
    return {
      label:
        typeof source.label === "string" && source.label.trim()
          ? source.label.trim()
          : path.basename(sourcePath),
      path: path.relative(path.dirname(outputPath), sourcePath).split(path.sep).join("/"),
      heading,
      sha256: sha256(content),
    };
  });

  const machineIdentity = {
    schema: "product-readiness-receipt/v1",
    id,
    target,
    specificationBoundary,
    assessedAt,
    verdict,
    supersedes,
    sources: sourceIdentities,
  };

  const sourceRows = sourceIdentities
    .map((source) => {
      const absoluteSource = path.resolve(path.dirname(outputPath), source.path);
      const link = relativeLink(outputPath, absoluteSource, source.heading);
      return `| [${markdownEscape(source.label)}](${link}) | ${markdownEscape(source.heading ?? "Complete file")} | \`sha256:${source.sha256}\` |`;
    })
    .join("\n");

  const prototypeRows =
    Array.isArray(config.prototypeIdentities) && config.prototypeIdentities.length > 0
      ? config.prototypeIdentities
          .map(
            (prototype) =>
              `| ${markdownEscape(prototype.manifest)} | ${markdownEscape(prototype.fullPrototypeReference)} | ${markdownEscape(prototype.immutableArtifactRef)} | ${markdownEscape(prototype.fixtureRef)} | ${markdownEscape(prototype.admittedIds)} |`,
          )
          .join("\n")
      : "| Not applicable | Not applicable | Not applicable | Not applicable | Not applicable |";

  const explicitBoundaries = listOrDefault(
    config.explicitBoundaries,
    "No additional explicit boundaries recorded.",
  )
    .map((value) => `- ${value}`)
    .join("\n");
  const remainingItems = listOrDefault(
    config.remainingNonBlockingItems,
    "No remaining non-blocking items recorded.",
  )
    .map((value) => `- ${value}`)
    .join("\n");
  const compositionIdentity =
    typeof config.compositionIdentity === "string" &&
    config.compositionIdentity.trim()
      ? config.compositionIdentity.trim()
      : "Not applicable.";

  const receipt = `# Product Readiness Receipt

- Receipt ID: \`${id}\`
- Target: ${target}
- Specification boundary: ${specificationBoundary}
- Assessed at: \`${assessedAt}\`
- Verdict: \`${verdict}\`
- Supersedes: ${supersedes}

## Canonical source identities

| Source | Exact relevant anchor | Revision or content identity |
| --- | --- | --- |
${sourceRows}

## Prototype identities

| Manifest | Full prototype reference | Immutable artifact ref | Fixture ref | Admitted IDs |
| --- | --- | --- | --- | --- |
${prototypeRows}

## Composition identity

${compositionIdentity}

## Explicit boundaries

${explicitBoundaries}

## Remaining non-blocking items

${remainingItems}

<!-- product-readiness-receipt:v1
${JSON.stringify(machineIdentity, null, 2)}
-->
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, receipt, { flag: "wx" });
  console.log(`Created immutable readiness receipt: ${outputPath}`);
}

function verifyReceipt(receiptPathValue, jsonOutput) {
  const receiptPath = path.resolve(receiptPathValue);
  if (!fs.existsSync(receiptPath)) {
    throw new Error(`Receipt not found: ${receiptPath}`);
  }

  const text = fs.readFileSync(receiptPath, "utf8");
  const match = text.match(MACHINE_BLOCK);
  if (!match) {
    throw new Error(
      "Receipt lacks a machine-verifiable product-readiness-receipt:v1 block.",
    );
  }

  const metadata = JSON.parse(match[1]);
  const errors = [];
  if (metadata.schema !== "product-readiness-receipt/v1") {
    errors.push(`Unsupported schema: ${metadata.schema}`);
  }
  if (metadata.verdict !== "READY_FOR_TO_SPEC") {
    errors.push(`Unexpected verdict: ${metadata.verdict}`);
  }
  if (!Array.isArray(metadata.sources) || metadata.sources.length === 0) {
    errors.push("Receipt has no canonical sources.");
  }

  const checkedSources = [];
  for (const source of metadata.sources ?? []) {
    const sourcePath = path.resolve(path.dirname(receiptPath), source.path);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      errors.push(`Source is missing: ${source.path}`);
      checkedSources.push({ ...source, status: "MISSING" });
      continue;
    }

    try {
      const sourceText = fs.readFileSync(sourcePath, "utf8");
      const actual = sha256(extractScope(sourceText, source.heading, sourcePath));
      if (actual !== source.sha256) {
        errors.push(
          `Source changed: ${source.path}${source.heading ? `#${slugifyHeading(source.heading)}` : ""}`,
        );
        checkedSources.push({ ...source, actualSha256: actual, status: "STALE" });
      } else {
        checkedSources.push({ ...source, actualSha256: actual, status: "CURRENT" });
      }
    } catch (error) {
      errors.push(error.message);
      checkedSources.push({ ...source, status: "INVALID" });
    }
  }

  const summary = {
    receipt: receiptPath,
    id: metadata.id,
    target: metadata.target,
    verdict: metadata.verdict,
    checkedSources,
    errors,
    valid: errors.length === 0,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Receipt: ${metadata.id}`);
    console.log(`Target: ${metadata.target}`);
    for (const source of checkedSources) {
      console.log(`${source.status}: ${source.path}${source.heading ? ` (${source.heading})` : ""}`);
    }
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    console.log(summary.valid ? "Readiness receipt is current." : "Readiness receipt is stale or invalid.");
  }

  process.exit(summary.valid ? 0 : 1);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.command === "create") {
      createReceipt(options.config, options.output);
    } else {
      verifyReceipt(options.receipt, options.json);
    }
  } catch (error) {
    usage();
    console.error(error.message);
    process.exit(2);
  }
}

main();
