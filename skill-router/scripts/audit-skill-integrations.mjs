#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".mjs",
  ".js",
  ".ts",
  ".yaml",
  ".yml",
  ".sh",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".tmp",
  ".backup",
  ".incoming",
  "dist",
  "node_modules",
  "outputs",
  "reference",
  "reports",
  "workflow-snapshots",
]);

function usage() {
  console.error(
    "Usage: node audit-skill-integrations.mjs <skill-root> [--forbid <name>]... [--project <root>]... [--json]",
  );
}

function parseArgs(argv) {
  const options = {
    skillRoot: null,
    forbidden: [],
    projects: [],
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--forbid" || value === "--project") {
      if (!argv[index + 1]) {
        throw new Error(`${value} requires a value.`);
      }
      const target = argv[index + 1];
      if (value === "--forbid") {
        options.forbidden.push(target);
      } else {
        options.projects.push(path.resolve(target));
      }
      index += 1;
    } else if (value === "--json") {
      options.json = true;
    } else if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    } else if (!options.skillRoot) {
      options.skillRoot = path.resolve(value);
    } else {
      throw new Error(`Unexpected positional argument: ${value}`);
    }
  }

  if (!options.skillRoot) {
    throw new Error("A skill root is required.");
  }
  return options;
}

function walk(directory, results = []) {
  if (!fs.existsSync(directory)) {
    return results;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, results);
    } else {
      results.push(entryPath);
    }
  }
  return results;
}

function readJson(filePath, errors) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`Invalid JSON at ${filePath}: ${error.message}`);
    return null;
  }
}

function inspectForbiddenText(filePath, forbidden, errors) {
  if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return;
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const name of forbidden) {
    if (text.includes(name)) {
      errors.push(`Forbidden legacy name '${name}' remains in ${filePath}`);
    }
  }
}

function inspectOpenCodeConfig(filePath, errors) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const config = readJson(filePath, errors);
  const configuredPaths = config?.skills?.paths;
  if (!Array.isArray(configuredPaths)) {
    return;
  }
  for (const configuredPath of configuredPaths) {
    if (typeof configuredPath !== "string") {
      errors.push(`Non-string OpenCode skill path in ${filePath}`);
      continue;
    }
    const expanded = configuredPath.startsWith("~/")
      ? path.join(os.homedir(), configuredPath.slice(2))
      : configuredPath;
    const resolved = path.isAbsolute(expanded)
      ? expanded
      : path.resolve(path.dirname(filePath), expanded);
    if (!fs.existsSync(resolved)) {
      errors.push(`Broken OpenCode skill path '${configuredPath}' in ${filePath}`);
    }
  }
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

  const home = os.homedir();
  const errors = [];
  const checks = [];

  const lockPath = path.join(home, ".agents", ".skill-lock.json");
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath, errors);
    const entries = lock?.skills ?? {};
    for (const name of options.forbidden) {
      if (Object.hasOwn(entries, name)) {
        errors.push(`Forbidden legacy skill '${name}' remains in ${lockPath}`);
      }
    }
    checks.push(lockPath);
  }

  const claudeRoot = path.join(home, ".claude", "skills");
  if (fs.existsSync(claudeRoot)) {
    for (const entry of fs.readdirSync(claudeRoot)) {
      const entryPath = path.join(claudeRoot, entry);
      const stats = fs.lstatSync(entryPath);
      if (options.forbidden.includes(entry)) {
        errors.push(`Forbidden Claude skill entry remains: ${entryPath}`);
      }
      if (stats.isSymbolicLink() && !fs.existsSync(entryPath)) {
        errors.push(`Broken Claude skill symlink: ${entryPath}`);
      }
    }
    checks.push(claudeRoot);
  }

  const transferRoot = path.join(home, ".agents", "skill-transfer-packs");
  if (fs.existsSync(transferRoot)) {
    for (const packName of fs.readdirSync(transferRoot)) {
      if (packName.startsWith(".")) {
        continue;
      }
      const skillsRoot = path.join(transferRoot, packName, "skills");
      if (!fs.existsSync(skillsRoot)) {
        continue;
      }
      for (const name of options.forbidden) {
        if (fs.existsSync(path.join(skillsRoot, name))) {
          errors.push(
            `Forbidden legacy skill '${name}' remains in transfer pack ${packName}`,
          );
        }
      }
      for (const filePath of walk(skillsRoot)) {
        inspectForbiddenText(filePath, options.forbidden, errors);
      }
      checks.push(skillsRoot);
    }
  }

  const globalOpenCode = path.join(home, ".config", "opencode");
  if (fs.existsSync(globalOpenCode)) {
    for (const filePath of walk(globalOpenCode)) {
      inspectForbiddenText(filePath, options.forbidden, errors);
    }
    inspectOpenCodeConfig(path.join(globalOpenCode, "opencode.json"), errors);
    checks.push(globalOpenCode);
  }

  for (const projectRoot of options.projects) {
    if (!fs.existsSync(projectRoot)) {
      errors.push(`Project root does not exist: ${projectRoot}`);
      continue;
    }
    for (const filePath of walk(projectRoot)) {
      inspectForbiddenText(filePath, options.forbidden, errors);
    }
    inspectOpenCodeConfig(path.join(projectRoot, "opencode.json"), errors);
    checks.push(projectRoot);
  }

  const uniqueErrors = [...new Set(errors)];
  const result = {
    skillRoot: options.skillRoot,
    forbidden: options.forbidden,
    checked: checks,
    errors: uniqueErrors,
    valid: uniqueErrors.length === 0,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Integration surfaces checked: ${checks.length}`);
    for (const error of uniqueErrors) {
      console.error(`ERROR: ${error}`);
    }
    console.log(
      result.valid
        ? "Skill integrations are valid."
        : "Skill integration validation failed.",
    );
  }
  process.exit(result.valid ? 0 : 1);
}

main();
