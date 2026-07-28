#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const ADAPTER_VERSION = 3;
const CONFIG_SCHEMA_VERSION = 1;
const args = process.argv.slice(2);
const command =
  args.find((arg) =>
    ["sync", "render", "serve", "doctor", "version"].includes(arg),
  ) || "sync";
if (command === "version") {
  process.stdout.write(`${ADAPTER_VERSION}\n`);
  process.exit(0);
}
const configFlag = args.indexOf("--config");
if (configFlag >= 0 && !args[configFlag + 1]) {
  fail("--config requires a path");
}
const configPath = path.resolve(
  configFlag >= 0 ? args[configFlag + 1] : ".project-board/config.json",
);

if (!fs.existsSync(configPath)) {
  fail(`Project board config not found: ${configPath}`);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const repoRoot = path.resolve(path.dirname(configPath), config.repoRoot || "..");
validateConfig();

if (command === "sync") {
  const items = loadItems();
  const catalog = loadProductCatalog(items);
  syncGitHubProject(items);
  renderLocalHtml(items, catalog);
} else if (command === "render") {
  const items = loadItems();
  renderLocalHtml(items, loadProductCatalog(items));
} else if (command === "serve") {
  const items = loadItems();
  const catalog = loadProductCatalog(items);
  renderLocalHtml(items, catalog);
  serveLocalHtml(items, catalog);
} else if (command === "doctor") {
  const items = loadItems();
  const catalog = loadProductCatalog(items);
  const frontiers = items.filter((item) => item.isFrontier);
  const catalogSummary = catalog
    ? `, ${catalog.nodes.length} catalog node(s), ${catalog.needsClassification.length} catalog classification issue(s)`
    : "";
  process.stdout.write(
    `Project board configuration valid (adapter ${ADAPTER_VERSION}, ${items.length} item(s), ${frontiers.length} frontier(s)${catalogSummary}).\n`,
  );
} else {
  fail(
    "Usage: project-board.mjs [sync|render|serve|doctor|version] [--config <path>]",
  );
}

function validateConfig() {
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    fail(
      `Unsupported config schemaVersion: ${config.schemaVersion ?? "missing"}; expected ${CONFIG_SCHEMA_VERSION}`,
    );
  }
  if (config.adapterVersion !== ADAPTER_VERSION) {
    fail(
      `Project board adapter mismatch: config requires ${config.adapterVersion ?? "an unversioned adapter"}, installed adapter is ${ADAPTER_VERSION}. Run $start-setup in update-board mode.`,
    );
  }
  if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
    fail(`repoRoot is not a directory: ${repoRoot}`);
  }
  if (!["github", "local-markdown"].includes(config.canonicalTracker)) {
    fail(`Unsupported canonicalTracker: ${config.canonicalTracker}`);
  }

  const local = config.surfaces?.localHtml;
  if (local?.enabled) {
    const port = Number(local.port || 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      fail(`Invalid local HTML port: ${local.port}`);
    }
    resolveRepoPath(local.output || ".project-board/index.html", "local HTML output");
  }

  if (config.canonicalTracker === "local-markdown") {
    const roots = config.localMarkdown?.roots || [".scratch"];
    if (!Array.isArray(roots) || roots.length === 0) {
      fail("localMarkdown.roots must contain at least one repository-relative directory");
    }
    for (const root of roots) {
      const rootPath = resolveRepoPath(root, "Local Markdown root");
      if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
        fail(`Local Markdown root is not a directory: ${root}`);
      }
      assertRealPathWithinRepo(rootPath, "Local Markdown root");
    }
  }

  if (config.canonicalTracker === "github") {
    if (!/^[^/\s]+\/[^/\s]+$/.test(config.github?.repository || "")) {
      fail("github.repository must use owner/repository format");
    }
  }

  const catalog = config.productCatalog;
  if (catalog?.enabled) {
    const catalogPath = resolveRepoPath(catalog.path, "product catalog");
    if (!fs.existsSync(catalogPath) || !fs.statSync(catalogPath).isFile()) {
      fail(`Product catalog is not a file: ${catalog.path}`);
    }
    assertRealPathWithinRepo(catalogPath, "product catalog");
  }

  const project = config.surfaces?.githubProject;
  if (project?.enabled) {
    if (config.canonicalTracker !== "github") {
      fail("GitHub Project projection requires GitHub Issues as the canonical tracker");
    }
    if (!project.owner || !Number.isInteger(Number(project.number))) {
      fail("GitHub Project owner and numeric project number are required");
    }
  }
}

function resolveRepoPath(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty repository-relative path`);
  }
  if (path.isAbsolute(value)) {
    fail(`${label} must be repository-relative: ${value}`);
  }
  const target = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, target);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    fail(`${label} escapes repoRoot: ${value}`);
  }
  return target;
}

function assertRealPathWithinRepo(target, label) {
  const realRoot = fs.realpathSync(repoRoot);
  const realTarget = fs.realpathSync(target);
  const relative = path.relative(realRoot, realTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`${label} resolves outside repoRoot: ${target}`);
  }
  return realTarget;
}

function loadItems(options = {}) {
  let items;
  if (config.canonicalTracker === "github") {
    items = loadGitHubIssues(options);
  } else if (config.canonicalTracker === "local-markdown") {
    items = loadLocalMarkdownTickets();
  } else {
    fail(`Unsupported canonicalTracker: ${config.canonicalTracker}`);
  }
  if (items === null) return null;
  return finalizeItems(items);
}

function loadGitHubIssues(options = {}) {
  const repository = config.github?.repository;
  if (!repository) {
    fail("github.repository is required for the GitHub tracker");
  }

  const issueArgs = [
    "issue",
    "list",
    "--repo",
    repository,
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,title,body,state,url,labels,assignees,updatedAt",
  ];
  const raw = options.allowFailure
    ? tryRun("gh", issueArgs, { capture: true })
    : run("gh", issueArgs, { capture: true });
  if (raw === null) return null;

  const issues = JSON.parse(raw);
  const items = issues.map((issue) => {
    const body = String(issue.body || "");
    const labels = issue.labels.map((label) => label.name);
    const blockedBy = parseGitHubReferences(body, "Blocked by").map(
      (number) => `github:#${number}`,
    );
    const parentNumber = body.match(
      /\bPart of\s+#(\d+)\b/i,
    )?.[1];
    return {
      key: `github:#${issue.number}`,
      id: `#${issue.number}`,
      title: issue.title,
      type: "issue",
      state: issue.state.toLowerCase(),
      lane: githubLane(issue.state, labels, issue.assignees),
      labels,
      assignees: issue.assignees.map((assignee) => assignee.login),
      updatedAt: issue.updatedAt,
      url: issue.url,
      projectUrl: issue.url,
      source: "GitHub Issues",
      group: "GitHub Issues",
      parentId: parentNumber ? `github:#${parentNumber}` : null,
      blockedBy,
      catalogImpact: metadata(body, "Catalog impact")?.toUpperCase() || null,
      catalogNodes: parseCatalogNodeIds(metadata(body, "Catalog nodes")),
      productDecision: metadata(body, "Product decision"),
      prototypeValidation: metadata(body, "Prototype validation"),
      technicalValidation: metadata(body, "Technical validation"),
    };
  });

  if (config.github?.loadNativeRelationships !== false) {
    addNativeGitHubRelationships(items, issues, repository);
  }
  return items;
}

function parseGitHubReferences(body, key) {
  const line = String(body || "")
    .split(/\r?\n/)
    .find((candidate) => {
      const plain = candidate.replaceAll("**", "").replace(/^\s*[-*]\s*/, "");
      return new RegExp(`^${escapeRegExp(key)}\\s*:`, "i").test(plain);
    });
  return line ? [...line.matchAll(/#(\d+)\b/g)].map((match) => match[1]) : [];
}

function addNativeGitHubRelationships(items, issues, repository) {
  const byNumber = new Map(items.map((item) => [item.id.slice(1), item]));
  for (const issue of issues) {
    const item = byNumber.get(String(issue.number));
    const dependencies = tryRun(
      "gh",
      [
        "api",
        "--paginate",
        "--slurp",
        `repos/${repository}/issues/${issue.number}/dependencies/blocked_by`,
      ],
      { capture: true },
    );
    if (dependencies) {
      for (const blocker of parseJsonPages(dependencies)) {
        if (blocker?.number) item.blockedBy.push(`github:#${blocker.number}`);
      }
    }

    const labels = issue.labels.map((label) => label.name);
    if (!labels.includes("wayfinder:map")) continue;
    const subIssues = tryRun(
      "gh",
      [
        "api",
        "--paginate",
        "--slurp",
        `repos/${repository}/issues/${issue.number}/sub_issues`,
      ],
      { capture: true },
    );
    if (!subIssues) continue;
    for (const child of parseJsonPages(subIssues)) {
      const childItem = byNumber.get(String(child?.number));
      if (childItem) childItem.parentId = item.key;
    }
  }
}

function parseJsonPages(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const value = JSON.parse(trimmed);
    return flattenJsonPages(value);
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        const value = JSON.parse(line);
        return flattenJsonPages(value);
      });
  }
}

function flattenJsonPages(value) {
  if (!Array.isArray(value)) return [value];
  return value.flatMap((entry) => flattenJsonPages(entry));
}

function githubLane(state, labels, assignees) {
  const roles = {
    needsInfo: "needs-info",
    readyForAgent: "ready-for-agent",
    readyForHuman: "ready-for-human",
    needsTriage: "needs-triage",
    ...config.github?.triageLabels,
  };
  if (state === "CLOSED") return "Done";
  if (labels.includes(roles.needsInfo)) return "Waiting";
  if (labels.includes(roles.readyForAgent) || labels.includes(roles.readyForHuman)) {
    return "Ready";
  }
  if (assignees.length > 0) return "Active";
  if (labels.includes(roles.needsTriage)) return "Triage";
  return "Open";
}

function loadLocalMarkdownTickets() {
  const roots = config.localMarkdown?.roots || [".scratch"];
  const files = roots.flatMap((root) => walkMarkdown(path.resolve(repoRoot, root)));
  const tickets = files
    .map(readLocalArtifact)
    .filter(Boolean);
  const byDirectoryAndNumber = new Map();
  const byAbsolutePath = new Map(
    tickets.map((ticket) => [path.normalize(ticket.absolutePath), ticket]),
  );
  const mapsByEffortRoot = new Map();
  const specsByEffortRoot = new Map();

  for (const ticket of tickets) {
    const number = ticket.fileNumber;
    if (number) {
      byDirectoryAndNumber.set(`${path.dirname(ticket.absolutePath)}:${number}`, ticket);
    }
    if (ticket.stage === "specification") {
      specsByEffortRoot.set(ticket.effortRoot, ticket);
    }
    if (!mapsByEffortRoot.has(ticket.effortRoot)) {
      const mapPath = path.join(ticket.effortRoot, "map.md");
      if (fs.existsSync(mapPath)) {
        mapsByEffortRoot.set(ticket.effortRoot, readEffortMap(mapPath));
      }
    }
  }

  for (const ticket of tickets) {
    if (
      ticket.lane === "Done" ||
      (ticket.blockerNumbers.length === 0 && ticket.blockerPaths.length === 0)
    ) {
      continue;
    }
    const blockers = [
      ...ticket.blockerNumbers.map((number) =>
        byDirectoryAndNumber.get(`${path.dirname(ticket.absolutePath)}:${number}`),
      ),
      ...ticket.blockerPaths.map((target) => byAbsolutePath.get(target)),
    ];
    const unresolved = blockers.some((blocker) => !blocker || blocker.lane !== "Done");
    if (unresolved) ticket.lane = "Blocked";
  }

  return tickets.map((ticket) => {
    const blockedBy = [
      ...ticket.blockerNumbers.map((number) =>
        byDirectoryAndNumber.get(`${path.dirname(ticket.absolutePath)}:${number}`),
      ),
      ...ticket.blockerPaths.map((target) => byAbsolutePath.get(target)),
    ]
      .filter(Boolean)
      .map((blocker) => blocker.key);
    const explicitParent =
      (ticket.parentPath ? byAbsolutePath.get(ticket.parentPath) : null) ||
      (ticket.parentNumber
        ? byDirectoryAndNumber.get(
            `${path.dirname(ticket.absolutePath)}:${ticket.parentNumber}`,
          )
        : null);
    const structuralParent =
      ticket.stage === "implementation"
        ? specsByEffortRoot.get(ticket.effortRoot)
        : null;
    const parent = explicitParent || structuralParent;
    const effortMap = mapsByEffortRoot.get(ticket.effortRoot);
    const {
      absolutePath,
      blockerNumbers,
      blockerPaths,
      effortRoot,
      fileNumber,
      parentNumber,
      parentPath,
      ...cleanTicket
    } = ticket;
    return {
      ...cleanTicket,
      groupTitle: effortMap?.title || cleanTicket.group,
      groupUrl: effortMap?.url || null,
      hasMapAuthority: Boolean(effortMap),
      parentId: parent?.key || null,
      blockedBy: [...new Set(blockedBy)],
      isDeclaredFrontier:
        Boolean(effortMap?.frontierPath) &&
        path.normalize(effortMap.frontierPath) === path.normalize(absolutePath),
    };
  });
}

