#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ALLOWED_STATUSES = new Set(["open", "claimed", "resolved"]);

function usage() {
  console.error(
    "Usage: node validate-local-map.mjs <map.md> [--tickets <dir>] [--require-active] [--json]",
  );
}

function parseArgs(argv) {
  const options = {
    mapPath: null,
    ticketsDir: null,
    requireActive: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--tickets") {
      options.ticketsDir = argv[index + 1];
      index += 1;
    } else if (value === "--require-active") {
      options.requireActive = true;
    } else if (value === "--json") {
      options.json = true;
    } else if (!options.mapPath) {
      options.mapPath = value;
    } else {
      throw new Error(`Unexpected argument: ${value}`);
    }
  }

  if (!options.mapPath) {
    throw new Error("A map path is required.");
  }

  return options;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function field(text, name) {
  const match = text.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, "m"));
  return match ? match[1].trim() : null;
}

function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.trim() === `## ${heading}`,
  );
  if (start === -1) {
    return "";
  }

  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      break;
    }
    body.push(lines[index]);
  }
  return body.join("\n");
}

function discoverTicketsDir(mapPath, explicitDir) {
  if (explicitDir) {
    return path.resolve(explicitDir);
  }

  const effortDir = path.dirname(mapPath);
  for (const candidate of ["decisions", "issues"]) {
    const candidatePath = path.join(effortDir, candidate);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
      return candidatePath;
    }
  }

  throw new Error(
    `Could not find a decisions/ or issues/ directory beside ${mapPath}.`,
  );
}

function ticketIdFromFilename(filePath) {
  const match = path.basename(filePath).match(/^(\d+)-/);
  return match ? match[1] : null;
}

function normalizeId(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isNaN(numeric) ? value : String(numeric);
}

function parseBlockers(rawValue) {
  if (!rawValue || /^(none|无)$/i.test(rawValue.trim())) {
    return [];
  }

  return [...rawValue.matchAll(/\b\d+\b/g)].map((match) =>
    normalizeId(match[0]),
  );
}

function markdownLinks(text) {
  const links = [];
  for (const match of text.matchAll(/(?<!!)\[[^\]]*]\(([^)]+)\)/g)) {
    links.push(match[1].trim().replace(/^<|>$/g, ""));
  }
  return links;
}

function resolveLocalLink(sourcePath, href) {
  if (
    !href ||
    href.startsWith("#") ||
    /^[a-z][a-z0-9+.-]*:/i.test(href) ||
    href.includes("<")
  ) {
    return null;
  }

  const withoutAnchor = href.split("#", 1)[0];
  if (!withoutAnchor) {
    return null;
  }

  let decoded = withoutAnchor;
  try {
    decoded = decodeURIComponent(withoutAnchor);
  } catch {
    // Keep the literal path so the missing-link report remains actionable.
  }

  return path.resolve(path.dirname(sourcePath), decoded);
}

