#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUILT_IN_COMMANDS = new Set(["compact"]);

function usage() {
  console.error(
    "Usage: node audit-skill-registry.mjs <skill-root>... [--forbid <name>]... [--strict] [--json]",
  );
}

function parseArgs(argv) {
  const options = {
    roots: [],
    forbidden: [],
    strict: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--forbid") {
      if (!argv[index + 1]) {
        throw new Error("--forbid requires a name.");
      }
      options.forbidden.push(argv[index + 1]);
      index += 1;
    } else if (value === "--strict") {
      options.strict = true;
    } else if (value === "--json") {
      options.json = true;
    } else if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    } else {
      options.roots.push(path.resolve(value));
    }
  }

  if (options.roots.length === 0) {
    throw new Error("At least one skill root is required.");
  }

  return options;
}

function walk(directory, results = []) {
  if (!fs.existsSync(directory)) {
    return results;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === ".backup" ||
      entry.name === ".incoming" ||
      entry.name === ".git" ||
      entry.name === "node_modules"
    ) {
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

function parseFrontmatter(text, filePath) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`Missing YAML frontmatter: ${filePath}`);
  }

  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-zA-Z0-9_-]+):\s*(.*?)\s*$/);
    if (field) {
      values[field[1]] = field[2].replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

function findSkillFiles(root) {
  return walk(root).filter((filePath) => path.basename(filePath) === "SKILL.md");
}

function findExplicitInvocations(text) {
  const names = new Set();
  for (const match of text.matchAll(/`(?:\$|\/)([a-z][a-z0-9-]{1,63})`/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/\$([a-z][a-z0-9-]{1,63})\b/g)) {
    names.add(match[1]);
  }
  return [...names];
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

  const errors = [];
  const warnings = [];
  const infos = [];
  const skills = [];
  const names = new Map();

  for (const root of options.roots) {
    if (!fs.existsSync(root)) {
      errors.push(`Skill root does not exist: ${root}`);
      continue;
    }

    for (const skillFile of findSkillFiles(root)) {
      const text = fs.readFileSync(skillFile, "utf8");
      let metadata;
      try {
        metadata = parseFrontmatter(text, skillFile);
      } catch (error) {
        errors.push(error.message);
        continue;
      }

      const name = metadata.name;
      const description = metadata.description;
      if (!name) {
        errors.push(`Missing name: ${skillFile}`);
        continue;
      }
      if (!NAME_PATTERN.test(name) || name.length > 64) {
        errors.push(`Invalid skill name '${name}': ${skillFile}`);
      }
      if (!description) {
        errors.push(`Missing description: ${skillFile}`);
      }
      if (names.has(name)) {
        errors.push(`Duplicate skill name '${name}': ${names.get(name)} and ${skillFile}`);
      } else {
        names.set(name, skillFile);
      }

      const skillDir = path.dirname(skillFile);
      const directoryName = path.basename(skillDir);
      if (directoryName !== name) {
        infos.push(
          `Skill '${name}' uses compatibility directory '${directoryName}'.`,
        );
      }

      const uiMetadata = path.join(skillDir, "agents", "openai.yaml");
      if (fs.existsSync(uiMetadata)) {
        const uiText = fs.readFileSync(uiMetadata, "utf8");
        if (!/^\s*display_name:\s*["']?.+?["']?\s*$/m.test(uiText)) {
          warnings.push(`UI metadata lacks display_name: ${uiMetadata}`);
        }
        if (!/^\s*short_description:\s*["']?.+?["']?\s*$/m.test(uiText)) {
          warnings.push(`UI metadata lacks short_description: ${uiMetadata}`);
        }
      }

      skills.push({ name, skillFile, skillDir });
    }
  }

  const knownNames = new Set(names.keys());
  for (const root of options.roots) {
    for (const filePath of walk(root)) {
      if (!/\.(md|ya?ml|json|mjs|js|ts|py|sh)$/i.test(filePath)) {
        continue;
      }
      const text = fs.readFileSync(filePath, "utf8");
      for (const forbidden of options.forbidden) {
        if (text.includes(forbidden)) {
          errors.push(`Forbidden legacy name '${forbidden}' remains in ${filePath}`);
        }
      }

      if (path.basename(filePath) !== "SKILL.md") {
        continue;
      }

      for (const invocation of findExplicitInvocations(text)) {
        if (
          !knownNames.has(invocation) &&
          !BUILT_IN_COMMANDS.has(invocation) &&
          !invocation.startsWith("Users") &&
          !invocation.startsWith("tmp")
        ) {
          warnings.push(`Unknown explicit invocation '/${invocation}' in ${filePath}`);
        }
      }
    }
  }

  const uniqueWarnings = [...new Set(warnings)];
  const uniqueErrors = [...new Set(errors)];
  const valid =
    uniqueErrors.length === 0 && (!options.strict || uniqueWarnings.length === 0);
  const summary = {
    roots: options.roots,
    skillCount: skills.length,
    names: skills.map((skill) => skill.name).sort(),
    infos: [...new Set(infos)],
    warnings: uniqueWarnings,
    errors: uniqueErrors,
    valid,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Skills: ${summary.skillCount}`);
    for (const info of summary.infos) {
      console.log(`INFO: ${info}`);
    }
    for (const warning of summary.warnings) {
      console.log(`WARN: ${warning}`);
    }
    for (const error of summary.errors) {
      console.error(`ERROR: ${error}`);
    }
    console.log(valid ? "Skill registry is valid." : "Skill registry validation failed.");
  }

  process.exit(valid ? 0 : 1);
}

main();