function walkMarkdown(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if ([".git", "node_modules", "reports"].includes(entry.name)) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(target);
      if (entry.isFile() && entry.name.endsWith(".md")) output.push(target);
    }
  }

  return output;
}

function readLocalArtifact(absolutePath) {
  const body = fs.readFileSync(absolutePath, "utf8");
  const basename = path.basename(absolutePath);
  if (basename === "map.md") return null;
  const status = metadata(body, "Status");
  const isSpecification = basename === "spec.md";
  if (!status && !isSpecification) return null;

  const relativePath = path.relative(repoRoot, absolutePath);
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(absolutePath, ".md");
  const pathSegments = relativePath.split(path.sep);
  const stage = isSpecification
    ? "specification"
    : pathSegments.includes("issues")
      ? "implementation"
      : "product";
  const type =
    metadata(body, "Type") ||
    (stage === "specification"
      ? "spec"
      : stage === "implementation"
        ? "implementation"
        : "ticket");
  const blockers = metadata(body, "Blocked by") || "";
  const parent = metadata(body, "Parent") || metadata(body, "Part of") || "";
  const blockerText = blockers.replace(/\[[^\]]*\]\([^)]+\)/g, "");
  const parentText = parent.replace(/\[[^\]]*\]\([^)]+\)/g, "");
  const blockerNumbers = [...blockerText.matchAll(/\b(\d{1,4})\b/g)].map(
    (match) => String(Number(match[1])),
  );
  const blockerPaths = markdownFileLinks(blockers).map((target) =>
    resolveMarkdownTarget(absolutePath, target),
  );
  const fileNumber = path.basename(absolutePath).match(/^(\d{1,4})[-_]/)?.[1];
  const parentNumber = parentText.match(/\b(\d{1,4})\b/)?.[1];
  const parentPath = markdownFileLinks(parent)[0]
    ? resolveMarkdownTarget(absolutePath, markdownFileLinks(parent)[0])
    : null;
  const scratchIndex = pathSegments.indexOf(".scratch");
  const group =
    scratchIndex >= 0 && pathSegments[scratchIndex + 1]
      ? pathSegments[scratchIndex + 1]
      : path.dirname(relativePath);
  const effortRoot =
    scratchIndex >= 0 && pathSegments[scratchIndex + 1]
      ? path.resolve(repoRoot, ...pathSegments.slice(0, scratchIndex + 2))
      : path.dirname(absolutePath);
  const lane = status ? localLane(status) : "Artifact";

  return {
    absolutePath,
    blockerNumbers,
    blockerPaths,
    effortRoot,
    fileNumber: fileNumber ? String(Number(fileNumber)) : null,
    parentNumber: parentNumber ? String(Number(parentNumber)) : null,
    parentPath,
    key: `local:${relativePath}`,
    id: isSpecification
      ? "SPEC"
      : fileNumber
        ? fileNumber.padStart(2, "0")
        : relativePath,
    title,
    type,
    stage,
    state: status ? status.toLowerCase() : "published",
    lane,
    labels: [],
    assignees: [],
    updatedAt: fs.statSync(absolutePath).mtime.toISOString(),
    url: `/source?path=${encodeURIComponent(relativePath)}`,
    projectUrl: null,
    source: "Local Markdown",
    group,
    parentId: null,
    participatesInFrontier: Boolean(status),
    catalogImpact: metadata(body, "Catalog impact")?.toUpperCase() || null,
    catalogNodes: parseCatalogNodeIds(metadata(body, "Catalog nodes")),
    productDecision: metadata(body, "Product decision"),
    prototypeValidation: metadata(body, "Prototype validation"),
    technicalValidation: metadata(body, "Technical validation"),
  };
}

function readEffortMap(absolutePath) {
  const body = fs.readFileSync(absolutePath, "utf8");
  const relativePath = path.relative(repoRoot, absolutePath);
  const title =
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    path.basename(path.dirname(absolutePath));
  const activeSection = body.match(
    /^## Active frontier\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m,
  )?.[1];
  const frontierTarget = activeSection
    ? markdownFileLinks(activeSection)[0]
    : null;
  return {
    title,
    url: `/source?path=${encodeURIComponent(relativePath)}`,
    frontierPath: frontierTarget
      ? resolveMarkdownTarget(absolutePath, frontierTarget)
      : null,
  };
}

function markdownFileLinks(value) {
  return [...String(value).matchAll(/\]\(([^)]+\.md(?:#[^)]*)?)\)/g)].map(
    (match) => match[1],
  );
}

function resolveMarkdownTarget(sourcePath, target) {
  const fileTarget = decodeURIComponent(String(target).split("#")[0]);
  return path.normalize(path.resolve(path.dirname(sourcePath), fileTarget));
}

function finalizeItems(items) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const groupsWithMapAuthority = new Set(
    items.filter((item) => item.hasMapAuthority).map((item) => item.group),
  );
  return items.map((item) => {
    const blockedBy = [...new Set(item.blockedBy || [])];
    const unresolvedBlockers = blockedBy.filter((key) => {
      const blocker = byKey.get(key);
      return !blocker || blocker.lane !== "Done";
    });
    const isOpen = item.lane !== "Done" && item.lane !== "Artifact";
    const isFrontierCandidate =
      item.participatesInFrontier !== false &&
      isOpen &&
      unresolvedBlockers.length === 0 &&
      item.lane !== "Active" &&
      item.lane !== "Waiting";
    const isFrontier =
      Boolean(item.isDeclaredFrontier) ||
      (!groupsWithMapAuthority.has(item.group) && isFrontierCandidate);
    return {
      ...item,
      blockedBy,
      isFrontier,
      isFrontierCandidate,
    };
  });
}

function loadProductCatalog(items) {
  const settings = config.productCatalog;
  if (!settings?.enabled) return null;

  const catalogPath = resolveRepoPath(settings.path, "product catalog");
  const body = fs.readFileSync(catalogPath, "utf8");
  const relativeCatalogPath = path.relative(repoRoot, catalogPath);
  const catalogUrl = `/source?path=${encodeURIComponent(relativeCatalogPath)}`;
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const itemByUrl = new Map(items.map((item) => [item.url, item]));
  const headings = [...body.matchAll(/^(#{2,6})\s+(.+?)\s*$/gm)].map((match) => ({
    level: match[1].length,
    title: match[2].trim(),
    index: match.index,
    contentStart: match.index + match[0].length,
  }));
  const nodes = [];
  const nodeById = new Map();
  const stack = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const sectionEnd = headings[index + 1]?.index ?? body.length;
    const section = body.slice(heading.contentStart, sectionEnd);
    const id = metadata(section, "Catalog ID");
    if (!id) continue;
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i.test(id)) {
      fail(`Invalid Catalog ID "${id}" in ${settings.path}`);
    }
    if (nodeById.has(id)) {
      fail(`Duplicate Catalog ID "${id}" in ${settings.path}`);
    }

    while (stack.length && stack.at(-1).level >= heading.level) stack.pop();
    const parentId = stack.at(-1)?.id || null;
    const sourceRefs = markdownLinks(section).map(({ label, target }) =>
      catalogSourceReference(catalogPath, label, target, itemByKey, itemByUrl),
    );
    const node = {
      id,
      key: `catalog:${id}`,
      title: heading.title,
      parentId,
      depth: stack.length,
      phase: metadata(section, "Phase") || "Not recorded",
      summary: metadata(section, "Summary") || "",
      sourceRefs,
      sourceKeys: sourceRefs.map((source) => source.itemKey).filter(Boolean),
      url: `${catalogUrl}#${encodeURIComponent(id)}`,
      updatedAt: fs.statSync(catalogPath).mtime.toISOString(),
    };
    nodes.push(node);
    nodeById.set(id, node);
    stack.push({ id, level: heading.level });
  }

  const allowedImpacts = new Set([
    "ADD",
    "UPDATE",
    "SUPERSEDE",
    "NO_CHANGE",
    "NEEDS_CLASSIFICATION",
  ]);
  const needsClassification = [];
  for (const item of items) {
    if (item.catalogImpact && !allowedImpacts.has(item.catalogImpact)) {
      fail(`Unsupported Catalog impact "${item.catalogImpact}" in ${item.id} · ${item.title}`);
    }
    if (item.catalogImpact === "NEEDS_CLASSIFICATION") {
      needsClassification.push({
        key: item.key,
        id: item.id,
        title: item.title,
        url: item.url,
      });
    }
    if (
      ["ADD", "UPDATE", "SUPERSEDE"].includes(item.catalogImpact) &&
      item.catalogNodes.length === 0
    ) {
      fail(`Catalog impact ${item.catalogImpact} requires Catalog nodes in ${item.id} · ${item.title}`);
    }
    for (const nodeId of item.catalogNodes) {
      const node = nodeById.get(nodeId);
      if (!node) {
        fail(`Unknown Catalog node "${nodeId}" in ${item.id} · ${item.title}`);
      }
      if (!node.sourceKeys.includes(item.key)) node.sourceKeys.push(item.key);
      if (!node.sourceRefs.some((source) => source.itemKey === item.key)) {
        node.sourceRefs.push({
          title: `${item.id} · ${item.title}`,
          url: item.url,
          itemKey: item.key,
        });
      }
    }
  }

  const children = new Map();
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }

  function completeNode(node, ancestry = new Set()) {
    if (ancestry.has(node.id)) fail(`Product catalog cycle detected at "${node.id}"`);
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(node.id);
    const childNodes = (children.get(node.id) || []).map((child) =>
      completeNode(child, nextAncestry),
    );
    const sourceItems = node.sourceKeys.map((key) => itemByKey.get(key)).filter(Boolean);
    const direct = catalogStatuses(sourceItems);
    const inherited = childNodes.map((child) => child.statuses);
    node.statuses = {
      productDecision: aggregateCatalogStatus(
        [direct.productDecision, ...inherited.map((status) => status.productDecision)],
        "product",
      ),
      prototypeValidation: aggregateCatalogStatus(
        [direct.prototypeValidation, ...inherited.map((status) => status.prototypeValidation)],
        "validation",
      ),
      technicalValidation: aggregateCatalogStatus(
        [direct.technicalValidation, ...inherited.map((status) => status.technicalValidation)],
        "technical",
      ),
      specification: aggregateCatalogStatus(
        [direct.specification, ...inherited.map((status) => status.specification)],
        "delivery",
      ),
      implementation: aggregateCatalogStatus(
        [direct.implementation, ...inherited.map((status) => status.implementation)],
        "delivery",
      ),
    };
    const timestamps = sourceItems
      .map((item) => Date.parse(item.updatedAt))
      .filter(Number.isFinite);
    if (timestamps.length) node.updatedAt = new Date(Math.max(...timestamps)).toISOString();
    return node;
  }

  for (const node of nodes.filter((candidate) => !candidate.parentId)) completeNode(node);

  const mappedItemKeys = new Set(nodes.flatMap((node) => node.sourceKeys));
  const exploration = items
    .filter(
      (item) =>
        item.stage === "product" &&
        item.lane !== "Done" &&
        item.lane !== "Artifact" &&
        !mappedItemKeys.has(item.key),
    )
    .map((item) => ({
      key: item.key,
      id: item.id,
      title: item.title,
      lane: item.lane,
      group: item.groupTitle || item.group,
      url: item.url,
      updatedAt: item.updatedAt,
    }));

  return {
    title: body.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Product Catalog",
    path: relativeCatalogPath,
    url: catalogUrl,
    nodes,
    exploration,
    needsClassification,
  };
}