function relativeDisplay(baseDir, filePath) {
  const relative = path.relative(baseDir, filePath);
  return relative || path.basename(filePath);
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

  const mapPath = path.resolve(options.mapPath);
  if (!fs.existsSync(mapPath)) {
    console.error(`Map not found: ${mapPath}`);
    process.exit(2);
  }

  let ticketsDir;
  try {
    ticketsDir = discoverTicketsDir(mapPath, options.ticketsDir);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  const effortDir = path.dirname(mapPath);
  const errors = [];
  const warnings = [];
  const ticketFiles = fs
    .readdirSync(ticketsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(ticketsDir, name))
    .sort();

  const tickets = [];
  const ticketsById = new Map();
  const ticketsByPath = new Map();

  for (const filePath of ticketFiles) {
    const text = readText(filePath);
    const id = ticketIdFromFilename(filePath);
    const status = field(text, "Status");
    const type = field(text, "Type");
    const blockedByRaw = field(text, "Blocked by");
    const blockers = parseBlockers(blockedByRaw);
    const title = text.match(/^#\s+(.+?)\s*$/m)?.[1] ?? path.basename(filePath);
    const ticket = {
      id: id ? normalizeId(id) : null,
      filePath,
      title,
      type,
      status,
      blockers,
    };

    if (!id) {
      errors.push(`Ticket filename lacks a numeric prefix: ${filePath}`);
    } else if (ticketsById.has(ticket.id)) {
      errors.push(
        `Duplicate ticket number ${ticket.id}: ${ticketsById.get(ticket.id).filePath} and ${filePath}`,
      );
    } else {
      ticketsById.set(ticket.id, ticket);
    }

    if (!type) {
      errors.push(`Missing Type field: ${filePath}`);
    }
    if (!status) {
      errors.push(`Missing Status field: ${filePath}`);
    } else if (!ALLOWED_STATUSES.has(status)) {
      errors.push(`Invalid Status '${status}': ${filePath}`);
    }
    if (blockedByRaw === null) {
      errors.push(`Missing Blocked by field: ${filePath}`);
    }

    tickets.push(ticket);
    ticketsByPath.set(path.resolve(filePath), ticket);
  }

  for (const ticket of tickets) {
    for (const blockerId of ticket.blockers) {
      if (blockerId === ticket.id) {
        errors.push(`Ticket ${ticket.id} blocks itself: ${ticket.filePath}`);
      } else if (!ticketsById.has(blockerId)) {
        errors.push(
          `Ticket ${ticket.id} references missing blocker ${blockerId}: ${ticket.filePath}`,
        );
      }
    }
  }

  const claimed = tickets.filter((ticket) => ticket.status === "claimed");
  const open = tickets.filter((ticket) => ticket.status === "open");
  const unblockedOpen = open.filter((ticket) =>
    ticket.blockers.every(
      (blockerId) => ticketsById.get(blockerId)?.status === "resolved",
    ),
  );

  if (claimed.length > 1) {
    errors.push(
      `More than one ticket is claimed: ${claimed.map((ticket) => ticket.id).join(", ")}`,
    );
  }
  if (options.requireActive && claimed.length !== 1) {
    errors.push(
      `Expected exactly one claimed ticket, found ${claimed.length}.`,
    );
  }

  const mapText = readText(mapPath);
  const activeSection = section(mapText, "Active frontier");
  const currentFrontierLine = activeSection
    .split(/\r?\n/)
    .find((line) => /Current frontier:/i.test(line));
  let activeTicket = null;

  if (currentFrontierLine) {
    const href = markdownLinks(currentFrontierLine)[0];
    if (!href) {
      errors.push("Current frontier does not contain a canonical ticket link.");
    } else {
      const linkedPath = resolveLocalLink(mapPath, href);
      activeTicket = linkedPath ? ticketsByPath.get(linkedPath) : null;
      if (!activeTicket) {
        errors.push(`Current frontier does not link to a ticket in ${ticketsDir}: ${href}`);
      } else if (activeTicket.status !== "claimed") {
        errors.push(
          `Current frontier ticket ${activeTicket.id} is '${activeTicket.status}', not 'claimed'.`,
        );
      }
    }
  } else if (claimed.length > 0 || options.requireActive) {
    errors.push("Map is missing a 'Current frontier:' line.");
  }

  if (
    activeTicket &&
    claimed.length === 1 &&
    path.resolve(claimed[0].filePath) !== path.resolve(activeTicket.filePath)
  ) {
    errors.push(
      `Map frontier (${activeTicket.id}) differs from claimed ticket (${claimed[0].id}).`,
    );
  }

  if (activeSection && !/Resume target:/i.test(activeSection)) {
    errors.push("Active frontier is missing an exact Resume target.");
  }
  if (activeSection && !/Next skill:/i.test(activeSection)) {
    errors.push("Active frontier is missing a Next skill.");
  }

  for (const sourcePath of [mapPath, ...ticketFiles]) {
    const text = sourcePath === mapPath ? mapText : readText(sourcePath);
    for (const href of markdownLinks(text)) {
      const targetPath = resolveLocalLink(sourcePath, href);
      if (targetPath && !fs.existsSync(targetPath)) {
        errors.push(
          `Broken local link in ${relativeDisplay(effortDir, sourcePath)}: ${href}`,
        );
      }
    }
  }

  const summary = {
    map: mapPath,
    ticketsDir,
    ticketCount: tickets.length,
    statuses: {
      open: open.length,
      claimed: claimed.length,
      resolved: tickets.filter((ticket) => ticket.status === "resolved").length,
    },
    activeTicket: activeTicket
      ? { id: activeTicket.id, title: activeTicket.title, file: activeTicket.filePath }
      : null,
    unblockedOpen: unblockedOpen.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      file: ticket.filePath,
    })),
    warnings,
    errors,
    valid: errors.length === 0,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Map: ${mapPath}`);
    console.log(`Tickets: ${tickets.length}`);
    console.log(
      `Status: ${summary.statuses.resolved} resolved, ${summary.statuses.claimed} claimed, ${summary.statuses.open} open`,
    );
    console.log(
      `Active: ${activeTicket ? `${activeTicket.id} - ${activeTicket.title}` : "None"}`,
    );
    console.log(
      `Unblocked open: ${unblockedOpen.length > 0 ? unblockedOpen.map((ticket) => ticket.id).join(", ") : "None"}`,
    );
    for (const warning of warnings) {
      console.log(`WARN: ${warning}`);
    }
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    console.log(summary.valid ? "Wayfinder map is valid." : "Wayfinder map validation failed.");
  }

  process.exit(summary.valid ? 0 : 1);
}

main();