function catalogSourceReference(catalogPath, label, target, itemByKey, itemByUrl) {
  if (/^https?:\/\//i.test(target)) {
    const item = itemByUrl.get(target);
    return {
      title: label || item?.title || target,
      url: target,
      itemKey: item?.key || null,
    };
  }

  const targetPath = resolveMarkdownTarget(catalogPath, target);
  const relative = path.relative(repoRoot, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`Product catalog source escapes repoRoot: ${target}`);
  }
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    fail(`Product catalog source does not exist: ${target}`);
  }
  assertRealPathWithinRepo(targetPath, "product catalog source");
  const key = `local:${relative}`;
  const item = itemByKey.get(key);
  const sourceBody = fs.readFileSync(targetPath, "utf8");
  return {
    title:
      label ||
      item?.title ||
      sourceBody.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
      path.basename(targetPath, ".md"),
    url: item?.url || `/source?path=${encodeURIComponent(relative)}`,
    itemKey: item?.key || null,
  };
}

function catalogStatuses(items) {
  const productItems = items.filter((item) => item.stage === "product");
  const specifications = items.filter((item) => item.stage === "specification");
  const implementation = items.filter((item) => item.stage === "implementation");
  return {
    productDecision: aggregateCatalogStatus(
      productItems.map(productDecisionStatus),
      "product",
    ),
    prototypeValidation: aggregateCatalogStatus(
      productItems.map((item) => validationStatus(item.prototypeValidation)),
      "validation",
    ),
    technicalValidation: aggregateCatalogStatus(
      productItems.map((item) => technicalStatus(item.technicalValidation)),
      "technical",
    ),
    specification: deliveryStatus(specifications, true),
    implementation: deliveryStatus(implementation, false),
  };
}

function productDecisionStatus(item) {
  const explicit = String(item.productDecision || "").toUpperCase();
  if (explicit.includes("CONFIRMED")) return "CONFIRMED";
  if (explicit.includes("PARTIAL")) return "PARTIAL";
  if (explicit.includes("UNRESOLVED") || explicit.includes("UNCONFIRMED")) {
    return "UNCONFIRMED";
  }
  if (item.lane === "Done") return "CONFIRMED";
  if (item.lane === "Active" || item.lane === "Waiting") return "IN_PROGRESS";
  return "UNCONFIRMED";
}

function validationStatus(value) {
  const normalized = String(value || "").toUpperCase().replaceAll("-", "_");
  if (!normalized) return "NOT_RECORDED";
  if (normalized.includes("NOT_VALIDATED") || normalized.includes("UNVALIDATED")) {
    return "NOT_VALIDATED";
  }
  if (normalized.includes("PARTIAL")) return "PARTIALLY_VALIDATED";
  if (normalized.includes("VALIDATED")) return "VALIDATED";
  return "NOT_RECORDED";
}

function technicalStatus(value) {
  const normalized = String(value || "").toUpperCase().replaceAll("-", "_");
  if (!normalized) return "NOT_RECORDED";
  if (normalized.includes("NOT_NEEDED") || normalized.includes("NOT_REQUIRED")) {
    return "NOT_NEEDED";
  }
  if (normalized.includes("NOT_VALIDATED") || normalized.includes("UNVALIDATED")) {
    return "NOT_VALIDATED";
  }
  if (normalized.includes("PARTIAL")) return "PARTIALLY_VALIDATED";
  if (normalized.includes("VALIDATED")) return "VALIDATED";
  return "NOT_RECORDED";
}

function deliveryStatus(items, publishedMeansComplete) {
  if (items.length === 0) return "NOT_STARTED";
  if (items.every((item) => item.lane === "Done" || (publishedMeansComplete && item.lane === "Artifact"))) {
    return "COMPLETED";
  }
  if (items.some((item) => ["Active", "Waiting"].includes(item.lane))) {
    return "IN_PROGRESS";
  }
  return "NOT_STARTED";
}

function aggregateCatalogStatus(values, kind) {
  const statuses = values.filter(
    (value) => value && !["NOT_MAPPED", "NOT_RECORDED", "NOT_STARTED"].includes(value),
  );
  if (statuses.length === 0) {
    if (kind === "product") return "NOT_MAPPED";
    if (kind === "delivery") return "NOT_STARTED";
    return "NOT_RECORDED";
  }
  const unique = new Set(statuses);
  if (unique.size === 1) return statuses[0];
  if (kind === "product") {
    if (unique.has("IN_PROGRESS")) return "IN_PROGRESS";
    return "PARTIAL";
  }
  if (kind === "delivery") {
    if (unique.has("IN_PROGRESS")) return "IN_PROGRESS";
    return unique.has("COMPLETED") ? "IN_PROGRESS" : "NOT_STARTED";
  }
  if (unique.has("PARTIALLY_VALIDATED")) return "PARTIALLY_VALIDATED";
  if (unique.has("VALIDATED") && unique.size > 1) return "PARTIALLY_VALIDATED";
  if (unique.has("NOT_VALIDATED")) return "NOT_VALIDATED";
  if (unique.has("NOT_NEEDED") && unique.size > 1) return "PARTIALLY_VALIDATED";
  return statuses[0];
}

function markdownLinks(value) {
  return [...String(value).matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)].map((match) => ({
    label: match[1].trim(),
    target: match[2].trim(),
  }));
}

function parseCatalogNodeIds(value) {
  return String(value || "")
    .split(/[,，\s]+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function metadata(body, key) {
  for (const line of body.split(/\r?\n/)) {
    const plain = line.replaceAll("**", "").replace(/^\s*[-*]\s*/, "");
    const match = plain.match(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.+)$`, "i"));
    if (match) return match[1].trim().replace(/^`|`$/g, "");
  }
  return null;
}

function localLane(status) {
  const normalized = status.trim().toLowerCase().replaceAll("_", "-");
  if (["resolved", "closed", "done", "wontfix"].includes(normalized)) return "Done";
  if (["claimed", "in-progress", "active"].includes(normalized)) return "Active";
  if (["needs-info", "waiting"].includes(normalized)) return "Waiting";
  if (["ready-for-agent", "ready-for-human", "ready"].includes(normalized)) {
    return "Ready";
  }
  if (["needs-triage", "triage"].includes(normalized)) return "Triage";
  return "Open";
}

function syncGitHubProject(items) {
  const project = config.surfaces?.githubProject;
  if (!project?.enabled) return;
  if (config.canonicalTracker !== "github") {
    fail("GitHub Project projection requires GitHub Issues as the canonical tracker");
  }

  const raw = run(
    "gh",
    [
      "project",
      "item-list",
      String(project.number),
      "--owner",
      project.owner,
      "--limit",
      "1000",
      "--format",
      "json",
    ],
    { capture: true },
  );
  const existingUrls = collectIssueUrls(JSON.parse(raw));
  let added = 0;

  for (const item of items) {
    if (!item.projectUrl || existingUrls.has(item.projectUrl)) continue;
    run("gh", [
      "project",
      "item-add",
      String(project.number),
      "--owner",
      project.owner,
      "--url",
      item.projectUrl,
    ]);
    added += 1;
  }

  process.stdout.write(`GitHub Project synchronized (${added} item(s) added).\n`);
}

function collectIssueUrls(value, urls = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectIssueUrls(item, urls);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (
        key === "url" &&
        typeof child === "string" &&
        /\/issues\/\d+$/.test(child)
      ) {
        urls.add(child);
      } else {
        collectIssueUrls(child, urls);
      }
    }
  }
  return urls;
}

function renderLocalHtml(items, catalog = null) {
  const local = config.surfaces?.localHtml;
  if (!local?.enabled) return;

  const outputPath = resolveRepoPath(
    local.output || ".project-board/index.html",
    "local HTML output",
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  assertRealPathWithinRepo(path.dirname(outputPath), "local HTML output directory");
  fs.writeFileSync(outputPath, htmlDocument(items, catalog), "utf8");
  process.stdout.write(
    `Local HTML rendered (${items.length} item(s)): ${path.relative(repoRoot, outputPath)}\n`,
  );
}

function htmlDocument(items, catalog = null) {
  const safeData = JSON.stringify(items)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  const title = String(config.title || "Project Board");
  const locale = config.locale === "zh-CN" ? "zh-CN" : "en";
  const copy = boardCopy(locale);
  const safeCopy = JSON.stringify(copy)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  const safeCatalog = JSON.stringify(catalog)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  const generatedAt = new Date().toISOString();

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="generator" content="start-setup-project-board">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --canvas:#f5f5f7;
      --surface:#ffffff;
      --sidebar:#f1f1f3;
      --inspector:#fafafa;
      --ink:#1d1d1f;
      --secondary:#6e6e73;
      --tertiary:#8e8e93;
      --hairline:rgba(60,60,67,.16);
      --hairline-strong:rgba(60,60,67,.24);
      --selection:#e8f2ff;
      --selection-strong:#0a84ff;
      --frontier:#30a46c;
      --blocked:#d70015;
      --done:#34c759;
      --warning:#ff9f0a;
      --edge:#8e8e93;
      --source-width:224px;
      --inspector-width:288px;
      color-scheme:light;
    }
    * { box-sizing:border-box; }
    html, body { min-height:100%; }
    body {
      margin:0;
      color:var(--ink);
      background:var(--canvas);
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",sans-serif;
      font-size:13px;
      -webkit-font-smoothing:antialiased;
    }
    button, input, select { font:inherit; }
    button { color:inherit; cursor:pointer; }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline:3px solid rgba(10,132,255,.28);
      outline-offset:1px;
    }
    .window { min-height:100vh; display:grid; grid-template-rows:52px minmax(0,1fr); background:var(--surface); }
    .titlebar {
      position:relative;
      z-index:10;
      display:grid;
      grid-template-columns:170px minmax(0,1fr) 240px;
      align-items:center;
      min-height:52px;
      border-bottom:1px solid var(--hairline);
      background:rgba(250,250,250,.82);
      padding:0 16px;
      backdrop-filter:saturate(180%) blur(22px);
    }
    .traffic-lights { display:flex; gap:8px; align-items:center; }
    .traffic-lights i { width:12px; height:12px; border-radius:50%; border:1px solid rgba(0,0,0,.08); }
    .traffic-lights i:nth-child(1) { background:#ff5f57; }
    .traffic-lights i:nth-child(2) { background:#febc2e; }
    .traffic-lights i:nth-child(3) { background:#28c840; }
    .window-title { overflow:hidden; text-align:center; text-overflow:ellipsis; white-space:nowrap; font-weight:600; letter-spacing:-.01em; }
    .sync-state { color:var(--secondary); font-size:11px; text-align:right; white-space:nowrap; }
    .app-body { min-height:0; display:grid; grid-template-columns:var(--source-width) minmax(460px,1fr) var(--inspector-width); }
    .source-list {
      min-width:0;
      overflow:auto;
      border-right:1px solid var(--hairline);
      background:var(--sidebar);
      padding:14px 10px 12px;
    }
    .source-title { padding:5px 9px 12px; }
    .source-title strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:15px; letter-spacing:-.015em; }
    .source-title span { display:block; margin-top:3px; color:var(--secondary); font-size:11px; }
    .nav-section { margin-top:15px; }
    .nav-label { padding:0 9px 5px; color:var(--tertiary); font-size:11px; font-weight:600; }
    .tabs, .effort-list { display:grid; gap:2px; }
    .tabs button, .effort-list button {
      width:100%;
      min-height:29px;
      display:grid;
      grid-template-columns:18px minmax(0,1fr) auto;
      align-items:center;
      gap:6px;
      border:0;
      border-radius:6px;
      background:transparent;
      padding:4px 8px;
      text-align:left;
    }
    .tabs button:hover, .effort-list button:hover { background:rgba(0,0,0,.045); }
    .tabs button[aria-selected="true"], .effort-list button.active { background:rgba(0,0,0,.075); font-weight:600; }
    .nav-icon { display:grid; place-items:center; width:16px; height:16px; color:var(--selection-strong); font-size:14px; }
    .nav-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nav-count { color:var(--secondary); font-size:11px; font-variant-numeric:tabular-nums; }
    .status-list { display:grid; gap:2px; }
    .status-row { min-height:27px; display:grid; grid-template-columns:18px minmax(0,1fr) auto; align-items:center; gap:6px; padding:3px 8px; }
    .status-dot { width:7px; height:7px; justify-self:center; border-radius:50%; background:var(--tertiary); }
    .status-dot.frontier { background:var(--frontier); }
    .status-dot.blocked { background:var(--blocked); }
    .status-dot.done { background:var(--done); }
    .status-row span:last-child { color:var(--secondary); font-size:11px; font-variant-numeric:tabular-nums; }
    .sidebar-foot { margin-top:18px; border-top:1px solid var(--hairline); padding:11px 9px 0; color:var(--tertiary); font-size:10px; line-height:1.5; }
    .workspace { min-width:0; min-height:0; display:grid; grid-template-rows:64px minmax(0,1fr); background:var(--surface); }
    .toolbar {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
      border-bottom:1px solid var(--hairline);
      padding:10px 16px 10px 18px;
      background:rgba(255,255,255,.86);
      backdrop-filter:saturate(180%) blur(20px);
    }
    .page-heading { min-width:0; }
    .page-heading h1 { margin:0; font-size:17px; font-weight:650; letter-spacing:-.02em; }
    .page-heading p { margin:3px 0 0; color:var(--secondary); font-size:11px; white-space:nowrap; }
    .controls { display:flex; align-items:center; gap:7px; }
    .search-wrap { position:relative; }
    .search-wrap::before { content:"⌕"; position:absolute; left:9px; top:50%; color:var(--tertiary); font-size:15px; transform:translateY(-53%); pointer-events:none; }
    input, select {
      height:30px;
      border:1px solid var(--hairline-strong);
      border-radius:7px;
      background:#fff;
      color:var(--ink);
    }
    input { width:min(290px,29vw); padding:0 10px 0 28px; }
    select { padding:0 26px 0 9px; }
    .content { min-width:0; min-height:0; overflow:auto; background:#fff; }
    .view[hidden] { display:none; }
    .outline-header, .outline-row {
      display:grid;
      grid-template-columns:minmax(260px,1fr) 112px 108px 88px;
      align-items:center;
    }
    .outline-header {
      position:sticky;
      top:0;
      z-index:3;
      min-height:28px;
      border-bottom:1px solid var(--hairline);
      background:rgba(250,250,250,.9);
      color:var(--secondary);
      font-size:10px;
      backdrop-filter:blur(16px);
    }
    .outline-header span { padding:0 10px; }
    .outline-header span + span { border-left:1px solid var(--hairline); }
    .group { border-bottom:1px solid var(--hairline); }
    .group > summary {
      min-height:31px;
      display:flex;
      align-items:center;
      gap:6px;
      cursor:pointer;
      list-style:none;
      background:#fafafa;
      padding:0 11px;
      font-weight:600;
    }
    .group > summary::-webkit-details-marker { display:none; }
    .group > summary::before { content:"⌄"; width:13px; color:var(--secondary); font-size:11px; }
    .group:not([open]) > summary::before { content:"›"; }
    .group-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .group-link { color:inherit; text-decoration:none; }
    .group-link:hover { color:var(--selection-strong); }
    .count { margin-left:auto; color:var(--tertiary); font-size:10px; font-variant-numeric:tabular-nums; }
    .artifact-stage {
      min-height:25px;
      display:flex;
      align-items:center;
      border-top:1px solid rgba(60,60,67,.10);
      background:#f6f6f7;
      padding:0 13px;
      color:var(--tertiary);
      font-size:10px;
      font-weight:600;
    }
    .outline-row {
      width:100%;
      min-height:41px;
      border:0;
      border-top:1px solid rgba(60,60,67,.10);
      background:#fff;
      padding:0;
      text-align:left;
    }
    .outline-row:hover { background:#f7f7f8; }
    .outline-row.selected { background:var(--selection); }
    .outline-row > span { min-width:0; padding:0 10px; }
    .outline-row > span + span { border-left:1px solid rgba(60,60,67,.08); }
    .item-name { display:flex; align-items:center; gap:8px; padding-left:calc(12px + var(--depth,0) * 20px) !important; }
    .item-marker { flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:#c7c7cc; }
    .lane-Active .item-marker, .frontier .item-marker { background:var(--frontier); }
    .lane-Blocked .item-marker { background:var(--blocked); }
    .lane-Done .item-marker { background:var(--done); }
    .item-copy { min-width:0; }
    .item-copy strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:500; }
    .item-copy small { display:block; margin-top:2px; color:var(--tertiary); font-size:10px; }
    .cell-muted { overflow:hidden; color:var(--secondary); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
    .state-label { display:inline-flex; align-items:center; gap:5px; color:var(--secondary); font-size:11px; }
    .state-label::before { content:""; width:6px; height:6px; border-radius:50%; background:#c7c7cc; }
    .lane-Active .state-label::before, .frontier .state-label::before { background:var(--frontier); }
    .lane-Blocked .state-label::before { background:var(--blocked); }
    .lane-Done .state-label::before { background:var(--done); }
    .catalog-header, .catalog-row {
      display:grid;
      grid-template-columns:minmax(300px,1fr) repeat(5,minmax(92px,112px));
      align-items:center;
    }
    .catalog-header {
      position:sticky;
      top:0;
      z-index:3;
      min-height:34px;
      border-bottom:1px solid var(--hairline);
      background:rgba(250,250,250,.92);
      color:var(--secondary);
      font-size:10px;
      backdrop-filter:blur(16px);
    }
    .catalog-header span { padding:0 9px; }
    .catalog-header span + span { border-left:1px solid var(--hairline); }
    .catalog-row {
      width:100%;
      min-height:50px;
      border:0;
      border-bottom:1px solid rgba(60,60,67,.10);
      background:#fff;
      padding:0;
      text-align:left;
    }
    .catalog-row:hover { background:#f7f7f8; }
    .catalog-row.selected { background:var(--selection); }
    .catalog-row > span { min-width:0; padding:0 9px; }
    .catalog-row > span + span { border-left:1px solid rgba(60,60,67,.08); }
    .catalog-name { padding-left:calc(12px + var(--depth,0) * 20px) !important; }
    .catalog-name strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:550; }
    .catalog-name small { display:block; margin-top:3px; overflow:hidden; color:var(--tertiary); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
    .catalog-status {
      display:inline-flex;
      align-items:center;
      gap:5px;
      color:var(--secondary);
      font-size:10px;
      line-height:1.25;
    }
    .catalog-status::before { content:""; flex:0 0 auto; width:6px; height:6px; border-radius:50%; background:#c7c7cc; }
    .catalog-status.status-CONFIRMED::before,
    .catalog-status.status-VALIDATED::before,
    .catalog-status.status-COMPLETED::before,
    .catalog-status.status-NOT_NEEDED::before { background:var(--done); }
    .catalog-status.status-IN_PROGRESS::before,
    .catalog-status.status-PARTIAL::before,
    .catalog-status.status-PARTIALLY_VALIDATED::before { background:var(--warning); }
    .catalog-status.status-UNCONFIRMED::before,
    .catalog-status.status-NOT_VALIDATED::before { background:var(--blocked); }
    .catalog-section-title {
      min-height:30px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      border-top:1px solid var(--hairline);
      border-bottom:1px solid var(--hairline);
      background:#f6f6f7;
      padding:0 13px;
      color:var(--secondary);
      font-size:10px;
      font-weight:600;
    }
    .empty { display:grid; place-items:center; min-height:240px; color:var(--secondary); }
    .flow-head {
      min-height:45px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
      border-bottom:1px solid var(--hairline);
      padding:0 15px;
      color:var(--secondary);
      font-size:11px;
    }
    .legend { display:flex; gap:14px; flex-wrap:wrap; }
    .legend span { display:inline-flex; align-items:center; gap:5px; }
    .legend i { width:7px; height:7px; border-radius:50%; background:#c7c7cc; }
    .legend .frontier-key i { background:var(--frontier); }
    .flow-shell { min-height:calc(100vh - 162px); overflow:auto; background-color:#fff; background-image:radial-gradient(rgba(60,60,67,.14) .7px, transparent .7px); background-size:18px 18px; }
    .flow-shell svg { display:block; min-width:100%; }
    .flow-stage { fill:rgba(250,250,250,.72); stroke:rgba(60,60,67,.12); }
    .flow-stage-title { fill:var(--tertiary); font-size:10px; font-weight:600; }
    .flow-edge { fill:none; stroke:var(--edge); stroke-width:1.3; marker-end:url(#arrow); }
    .flow-node rect { fill:#fff; stroke:rgba(60,60,67,.24); stroke-width:1; rx:6; }
    .flow-node:hover rect { fill:#f7f7f8; stroke:rgba(60,60,67,.38); }
    .flow-node.selected rect { fill:var(--selection); stroke:var(--selection-strong); stroke-width:1.5; }
    .flow-node.frontier rect { stroke:var(--frontier); stroke-width:1.7; }
    .flow-node text { fill:var(--ink); pointer-events:none; }
    .flow-node .node-id { fill:var(--tertiary); font-size:9px; }
    .flow-node .node-title { font-size:11px; font-weight:550; }
    .flow-node .node-status { fill:var(--secondary); font-size:9px; }
    .inspector {
      min-width:0;
      overflow:auto;
      border-left:1px solid var(--hairline);
      background:var(--inspector);
    }
    .inspector-heading {
      min-height:64px;
      display:flex;
      align-items:center;
      border-bottom:1px solid var(--hairline);
      padding:0 16px;
      font-size:13px;
      font-weight:600;
    }
    .inspector-empty { padding:24px 16px; color:var(--secondary); font-size:12px; line-height:1.5; }
    .inspector-hero { padding:18px 16px 16px; border-bottom:1px solid var(--hairline); }
    .inspector-kicker { color:var(--tertiary); font-size:10px; }
    .inspector-hero h2 { margin:7px 0 10px; font-size:16px; line-height:1.35; letter-spacing:-.02em; }
    .inspector-status { display:inline-flex; align-items:center; gap:6px; color:var(--secondary); font-size:11px; }
    .inspector-status::before { content:""; width:7px; height:7px; border-radius:50%; background:#c7c7cc; }
    .inspector-section { padding:14px 16px; border-bottom:1px solid var(--hairline); }
    .inspector-section h3 { margin:0 0 9px; color:var(--tertiary); font-size:10px; font-weight:600; }
    .inspector-summary { margin:0 0 10px; color:var(--secondary); font-size:11px; line-height:1.55; }
    .detail-row { display:grid; grid-template-columns:74px minmax(0,1fr); gap:8px; padding:4px 0; font-size:11px; line-height:1.45; }
    .detail-row dt { color:var(--secondary); }
    .detail-row dd { margin:0; overflow-wrap:anywhere; }
    .tag-list { display:flex; gap:5px; flex-wrap:wrap; }
    .tag { border:1px solid var(--hairline); border-radius:5px; background:#fff; padding:2px 6px; color:var(--secondary); font-size:10px; }
    a.tag { text-decoration:none; }
    a.tag:hover { color:var(--selection-strong); border-color:rgba(10,132,255,.35); }
    .open-button {
      width:calc(100% - 32px);
      min-height:30px;
      margin:14px 16px;
      border:0;
      border-radius:7px;
      background:var(--selection-strong);
      color:#fff;
      font-weight:500;
    }
    @media (max-width:1080px) {
      :root { --source-width:198px; --inspector-width:244px; }
      .outline-header, .outline-row { grid-template-columns:minmax(220px,1fr) 96px 92px; }
      .outline-header span:last-child, .outline-row > span:last-child { display:none; }
      .catalog-header, .catalog-row { grid-template-columns:minmax(250px,1fr) repeat(3,minmax(84px,100px)); }
      .catalog-header span:nth-child(5), .catalog-header span:nth-child(6),
      .catalog-row > span:nth-child(5), .catalog-row > span:nth-child(6) { display:none; }
    }
    @media (max-width:820px) {
      .window { display:block; min-height:100vh; }
      .titlebar { grid-template-columns:80px minmax(0,1fr) 80px; }
      .sync-state { overflow:hidden; text-overflow:ellipsis; }
      .app-body { display:grid; grid-template-columns:1fr; }
      .source-list { border-right:0; border-bottom:1px solid var(--hairline); padding:8px; }
      .source-title, .status-list, .sidebar-foot { display:none; }
      .nav-section { margin:0; }
      .nav-label { display:none; }
      .tabs, .effort-list { display:flex; overflow:auto; }
      .tabs button, .effort-list button { width:auto; min-width:max-content; }
      .workspace { min-height:620px; }
      .inspector { border-top:1px solid var(--hairline); border-left:0; }
      input { width:min(220px,42vw); }
    }
  </style>
</head>
<body>
  <div class="window">
    <header class="titlebar">
      <div class="traffic-lights" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="window-title">${escapeHtml(title)}</div>
      <div class="sync-state">${escapeHtml(copy.lastSync)} ${escapeHtml(generatedAt.slice(0, 16).replace("T", " "))}</div>
    </header>
    <div class="app-body">
      <aside class="source-list">
        <div class="source-title">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(copy.readOnly)}</span>
        </div>
        <div class="nav-section">
          <div class="nav-label">${escapeHtml(copy.boardViews)}</div>
          <div class="tabs" role="tablist" aria-label="${escapeHtml(copy.boardViews)}">
            ${catalog ? `<button id="catalogTab" role="tab" aria-controls="catalogView" aria-selected="true">
              <span class="nav-icon">▦</span><span class="nav-name">${escapeHtml(copy.catalog)}</span><span></span>
            </button>` : ""}
            <button id="treeTab" role="tab" aria-controls="treeView" aria-selected="${catalog ? "false" : "true"}">
              <span class="nav-icon">≡</span><span class="nav-name">${escapeHtml(copy.tree)}</span><span></span>
            </button>
            <button id="flowTab" role="tab" aria-controls="flowView" aria-selected="false">
              <span class="nav-icon">⌘</span><span class="nav-name">${escapeHtml(copy.flow)}</span><span></span>
            </button>
          </div>
        </div>
        <div class="nav-section">
          <div class="nav-label">${escapeHtml(copy.statusOverview)}</div>
          <div id="statusList" class="status-list"></div>
        </div>
        <div id="effortSection" class="nav-section">
          <div class="nav-label">${escapeHtml(copy.efforts)}</div>
          <div id="effortList" class="effort-list"></div>
        </div>
        <div class="sidebar-foot">
          ${escapeHtml(copy.canonical)}<br>
          ${escapeHtml(copy.readOnly)}
        </div>
      </aside>
      <main class="workspace">
        <header class="toolbar">
          <div class="page-heading">
            <h1 id="viewHeading">${escapeHtml(copy.structure)}</h1>
            <p id="viewSummary"></p>
          </div>
          <div class="controls">
            <div class="search-wrap">
              <input id="search" type="search" placeholder="${escapeHtml(copy.searchPlaceholder)}">
            </div>
            <select id="status"><option value="">${escapeHtml(copy.allStatuses)}</option></select>
          </div>
        </header>
        <div class="content">
          ${catalog ? `<div id="catalogView" class="view" role="tabpanel" aria-labelledby="catalogTab"></div>` : ""}
          <div id="treeView" class="view" role="tabpanel" aria-labelledby="treeTab"${catalog ? " hidden" : ""}></div>
          <div id="flowView" class="view" role="tabpanel" aria-labelledby="flowTab" hidden></div>
        </div>
      </main>
      <aside class="inspector">
        <div class="inspector-heading">${escapeHtml(copy.details)}</div>
        <div id="inspectorContent"></div>
      </aside>
    </div>
  </div>
  <script>
    const items = ${safeData};
    const catalog = ${safeCatalog};
    const copy = ${safeCopy};
    const boardLocale = ${JSON.stringify(locale)};
    const byKey = new Map(items.map(item => [item.key, item]));
    const catalogById = new Map((catalog?.nodes || []).map(node => [node.id, node]));
    const laneOrder = ["Open","Triage","Ready","Active","Waiting","Blocked","Artifact","Done"];
    const search = document.querySelector("#search");
    const status = document.querySelector("#status");
    const catalogView = document.querySelector("#catalogView");
    const treeView = document.querySelector("#treeView");
    const flowView = document.querySelector("#flowView");
    const statusList = document.querySelector("#statusList");
    const effortList = document.querySelector("#effortList");
    const effortSection = document.querySelector("#effortSection");
    const viewHeading = document.querySelector("#viewHeading");
    const viewSummary = document.querySelector("#viewSummary");
    const inspectorContent = document.querySelector("#inspectorContent");
    let selectedGroup = "";
    let currentView = catalog ? "catalog" : "tree";
    let selectedCatalogId = sessionStorage.getItem("project-board:catalog-selected");
    if (!catalogById.has(selectedCatalogId)) selectedCatalogId = catalog?.nodes?.[0]?.id || "";
    const savedSelection = sessionStorage.getItem("project-board:selected");
    let selectedKey = byKey.has(savedSelection)
      ? savedSelection
      : (items.find(item => item.isFrontier) || items[0] || {}).key || "";
    for (const value of laneOrder.filter(lane => items.some(item => item.lane === lane))) status.add(new Option(copy.lanes[value] || value, value));

    function visibleItems() {
      const needle = search.value.trim().toLowerCase();
      return items.filter(item => {
        const haystack = [item.id,item.title,item.type,item.state,item.group,...item.labels,...item.assignees].join(" ").toLowerCase();
        return (!needle || haystack.includes(needle)) &&
          (!status.value || item.lane === status.value) &&
          (!selectedGroup || (item.group || item.source) === selectedGroup);
      });
    }

    function visibleCatalogNodes() {
      const needle = search.value.trim().toLowerCase();
      if (!needle) return catalog?.nodes || [];
      const directlyMatched = new Set(
        (catalog?.nodes || [])
          .filter(node =>
            [node.id,node.title,node.summary,node.phase,...node.sourceRefs.map(source => source.title)]
              .join(" ")
              .toLowerCase()
              .includes(needle),
          )
          .map(node => node.id),
      );
      for (const node of catalog?.nodes || []) {
        if (!directlyMatched.has(node.id)) continue;
        let parentId = node.parentId;
        while (parentId) {
          directlyMatched.add(parentId);
          parentId = catalogById.get(parentId)?.parentId;
        }
      }
      return (catalog?.nodes || []).filter(node => directlyMatched.has(node.id));
    }

    function visibleExploration() {
      const needle = search.value.trim().toLowerCase();
      return (catalog?.exploration || []).filter(item =>
        !needle || [item.id,item.title,item.group].join(" ").toLowerCase().includes(needle),
      );
    }

    function formatDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return copy.notAvailable;
      return new Intl.DateTimeFormat(boardLocale, { month:"short", day:"numeric" }).format(date);
    }

    function selectItem(item) {
      selectedCatalogId = "";
      selectedKey = item.key;
      sessionStorage.setItem("project-board:selected", selectedKey);
      render();
    }

    function selectCatalogNode(node) {
      selectedCatalogId = node.id;
      sessionStorage.setItem("project-board:catalog-selected", selectedCatalogId);
      render();
    }

    function renderInspector() {
      const catalogNode = currentView === "catalog" ? catalogById.get(selectedCatalogId) : null;
      if (catalogNode) {
        const hero = Object.assign(document.createElement("section"), { className:"inspector-hero" });
        hero.append(
          Object.assign(document.createElement("div"), {
            className:"inspector-kicker",
            textContent:catalogNode.id + " · " + copy.capability,
          }),
          Object.assign(document.createElement("h2"), { textContent:catalogNode.title }),
          Object.assign(document.createElement("div"), {
            className:"inspector-status",
            textContent:copy.catalogStatuses[catalogNode.statuses.productDecision] || catalogNode.statuses.productDecision,
          }),
        );
        const details = Object.assign(document.createElement("section"), { className:"inspector-section" });
        details.append(Object.assign(document.createElement("h3"), { textContent:copy.properties }));
        const list = document.createElement("dl");
        const rows = [
          [copy.phase, catalogNode.phase],
          [copy.productDecision, copy.catalogStatuses[catalogNode.statuses.productDecision] || catalogNode.statuses.productDecision],
          [copy.prototypeValidation, copy.catalogStatuses[catalogNode.statuses.prototypeValidation] || catalogNode.statuses.prototypeValidation],
          [copy.technicalValidation, copy.catalogStatuses[catalogNode.statuses.technicalValidation] || catalogNode.statuses.technicalValidation],
          [copy.specification, copy.catalogStatuses[catalogNode.statuses.specification] || catalogNode.statuses.specification],
          [copy.implementation, copy.catalogStatuses[catalogNode.statuses.implementation] || catalogNode.statuses.implementation],
        ];
        for (const [label, value] of rows) {
          const row = Object.assign(document.createElement("div"), { className:"detail-row" });
          row.append(
            Object.assign(document.createElement("dt"), { textContent:label }),
            Object.assign(document.createElement("dd"), { textContent:value || copy.notAvailable }),
          );
          list.append(row);
        }
        details.append(list);
        const sourceSection = Object.assign(document.createElement("section"), { className:"inspector-section" });
        sourceSection.append(Object.assign(document.createElement("h3"), { textContent:copy.canonicalSources }));
        if (catalogNode.summary) {
          sourceSection.append(Object.assign(document.createElement("p"), {
            className:"inspector-summary",
            textContent:catalogNode.summary,
          }));
        }
        const sourceList = Object.assign(document.createElement("div"), { className:"tag-list" });
        for (const source of catalogNode.sourceRefs) {
          const link = Object.assign(document.createElement("a"), {
            className:"tag",
            href:source.url,
            textContent:source.title,
          });
          sourceList.append(link);
        }
        if (catalogNode.sourceRefs.length === 0) {
          sourceList.append(Object.assign(document.createElement("span"), {
            className:"tag",
            textContent:copy.derivedFromChildren,
          }));
        }
        sourceSection.append(sourceList);
        const openCatalog = Object.assign(document.createElement("button"), {
          className:"open-button",
          textContent:copy.openCatalog,
        });
        openCatalog.addEventListener("click", () => window.open(catalog.url, "_self"));
        inspectorContent.replaceChildren(hero, details, sourceSection, openCatalog);
        return;
      }
      const item = byKey.get(selectedKey);
      if (!item) {
        inspectorContent.replaceChildren(Object.assign(document.createElement("div"), {
          className:"inspector-empty",
          textContent:copy.noSelection,
        }));
        return;
      }
      const hero = Object.assign(document.createElement("section"), { className:"inspector-hero" });
      hero.append(
        Object.assign(document.createElement("div"), {
          className:"inspector-kicker",
          textContent:item.id + " · " + (copy.types[item.type] || item.type),
        }),
        Object.assign(document.createElement("h2"), { textContent:item.title }),
        Object.assign(document.createElement("div"), {
          className:"inspector-status",
          textContent:item.isFrontier ? copy.currentFrontier : (copy.lanes[item.lane] || item.lane),
        }),
      );
      const details = Object.assign(document.createElement("section"), { className:"inspector-section" });
      details.append(Object.assign(document.createElement("h3"), { textContent:copy.properties }));
      const list = document.createElement("dl");
      const rows = [
        [copy.type, copy.types[item.type] || item.type],
        [copy.state, copy.lanes[item.lane] || item.lane],
        [copy.effort, item.groupTitle || item.group || item.source],
        [copy.updated, formatDate(item.updatedAt)],
        [copy.source, item.source],
      ];
      for (const [label, value] of rows) {
        const row = Object.assign(document.createElement("div"), { className:"detail-row" });
        row.append(
          Object.assign(document.createElement("dt"), { textContent:label }),
          Object.assign(document.createElement("dd"), { textContent:value || copy.notAvailable }),
        );
        list.append(row);
      }
      details.append(list);
      const relations = Object.assign(document.createElement("section"), { className:"inspector-section" });
      relations.append(Object.assign(document.createElement("h3"), { textContent:copy.relationships }));
      const relationList = document.createElement("dl");
      const blockerNames = item.blockedBy.map(key => byKey.get(key)?.id || key);
      const parent = item.parentId ? byKey.get(item.parentId) : null;
      for (const [label, value] of [
        [copy.parent, parent ? parent.id + " · " + parent.title : copy.none],
        [copy.blockedBy, blockerNames.length ? blockerNames.join(", ") : copy.none],
      ]) {
        const row = Object.assign(document.createElement("div"), { className:"detail-row" });
        row.append(
          Object.assign(document.createElement("dt"), { textContent:label }),
          Object.assign(document.createElement("dd"), { textContent:value }),
        );
        relationList.append(row);
      }
      relations.append(relationList);
      const tags = [...item.labels, ...item.assignees.map(value => "@" + value)];
      if (tags.length) {
        const tagSection = Object.assign(document.createElement("section"), { className:"inspector-section" });
        tagSection.append(Object.assign(document.createElement("h3"), { textContent:copy.labelsAndPeople }));
        const tagList = Object.assign(document.createElement("div"), { className:"tag-list" });
        for (const tag of tags) tagList.append(Object.assign(document.createElement("span"), { className:"tag", textContent:tag }));
        tagSection.append(tagList);
        inspectorContent.replaceChildren(hero, details, relations, tagSection, openButton(item));
      } else {
        inspectorContent.replaceChildren(hero, details, relations, openButton(item));
      }
    }

    function openButton(item) {
      const button = Object.assign(document.createElement("button"), {
        className:"open-button",
        textContent:copy.openOriginal,
      });
      button.addEventListener("click", () => window.open(item.url, item.url.startsWith("http") ? "_blank" : "_self"));
      return button;
    }

    function initializeSidebar() {
      const summaryRows = currentView === "catalog"
        ? [
            ["done", copy.confirmedCapabilities, (catalog?.nodes || []).filter(node => node.statuses.productDecision === "CONFIRMED").length],
            ["frontier", copy.evolvingCapabilities, (catalog?.nodes || []).filter(node => ["PARTIAL","IN_PROGRESS"].includes(node.statuses.productDecision)).length],
            ["blocked", copy.unconfirmedCapabilities, (catalog?.nodes || []).filter(node => ["UNCONFIRMED","NOT_MAPPED"].includes(node.statuses.productDecision)).length],
          ]
        : [
            ["frontier", copy.currentFrontier, items.filter(item => item.isFrontier).length],
            ["blocked", copy.blockedItems, items.filter(item => item.lane === "Blocked").length],
            ["done", copy.completedItems, items.filter(item => item.lane === "Done").length],
          ];
      statusList.replaceChildren(...summaryRows.map(([className, label, value]) => {
        const row = Object.assign(document.createElement("div"), { className:"status-row" });
        row.append(
          Object.assign(document.createElement("i"), { className:"status-dot " + className }),
          Object.assign(document.createElement("span"), { textContent:label }),
          Object.assign(document.createElement("span"), { textContent:String(value) })
        );
        return row;
      }));

      const groups = [...new Set(items.map(item => item.group || item.source))].sort();
      const choices = [["", copy.allEfforts, items.length], ...groups.map(group => [
        group,
        group,
        items.filter(item => (item.group || item.source) === group).length
      ])];
      effortList.replaceChildren(...choices.map(([value, label, count]) => {
        const button = document.createElement("button");
        button.className = value === selectedGroup ? "active" : "";
        button.append(
          Object.assign(document.createElement("span"), { className:"nav-icon", textContent:value ? "◇" : "◫" }),
          Object.assign(document.createElement("span"), { className:"nav-name", textContent:label }),
          Object.assign(document.createElement("span"), { className:"nav-count", textContent:String(count) })
        );
        button.addEventListener("click", () => {
          selectedGroup = value;
          initializeSidebar();
          render();
        });
        return button;
      }));
      effortSection.hidden = currentView === "catalog";
    }

    function outlineRow(item, depth) {
      const row = Object.assign(document.createElement("button"), {
        className:"outline-row lane-" + item.lane + (item.isFrontier ? " frontier" : "") + (item.key === selectedKey ? " selected" : ""),
        type:"button",
      });
      row.style.setProperty("--depth", String(depth));
      const name = Object.assign(document.createElement("span"), { className:"item-name" });
      const itemCopy = Object.assign(document.createElement("span"), { className:"item-copy" });
      itemCopy.append(
        Object.assign(document.createElement("strong"), { textContent:item.title }),
        Object.assign(document.createElement("small"), { textContent:item.id }),
      );
      name.append(Object.assign(document.createElement("i"), { className:"item-marker" }), itemCopy);
      row.append(
        name,
        Object.assign(document.createElement("span"), {
          className:"cell-muted",
          textContent:copy.types[item.type] || item.type,
        }),
        Object.assign(document.createElement("span"), {
          className:"state-label",
          textContent:item.isFrontier ? copy.frontier : (copy.lanes[item.lane] || item.lane),
        }),
        Object.assign(document.createElement("span"), {
          className:"cell-muted",
          textContent:formatDate(item.updatedAt),
        }),
      );
      row.addEventListener("click", () => selectItem(item));
      row.addEventListener("dblclick", () => window.open(item.url, item.url.startsWith("http") ? "_blank" : "_self"));
      return row;
    }

    function renderTree(visible) {
      const groups = [...new Set(visible.map(item => item.group || item.source))].sort();
      const root = Object.assign(document.createElement("div"), { className:"tree-root" });
      const header = Object.assign(document.createElement("div"), { className:"outline-header" });
      for (const label of [copy.name, copy.type, copy.state, copy.updated]) {
        header.append(Object.assign(document.createElement("span"), { textContent:label }));
      }
      const groupList = document.createElement("div");
      for (const groupName of groups) {
        const groupItems = visible.filter(item => (item.group || item.source) === groupName);
        const groupMeta = groupItems[0] || {};
        const details = Object.assign(document.createElement("details"), { className:"group", open:true });
        const summary = document.createElement("summary");
        const groupTitle = groupMeta.groupUrl
          ? Object.assign(document.createElement("a"), {
              className:"group-title group-link",
              href:groupMeta.groupUrl,
              textContent:groupMeta.groupTitle || groupName,
            })
          : Object.assign(document.createElement("span"), {
              className:"group-title",
              textContent:groupMeta.groupTitle || groupName,
            });
        groupTitle.addEventListener("click", event => event.stopPropagation());
        summary.append(
          groupTitle,
          Object.assign(document.createElement("span"), { className:"count", textContent:String(groupItems.length) })
        );
        const list = document.createElement("div");
        function appendStage(stageItems, label, baseDepth = 0) {
          if (stageItems.length === 0) return;
          list.append(Object.assign(document.createElement("div"), {
            className:"artifact-stage",
            textContent:label,
          }));
          const stageKeys = new Set(stageItems.map(item => item.key));
          const children = new Map();
          for (const item of stageItems) {
            if (item.parentId && stageKeys.has(item.parentId)) {
              if (!children.has(item.parentId)) children.set(item.parentId, []);
              children.get(item.parentId).push(item);
            }
          }
          const roots = stageItems.filter(item => !item.parentId || !stageKeys.has(item.parentId));
          const rendered = new Set();
          function branch(item, depth = baseDepth, ancestry = new Set()) {
            const fragment = document.createDocumentFragment();
            fragment.append(outlineRow(item, depth));
            rendered.add(item.key);
            if (ancestry.has(item.key)) return fragment;
            const nextAncestry = new Set(ancestry);
            nextAncestry.add(item.key);
            const childItems = (children.get(item.key) || []).sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
            for (const child of childItems) fragment.append(branch(child, depth + 1, nextAncestry));
            return fragment;
          }
          for (const item of roots.sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric:true }))) list.append(branch(item));
          for (const item of stageItems.filter(item => !rendered.has(item.key))) list.append(branch(item));
        }
        const productItems = groupItems.filter(item => !["specification", "implementation"].includes(item.stage));
        const specificationItems = groupItems.filter(item => item.stage === "specification");
        const implementationItems = groupItems.filter(item => item.stage === "implementation");
        appendStage(productItems, copy.productDecisions);
        appendStage(specificationItems, copy.specification);
        appendStage(implementationItems, copy.implementation, specificationItems.length ? 1 : 0);
        details.append(summary, list);
        groupList.append(details);
      }
      if (groups.length === 0) groupList.append(Object.assign(document.createElement("div"), { className:"empty", textContent:copy.noItems }));
      root.append(header, groupList);
      treeView.replaceChildren(root);
    }

    function catalogStatusCell(value) {
      return Object.assign(document.createElement("span"), {
        className:"catalog-status status-" + value,
        textContent:copy.catalogStatuses[value] || value,
      });
    }

    function catalogRow(node) {
      const row = Object.assign(document.createElement("button"), {
        className:"catalog-row" + (node.id === selectedCatalogId ? " selected" : ""),
        type:"button",
      });
      row.style.setProperty("--depth", String(node.depth));
      const name = Object.assign(document.createElement("span"), { className:"catalog-name" });
      name.append(
        Object.assign(document.createElement("strong"), { textContent:node.title }),
        Object.assign(document.createElement("small"), {
          textContent:[node.phase, node.summary].filter(Boolean).join(" · "),
        }),
      );
      row.append(
        name,
        catalogStatusCell(node.statuses.productDecision),
        catalogStatusCell(node.statuses.prototypeValidation),
        catalogStatusCell(node.statuses.technicalValidation),
        catalogStatusCell(node.statuses.specification),
        catalogStatusCell(node.statuses.implementation),
      );
      row.addEventListener("click", () => selectCatalogNode(node));
      row.addEventListener("dblclick", () => window.open(node.url, "_self"));
      return row;
    }

    function explorationRow(item) {
      const row = Object.assign(document.createElement("button"), {
        className:"catalog-row" + (item.key === selectedKey && !selectedCatalogId ? " selected" : ""),
        type:"button",
      });
      row.style.setProperty("--depth", "0");
      const name = Object.assign(document.createElement("span"), { className:"catalog-name" });
      name.append(
        Object.assign(document.createElement("strong"), { textContent:item.title }),
        Object.assign(document.createElement("small"), { textContent:item.id + " · " + item.group }),
      );
      const decisionStatus =
        item.lane === "Active" || item.lane === "Waiting" ? "IN_PROGRESS" : "UNCONFIRMED";
      row.append(
        name,
        catalogStatusCell(decisionStatus),
        catalogStatusCell("NOT_RECORDED"),
        catalogStatusCell("NOT_RECORDED"),
        catalogStatusCell("NOT_STARTED"),
        catalogStatusCell("NOT_STARTED"),
      );
      row.addEventListener("click", () => selectItem(byKey.get(item.key)));
      row.addEventListener("dblclick", () => window.open(item.url, "_self"));
      return row;
    }

    function renderCatalog() {
      if (!catalogView || !catalog) return;
      const visibleNodes = visibleCatalogNodes();
      const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
      const children = new Map();
      for (const node of visibleNodes) {
        if (node.parentId && visibleNodeIds.has(node.parentId)) {
          if (!children.has(node.parentId)) children.set(node.parentId, []);
          children.get(node.parentId).push(node);
        }
      }
      const root = document.createElement("div");
      const header = Object.assign(document.createElement("div"), { className:"catalog-header" });
      for (const label of [
        copy.capability,
        copy.productDecision,
        copy.prototypeValidation,
        copy.technicalValidation,
        copy.specification,
        copy.implementation,
      ]) {
        header.append(Object.assign(document.createElement("span"), { textContent:label }));
      }
      root.append(header);
      const rendered = new Set();
      function branch(node, ancestry = new Set()) {
        if (ancestry.has(node.id)) return;
        const next = new Set(ancestry);
        next.add(node.id);
        root.append(catalogRow(node));
        rendered.add(node.id);
        for (const child of children.get(node.id) || []) branch(child, next);
      }
      for (const node of visibleNodes.filter(node => !node.parentId || !visibleNodeIds.has(node.parentId))) {
        branch(node);
      }
      for (const node of visibleNodes.filter(node => !rendered.has(node.id))) branch(node);

      const exploration = visibleExploration();
      if (exploration.length) {
        const section = Object.assign(document.createElement("div"), {
          className:"catalog-section-title",
        });
        section.append(
          Object.assign(document.createElement("span"), { textContent:copy.exploration }),
          Object.assign(document.createElement("span"), { textContent:String(exploration.length) }),
        );
        root.append(section);
        for (const item of exploration) root.append(explorationRow(item));
      }
      if (visibleNodes.length === 0 && exploration.length === 0) {
        root.append(Object.assign(document.createElement("div"), {
          className:"empty",
          textContent:copy.noItems,
        }));
      }
      catalogView.replaceChildren(root);
    }

    function renderFlow(visible) {
      const visibleByKey = new Map(visible.map(item => [item.key, item]));
      const depthMemo = new Map();
      function productDepth(item, visiting = new Set()) {
        if (depthMemo.has(item.key)) return depthMemo.get(item.key);
        if (visiting.has(item.key)) return 0;
        const next = new Set(visiting);
        next.add(item.key);
        const dependencies = item.blockedBy
          .map(key => visibleByKey.get(key))
          .filter(dependency => dependency && dependency.stage !== "implementation");
        const value = dependencies.length
          ? Math.max(...dependencies.map(dependency => productDepth(dependency, next))) + 1
          : 0;
        depthMemo.set(item.key, value);
        return value;
      }
      const implementationMemo = new Map();
      function implementationDepth(item, visiting = new Set()) {
        if (implementationMemo.has(item.key)) return implementationMemo.get(item.key);
        if (visiting.has(item.key)) return 0;
        const next = new Set(visiting);
        next.add(item.key);
        const dependencies = item.blockedBy
          .map(key => visibleByKey.get(key))
          .filter(dependency => dependency?.stage === "implementation");
        const value = dependencies.length
          ? Math.max(...dependencies.map(dependency => implementationDepth(dependency, next))) + 1
          : 0;
        implementationMemo.set(item.key, value);
        return value;
      }
      const productItems = visible.filter(item => !["specification", "implementation"].includes(item.stage));
      const productMaxDepth = productItems.length
        ? Math.max(...productItems.map(item => productDepth(item)))
        : -1;
      const specificationBase = productMaxDepth + 1;
      const hasSpecification = visible.some(item => item.stage === "specification");
      const implementationBase = specificationBase + (hasSpecification ? 1 : 0);
      const columns = new Map();
      for (const item of visible) {
        const value =
          item.stage === "specification"
            ? specificationBase
            : item.stage === "implementation"
              ? implementationBase + implementationDepth(item)
              : productDepth(item);
        if (!columns.has(value)) columns.set(value, []);
        columns.get(value).push(item);
      }
      for (const column of columns.values()) column.sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
      const maxDepth = Math.max(0, ...columns.keys());
      const maxRows = Math.max(1, ...[...columns.values()].map(column => column.length));
      const nodeWidth = 210;
      const nodeHeight = 64;
      const gapX = 74;
      const gapY = 24;
      const marginX = 28;
      const marginTop = 54;
      const marginBottom = 28;
      const width = marginX * 2 + (maxDepth + 1) * nodeWidth + maxDepth * gapX;
      const height = Math.max(
        470,
        marginTop + marginBottom + maxRows * nodeHeight + Math.max(0, maxRows - 1) * gapY,
      );
      const positions = new Map();
      for (const [columnDepth, column] of columns) {
        column.forEach((item, index) => positions.set(item.key, {
          x:marginX + columnDepth * (nodeWidth + gapX),
          y:marginTop + index * (nodeHeight + gapY)
        }));
      }
      const shell = Object.assign(document.createElement("div"), { className:"flow-shell" });
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      const defs = document.createElementNS(svg.namespaceURI, "defs");
      const marker = document.createElementNS(svg.namespaceURI, "marker");
      marker.setAttribute("id", "arrow");
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "9");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto-start-reverse");
      const arrow = document.createElementNS(svg.namespaceURI, "path");
      arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      arrow.setAttribute("fill", "var(--edge)");
      marker.append(arrow);
      defs.append(marker);
      svg.append(defs);
      for (let columnDepth = 0; columnDepth <= maxDepth; columnDepth += 1) {
        const x = marginX + columnDepth * (nodeWidth + gapX);
        const stage = document.createElementNS(svg.namespaceURI, "rect");
        stage.setAttribute("class", "flow-stage");
        stage.setAttribute("x", String(x - 10));
        stage.setAttribute("y", "12");
        stage.setAttribute("width", String(nodeWidth + 20));
        stage.setAttribute("height", String(height - 24));
        stage.setAttribute("rx", "7");
        const stageTitle = document.createElementNS(svg.namespaceURI, "text");
        stageTitle.setAttribute("class", "flow-stage-title");
        stageTitle.setAttribute("x", String(x));
        stageTitle.setAttribute("y", "34");
        const columnItems = columns.get(columnDepth) || [];
        const stages = new Set(columnItems.map(item => item.stage || "product"));
        stageTitle.textContent =
          stages.size === 1 && stages.has("specification")
            ? copy.specification
            : stages.size === 1 && stages.has("implementation")
              ? copy.implementation
              : stages.size === 1 && stages.has("product")
                ? copy.productDecisions + " " + (columnDepth + 1)
                : copy.stage + " " + (columnDepth + 1);
        svg.append(stage, stageTitle);
      }
      for (const item of visible) {
        const target = positions.get(item.key);
        for (const blockerKey of item.blockedBy) {
          const sourceItem = visibleByKey.get(blockerKey);
          const sourcePosition = positions.get(blockerKey);
          if (!sourceItem || !sourcePosition) continue;
          const startX = sourcePosition.x + nodeWidth;
          const startY = sourcePosition.y + nodeHeight / 2;
          const endX = target.x;
          const endY = target.y + nodeHeight / 2;
          const bend = Math.max(42, (endX - startX) / 2);
          const edge = document.createElementNS(svg.namespaceURI, "path");
          edge.setAttribute("class", "flow-edge");
          edge.setAttribute("d", "M " + startX + " " + startY + " C " + (startX + bend) + " " + startY + ", " + (endX - bend) + " " + endY + ", " + endX + " " + endY);
          svg.append(edge);
        }
      }
      for (const item of visible) {
        const position = positions.get(item.key);
        const group = document.createElementNS(svg.namespaceURI, "g");
        group.setAttribute("class", "flow-node lane-" + item.lane + (item.isFrontier ? " frontier" : "") + (item.key === selectedKey ? " selected" : ""));
        group.setAttribute("transform", "translate(" + position.x + " " + position.y + ")");
        group.setAttribute("role", "button");
        group.setAttribute("tabindex", "0");
        group.style.cursor = "pointer";
        const rect = document.createElementNS(svg.namespaceURI, "rect");
        rect.setAttribute("width", String(nodeWidth));
        rect.setAttribute("height", String(nodeHeight));
        const idText = document.createElementNS(svg.namespaceURI, "text");
        idText.setAttribute("class", "node-id");
        idText.setAttribute("x", "12");
        idText.setAttribute("y", "16");
        idText.textContent = item.id + " · " + (copy.types[item.type] || item.type);
        const titleText = document.createElementNS(svg.namespaceURI, "text");
        titleText.setAttribute("class", "node-title");
        titleText.setAttribute("x", "12");
        titleText.setAttribute("y", "36");
        titleText.textContent = item.title.length > 27 ? item.title.slice(0, 26) + "…" : item.title;
        const statusText = document.createElementNS(svg.namespaceURI, "text");
        statusText.setAttribute("class", "node-status");
        statusText.setAttribute("x", "12");
        statusText.setAttribute("y", "53");
        statusText.textContent = item.isFrontier ? copy.frontier : (copy.lanes[item.lane] || item.lane);
        group.addEventListener("click", () => selectItem(item));
        group.addEventListener("dblclick", () => window.open(item.url, item.url.startsWith("http") ? "_blank" : "_self"));
        group.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") selectItem(item);
        });
        group.append(rect, idText, titleText, statusText);
        svg.append(group);
      }
      if (visible.length === 0) {
        shell.append(Object.assign(document.createElement("div"), { className:"empty", textContent:copy.noItems }));
      } else {
        shell.append(svg);
      }
      const legend = Object.assign(document.createElement("div"), { className:"legend" });
      const standard = document.createElement("span");
      standard.append(document.createElement("i"), copy.ticket);
      const frontier = Object.assign(document.createElement("span"), { className:"frontier-key" });
      frontier.append(document.createElement("i"), copy.currentFrontier);
      const relation = document.createElement("span");
      relation.append(copy.arrowMeaning);
      legend.append(standard, frontier, relation);
      const header = Object.assign(document.createElement("div"), { className:"flow-head" });
      header.append(
        Object.assign(document.createElement("span"), { textContent:copy.flowSubtitle }),
        legend,
      );
      flowView.replaceChildren(header, shell);
    }

    function render() {
      const visible = visibleItems();
      const catalogCount = visibleCatalogNodes().length + visibleExploration().length;
      viewSummary.textContent = copy.visibleCount.replace(
        "{count}",
        currentView === "catalog" ? catalogCount : visible.length,
      );
      renderCatalog();
      renderTree(visible);
      renderFlow(visible);
      renderInspector();
    }

    function selectView(name) {
      currentView = name === "catalog" && catalog ? "catalog" : name === "flow" ? "flow" : "tree";
      const catalogSelected = currentView === "catalog";
      const treeSelected = currentView === "tree";
      const flowSelected = currentView === "flow";
      sessionStorage.setItem("project-board:view", name);
      if (document.querySelector("#catalogTab")) {
        document.querySelector("#catalogTab").setAttribute("aria-selected", String(catalogSelected));
      }
      document.querySelector("#treeTab").setAttribute("aria-selected", String(treeSelected));
      document.querySelector("#flowTab").setAttribute("aria-selected", String(flowSelected));
      if (catalogView) catalogView.hidden = !catalogSelected;
      treeView.hidden = !treeSelected;
      flowView.hidden = !flowSelected;
      viewHeading.textContent = catalogSelected
        ? copy.productCatalog
        : treeSelected
          ? copy.structure
          : copy.dependencies;
      status.disabled = catalogSelected;
      initializeSidebar();
      render();
    }
    search.addEventListener("input", render);
    status.addEventListener("change", render);
    if (document.querySelector("#catalogTab")) {
      document.querySelector("#catalogTab").addEventListener("click", () => selectView("catalog"));
    }
    document.querySelector("#treeTab").addEventListener("click", () => selectView("tree"));
    document.querySelector("#flowTab").addEventListener("click", () => selectView("flow"));
    const savedView = sessionStorage.getItem("project-board:view");
    selectView(
      catalog && !["tree","flow"].includes(savedView)
        ? "catalog"
        : savedView === "flow"
          ? "flow"
          : savedView === "tree"
            ? "tree"
            : catalog
              ? "catalog"
              : "tree",
    );
    if (window.EventSource) {
      const events = new EventSource("/events");
      events.addEventListener("board-updated", () => window.location.reload());
    }
  </script>
</body>
</html>`;
}

function serveLocalHtml(initialItems, initialCatalog = null) {
  const local = config.surfaces?.localHtml;
  if (!local?.enabled) fail("Local HTML surface is not enabled");
  const outputPath = resolveRepoPath(
    local.output || ".project-board/index.html",
    "local HTML output",
  );
  const port = Number(local.port || 4173);
  const liveRefresh = local.liveRefresh;
  const liveRefreshEnabled =
    liveRefresh !== false && liveRefresh?.enabled !== false;
  const debounceMs = Math.max(50, Number(liveRefresh?.debounceMs || 300));
  const clients = new Set();
  let currentFingerprint = boardFingerprint(initialItems, initialCatalog);
  let refreshTimer = null;
  let refreshing = false;
  let queuedReason = null;

  function notifyClients() {
    for (const client of clients) {
      client.write(`event: board-updated\ndata: ${Date.now()}\n\n`);
    }
  }

  function refreshBoard(reason) {
    if (refreshing) {
      queuedReason = reason;
      return;
    }
    refreshing = true;
    try {
      const items = loadItems({ allowFailure: true });
      if (items === null) {
        process.stderr.write(`Live refresh skipped (${reason}): tracker read failed.\n`);
        return;
      }
      const catalog = loadProductCatalog(items);
      const nextFingerprint = boardFingerprint(items, catalog);
      if (nextFingerprint === currentFingerprint) return;
      renderLocalHtml(items, catalog);
      currentFingerprint = nextFingerprint;
      notifyClients();
      process.stdout.write(`Project board refreshed (${reason}).\n`);
    } catch (error) {
      process.stderr.write(`Live refresh failed (${reason}): ${error.message}\n`);
    } finally {
      refreshing = false;
      if (queuedReason) {
        const nextReason = queuedReason;
        queuedReason = null;
        scheduleRefresh(nextReason);
      }
    }
  }

  function scheduleRefresh(reason) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshBoard(reason), debounceMs);
  }

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      return sendFile(response, outputPath, "text/html; charset=utf-8");
    }
    if (requestUrl.pathname === "/favicon.ico") {
      response.writeHead(204);
      return response.end();
    }
    if (requestUrl.pathname === "/health") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      return response.end(
        JSON.stringify({
          adapterVersion: ADAPTER_VERSION,
          canonicalTracker: config.canonicalTracker,
          title: config.title || "Project Board",
        }),
      );
    }
    if (requestUrl.pathname === "/events") {
      response.writeHead(200, {
        "cache-control": "no-cache, no-transform",
        "connection": "keep-alive",
        "content-type": "text/event-stream",
        "x-accel-buffering": "no",
      });
      response.write("retry: 2000\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (requestUrl.pathname === "/source") {
      const relative = requestUrl.searchParams.get("path") || "";
      const target = path.resolve(repoRoot, relative);
      if (!allowedSource(target) || path.extname(target) !== ".md") {
        return send(response, 403, "Source path is not allowed");
      }
      return sendFile(response, target, "text/markdown; charset=utf-8");
    }
    send(response, 404, "Not found");
  });

  server.on("error", (error) => fail(`Local board server failed: ${error.message}`));
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Project board: http://127.0.0.1:${port}/\n`);
    if (liveRefreshEnabled) startLiveBoardRefresh(scheduleRefresh, liveRefresh);
  });

  setInterval(() => {
    for (const client of clients) client.write(": heartbeat\n\n");
  }, 20_000).unref();
}

function startLiveBoardRefresh(scheduleRefresh, options = {}) {
  if (config.canonicalTracker === "local-markdown") {
    startLocalMarkdownWatch(scheduleRefresh, options);
    return;
  }
  if (config.canonicalTracker === "github") {
    const intervalMs = Math.max(5_000, Number(options.githubPollMs || 30_000));
    setInterval(() => scheduleRefresh("GitHub poll"), intervalMs);
    process.stdout.write(`Live refresh: polling GitHub every ${intervalMs}ms.\n`);
  }
}

function startLocalMarkdownWatch(scheduleRefresh, options = {}) {
  const roots = (config.localMarkdown?.roots || [".scratch"])
    .map((root) => path.resolve(repoRoot, root))
    .filter((root) => fs.existsSync(root));
  if (config.productCatalog?.enabled) {
    const catalogDirectory = path.dirname(
      resolveRepoPath(config.productCatalog.path, "product catalog"),
    );
    if (!roots.includes(catalogDirectory)) roots.push(catalogDirectory);
  }
  const watchers = [];
  let polling = false;

  function startPolling(reason) {
    if (polling) return;
    polling = true;
    for (const watcher of watchers.splice(0)) watcher.close();
    const intervalMs = Math.max(500, Number(options.localPollMs || 1_000));
    let signature = localMarkdownSignature(roots);
    setInterval(() => {
      const nextSignature = localMarkdownSignature(roots);
      if (nextSignature === signature) return;
      signature = nextSignature;
      scheduleRefresh("Local Markdown poll");
    }, intervalMs);
    process.stdout.write(
      `Live refresh: using ${intervalMs}ms Local Markdown polling (${reason}).\n`,
    );
  }

  for (const root of roots) {
    try {
      const watcher = fs.watch(
        root,
        { recursive: true },
        (_eventType, filename) => {
          if (!shouldRefreshMarkdown(filename)) return;
          scheduleRefresh("Local Markdown change");
        },
      );
      watcher.on("error", (error) => startPolling(error.message));
      watchers.push(watcher);
    } catch (error) {
      startPolling(error.message);
      break;
    }
  }

  if (watchers.length === 0 && !polling) {
    startPolling("recursive file watching unavailable");
  } else if (!polling) {
    process.stdout.write(`Live refresh: watching ${watchers.length} Markdown root(s).\n`);
  }
}

function shouldRefreshMarkdown(filename) {
  if (!filename) return true;
  const normalized = String(filename).replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => [".git", "node_modules", "reports"].includes(segment))) {
    return false;
  }
  return normalized.endsWith(".md");
}

function localMarkdownSignature(roots) {
  return roots
    .flatMap((root) => walkMarkdown(root))
    .sort()
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath);
        return `${filePath}:${stat.size}:${stat.mtimeMs}`;
      } catch {
        return `${filePath}:missing`;
      }
    })
    .join("|");
}

function boardFingerprint(items, catalog = null) {
  return JSON.stringify({
    items: [...items].sort((a, b) => a.key.localeCompare(b.key)),
    catalog,
  });
}

function sendFile(response, filePath, contentType) {
  if (!fs.existsSync(filePath)) return send(response, 404, "Not found");
  response.writeHead(200, { "content-type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}

function allowedSource(target) {
  if (!fs.existsSync(target)) return false;
  if (config.productCatalog?.enabled) {
    const catalogPath = assertRealPathWithinRepo(
      resolveRepoPath(config.productCatalog.path, "product catalog"),
      "product catalog",
    );
    if (fs.realpathSync(target) === catalogPath) return true;
  }
  const roots = (config.localMarkdown?.roots || [".scratch"]).map((root) =>
    assertRealPathWithinRepo(
      resolveRepoPath(root, "Local Markdown root"),
      "Local Markdown root",
    ),
  );
  const realTarget = fs.realpathSync(target);
  return roots.some((root) => {
    const relative = path.relative(root, realTarget);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

function run(binary, binaryArgs, options = {}) {
  try {
    return execFileSync(binary, binaryArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    fail(`${binary} ${binaryArgs.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

function tryRun(binary, binaryArgs, options = {}) {
  try {
    return execFileSync(binary, binaryArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
  } catch {
    return null;
  }
}

function boardCopy(locale) {
  if (locale === "zh-CN") {
    return {
      readOnly: "只读视图",
      canonical: "权威状态：Issue Tracker",
      generated: "生成于",
      lastSync: "最近同步：",
      projectControl: "项目控制台",
      statusOverview: "状态概览",
      efforts: "工作流",
      allEfforts: "全部工作流",
      searchPlaceholder: "搜索标题、编号、标签或负责人",
      allStatuses: "全部状态",
      boardViews: "看板视图",
      catalog: "产品目录",
      tree: "树状图",
      flow: "流程图",
      productCatalog: "产品功能目录",
      structure: "项目结构",
      dependencies: "依赖流程",
      treeSubtitle: "按工作流和父子关系组织全部事项",
      flowSubtitle: "从阻塞项到被阻塞事项的执行路径",
      frontier: "当前前沿",
      currentFrontier: "当前主线前沿",
      ticket: "事项",
      totalItems: "全部事项",
      blockedItems: "阻塞事项",
      completedItems: "已完成",
      confirmedCapabilities: "已确认能力",
      evolvingCapabilities: "确认中能力",
      unconfirmedCapabilities: "未确认能力",
      stage: "阶段",
      phase: "产品阶段",
      capability: "产品能力",
      productDecision: "产品决定",
      prototypeValidation: "原型验证",
      technicalValidation: "技术验证",
      canonicalSources: "权威来源",
      derivedFromChildren: "由子能力汇总",
      openCatalog: "打开产品目录",
      exploration: "正在探索，尚未进入稳定产品目录",
      productDecisions: "产品决定与验证",
      specification: "Specification",
      implementation: "实施事项",
      arrowMeaning: "箭头：阻塞项 → 被阻塞事项",
      visibleCount: "{count} 个可见事项",
      noItems: "没有匹配事项",
      details: "事项详情",
      noSelection: "选择一个事项后，可在这里查看它的状态、归属和依赖关系。",
      properties: "属性",
      relationships: "关系",
      labelsAndPeople: "标签与负责人",
      name: "名称",
      type: "类型",
      state: "状态",
      effort: "工作流",
      updated: "更新",
      source: "来源",
      parent: "父事项",
      blockedBy: "阻塞于",
      none: "无",
      notAvailable: "未记录",
      openOriginal: "打开原事项",
      lanes: {
        Open: "待处理",
        Triage: "待审查",
        Ready: "可开始",
        Active: "进行中",
        Waiting: "等待中",
        Blocked: "被阻塞",
        Artifact: "已生成",
        Done: "已完成",
      },
      types: {
        issue: "Issue",
        ticket: "票据",
        task: "任务",
        grilling: "产品确认",
        research: "研究",
        prototype: "原型",
        "technical-spike": "技术验证",
        spec: "规格",
        implementation: "实施事项",
      },
      catalogStatuses: {
        CONFIRMED: "已确认",
        PARTIAL: "部分确认",
        IN_PROGRESS: "确认中",
        UNCONFIRMED: "未确认",
        NOT_MAPPED: "尚未映射",
        VALIDATED: "已验证",
        PARTIALLY_VALIDATED: "部分验证",
        NOT_VALIDATED: "未验证",
        NOT_RECORDED: "未记录",
        NOT_NEEDED: "不需要",
        NOT_STARTED: "未开始",
        COMPLETED: "已完成",
      },
    };
  }
  return {
    readOnly: "Read-only projection",
    canonical: "canonical state: issue tracker",
    generated: "generated",
    lastSync: "Last sync:",
    projectControl: "Project control",
    statusOverview: "Status overview",
    efforts: "Efforts",
    allEfforts: "All efforts",
    searchPlaceholder: "Search title, ID, label, or assignee",
    allStatuses: "All statuses",
    boardViews: "Board views",
    catalog: "Product catalog",
    tree: "Tree",
    flow: "Flow",
    productCatalog: "Product capability catalog",
    structure: "Project structure",
    dependencies: "Dependency flow",
    treeSubtitle: "All items organized by effort and parent-child relationship",
    flowSubtitle: "Execution path from blocker to blocked item",
    frontier: "Frontier",
    currentFrontier: "Active frontier",
    ticket: "Ticket",
    totalItems: "All items",
    blockedItems: "Blocked",
    completedItems: "Completed",
    confirmedCapabilities: "Confirmed capabilities",
    evolvingCapabilities: "Capabilities in progress",
    unconfirmedCapabilities: "Unconfirmed capabilities",
    stage: "Stage",
    phase: "Product phase",
    capability: "Product capability",
    productDecision: "Product decision",
    prototypeValidation: "Prototype validation",
    technicalValidation: "Technical validation",
    canonicalSources: "Canonical sources",
    derivedFromChildren: "Aggregated from child capabilities",
    openCatalog: "Open product catalog",
    exploration: "Exploration not yet in the stable product catalog",
    productDecisions: "Product decisions & validation",
    specification: "Specification",
    implementation: "Implementation",
    arrowMeaning: "Arrow: blocker → blocked ticket",
    visibleCount: "{count} visible item(s)",
    noItems: "No matching items",
    details: "Item details",
    noSelection: "Select an item to inspect its state, scope, and dependencies.",
    properties: "Properties",
    relationships: "Relationships",
    labelsAndPeople: "Labels & assignees",
    name: "Name",
    type: "Type",
    state: "State",
    effort: "Effort",
    updated: "Updated",
    source: "Source",
    parent: "Parent",
    blockedBy: "Blocked by",
    none: "None",
    notAvailable: "Not recorded",
    openOriginal: "Open original item",
    lanes: {
      Open: "Open",
      Triage: "Triage",
      Ready: "Ready",
      Active: "Active",
      Waiting: "Waiting",
      Blocked: "Blocked",
      Artifact: "Published",
      Done: "Done",
    },
    types: {
      issue: "Issue",
      ticket: "Ticket",
      task: "Task",
      grilling: "Product decision",
      research: "Research",
      prototype: "Prototype",
      "technical-spike": "Technical spike",
      spec: "Specification",
      implementation: "Implementation",
    },
    catalogStatuses: {
      CONFIRMED: "Confirmed",
      PARTIAL: "Partially confirmed",
      IN_PROGRESS: "In progress",
      UNCONFIRMED: "Unconfirmed",
      NOT_MAPPED: "Not mapped",
      VALIDATED: "Validated",
      PARTIALLY_VALIDATED: "Partially validated",
      NOT_VALIDATED: "Not validated",
      NOT_RECORDED: "Not recorded",
      NOT_NEEDED: "Not needed",
      NOT_STARTED: "Not started",
      COMPLETED: "Completed",
    },
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
