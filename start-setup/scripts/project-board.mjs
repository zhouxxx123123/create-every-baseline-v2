#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const command = args.find((arg) => ["sync", "render", "serve"].includes(arg)) || "sync";
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

if (command === "sync") {
  const items = loadItems();
  syncGitHubProject(items);
  renderLocalHtml(items);
} else if (command === "render") {
  renderLocalHtml(loadItems());
} else if (command === "serve") {
  const items = loadItems();
  renderLocalHtml(items);
  serveLocalHtml();
} else {
  fail("Usage: project-board.mjs [sync|render|serve] [--config <path>]");
}

function loadItems() {
  let items;
  if (config.canonicalTracker === "github") {
    items = loadGitHubIssues();
  } else if (config.canonicalTracker === "local-markdown") {
    items = loadLocalMarkdownTickets();
  } else {
    fail(`Unsupported canonicalTracker: ${config.canonicalTracker}`);
  }
  return finalizeItems(items);
}

function loadGitHubIssues() {
  const repository = config.github?.repository;
  if (!repository) {
    fail("github.repository is required for the GitHub tracker");
  }

  const raw = run(
    "gh",
    [
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
    ],
    { capture: true },
  );

  const issues = JSON.parse(raw);
  const items = issues.map((issue) => {
    const labels = issue.labels.map((label) => label.name);
    const blockedBy = parseGitHubReferences(issue.body, "Blocked by").map(
      (number) => `github:#${number}`,
    );
    const parentNumber = String(issue.body || "").match(
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
    .map(readLocalTicket)
    .filter(Boolean);
  const byDirectoryAndNumber = new Map();

  for (const ticket of tickets) {
    const number = ticket.fileNumber;
    if (number) {
      byDirectoryAndNumber.set(`${path.dirname(ticket.absolutePath)}:${number}`, ticket);
    }
  }

  for (const ticket of tickets) {
    if (ticket.lane === "Done" || ticket.blockerNumbers.length === 0) continue;
    const unresolved = ticket.blockerNumbers.some((number) => {
      const blocker = byDirectoryAndNumber.get(
        `${path.dirname(ticket.absolutePath)}:${number}`,
      );
      return !blocker || blocker.lane !== "Done";
    });
    if (unresolved) ticket.lane = "Blocked";
  }

  return tickets.map((ticket) => {
    const blockedBy = ticket.blockerNumbers
      .map((number) =>
        byDirectoryAndNumber.get(`${path.dirname(ticket.absolutePath)}:${number}`),
      )
      .filter(Boolean)
      .map((blocker) => blocker.key);
    const parent = ticket.parentNumber
      ? byDirectoryAndNumber.get(
          `${path.dirname(ticket.absolutePath)}:${ticket.parentNumber}`,
        )
      : null;
    const {
      absolutePath,
      blockerNumbers,
      fileNumber,
      parentNumber,
      ...cleanTicket
    } = ticket;
    return {
      ...cleanTicket,
      parentId: parent?.key || null,
      blockedBy,
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

function readLocalTicket(absolutePath) {
  const body = fs.readFileSync(absolutePath, "utf8");
  const status = metadata(body, "Status");
  if (!status) return null;

  const relativePath = path.relative(repoRoot, absolutePath);
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(absolutePath, ".md");
  const type = metadata(body, "Type") || "ticket";
  const blockers = metadata(body, "Blocked by") || "";
  const parent = metadata(body, "Parent") || metadata(body, "Part of") || "";
  const blockerNumbers = [...blockers.matchAll(/\b(\d{1,4})\b/g)].map(
    (match) => String(Number(match[1])),
  );
  const fileNumber = path.basename(absolutePath).match(/^(\d{1,4})[-_]/)?.[1];
  const parentNumber = parent.match(/\b(\d{1,4})\b/)?.[1];
  const pathSegments = relativePath.split(path.sep);
  const scratchIndex = pathSegments.indexOf(".scratch");
  const group =
    scratchIndex >= 0 && pathSegments[scratchIndex + 1]
      ? pathSegments[scratchIndex + 1]
      : path.dirname(relativePath);

  return {
    absolutePath,
    blockerNumbers,
    fileNumber: fileNumber ? String(Number(fileNumber)) : null,
    parentNumber: parentNumber ? String(Number(parentNumber)) : null,
    key: `local:${relativePath}`,
    id: fileNumber ? fileNumber.padStart(2, "0") : relativePath,
    title,
    type,
    state: status.toLowerCase(),
    lane: localLane(status),
    labels: [],
    assignees: [],
    updatedAt: fs.statSync(absolutePath).mtime.toISOString(),
    url: `/source?path=${encodeURIComponent(relativePath)}`,
    projectUrl: null,
    source: "Local Markdown",
    group,
    parentId: null,
  };
}

function finalizeItems(items) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  return items.map((item) => {
    const blockedBy = [...new Set(item.blockedBy || [])];
    const unresolvedBlockers = blockedBy.filter((key) => {
      const blocker = byKey.get(key);
      return !blocker || blocker.lane !== "Done";
    });
    const isOpen = item.lane !== "Done";
    const isFrontier =
      isOpen &&
      unresolvedBlockers.length === 0 &&
      item.lane !== "Active" &&
      item.lane !== "Waiting";
    return {
      ...item,
      blockedBy,
      isFrontier,
    };
  });
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

function renderLocalHtml(items) {
  const local = config.surfaces?.localHtml;
  if (!local?.enabled) return;

  const outputPath = path.resolve(repoRoot, local.output || ".project-board/index.html");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, htmlDocument(items), "utf8");
  process.stdout.write(
    `Local HTML rendered (${items.length} item(s)): ${path.relative(repoRoot, outputPath)}\n`,
  );
}

function htmlDocument(items) {
  const safeData = JSON.stringify(items)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  const title = String(config.title || "Project Board");
  const generatedAt = new Date().toISOString();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { --paper:#f4f0e6; --ink:#12263a; --muted:#66717d; --line:#d7d0c2; --accent:#d55d3d; --card:#fffdf8; --frontier:#087e6a; --edge:#93a0aa; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:radial-gradient(circle at 15% 0%, #fff8e8 0, transparent 35%), var(--paper); font-family:"Avenir Next","DIN Alternate",sans-serif; }
    header { position:sticky; top:0; z-index:2; padding:24px 28px 18px; border-bottom:1px solid var(--line); background:rgba(244,240,230,.94); backdrop-filter:blur(12px); }
    h1 { margin:0 0 4px; font-size:clamp(24px,3vw,40px); letter-spacing:-.04em; }
    .meta { color:var(--muted); font-size:13px; }
    .toolbar { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:16px; flex-wrap:wrap; }
    .controls, .tabs { display:flex; gap:8px; flex-wrap:wrap; }
    input, select, button { border:1px solid var(--line); border-radius:999px; background:var(--card); color:var(--ink); padding:10px 14px; font:inherit; }
    input { min-width:min(420px, 80vw); }
    button { cursor:pointer; font-weight:650; }
    button[aria-selected="true"] { color:#fff; border-color:var(--ink); background:var(--ink); }
    main { padding:22px 28px 40px; }
    .view[hidden] { display:none; }
    .tree-root { max-width:980px; margin:0 auto; }
    .root-card { display:flex; justify-content:space-between; align-items:center; gap:16px; border:1px solid var(--ink); border-radius:16px; background:var(--ink); color:#fff; padding:18px 20px; box-shadow:0 12px 30px rgba(18,38,58,.12); }
    .root-card strong { font-size:18px; }
    .groups { display:grid; gap:14px; margin-top:16px; }
    details.group { border:1px solid var(--line); border-radius:16px; background:rgba(255,253,248,.72); overflow:hidden; }
    details.group > summary { display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:pointer; padding:14px 16px; font-weight:700; list-style:none; }
    details.group > summary::-webkit-details-marker { display:none; }
    details.group > summary::before { content:"▾"; color:var(--accent); margin-right:8px; }
    details.group:not([open]) > summary::before { content:"▸"; }
    .group-title { display:flex; align-items:center; }
    .tree-list { display:grid; gap:10px; border-top:1px solid var(--line); padding:14px; }
    .tree-branch { position:relative; display:grid; gap:10px; }
    .tree-children { display:grid; gap:10px; margin-left:24px; padding-left:18px; border-left:1px solid var(--line); }
    .tree-children > .tree-branch::before { content:""; position:absolute; top:22px; left:-18px; width:14px; border-top:1px solid var(--line); }
    .ticket-card { border:1px solid var(--line); border-left:4px solid var(--accent); border-radius:12px; background:var(--card); padding:12px 14px; box-shadow:0 6px 20px rgba(18,38,58,.04); }
    .ticket-card.frontier { border-color:var(--frontier); box-shadow:0 0 0 2px rgba(8,126,106,.12); }
    .ticket-card a { color:inherit; text-decoration:none; font-weight:650; line-height:1.35; }
    .ticket-card a:hover { color:var(--accent); }
    .eyebrow { display:flex; justify-content:space-between; gap:8px; margin-bottom:7px; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .status { display:inline-flex; align-items:center; gap:5px; }
    .status::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--accent); }
    .frontier .status::before { background:var(--frontier); }
    .tags { display:flex; gap:5px; flex-wrap:wrap; margin-top:9px; }
    .tag { border-radius:999px; background:#e8e2d6; padding:3px 7px; color:#495561; font-size:10px; }
    .count { color:var(--muted); font-variant-numeric:tabular-nums; }
    .flow-shell { overflow:auto; min-height:560px; border:1px solid var(--line); border-radius:16px; background:linear-gradient(rgba(215,208,194,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(215,208,194,.28) 1px, transparent 1px), var(--card); background-size:24px 24px; }
    .flow-shell svg { display:block; min-width:100%; }
    .flow-edge { fill:none; stroke:var(--edge); stroke-width:1.7; marker-end:url(#arrow); }
    .flow-node rect { fill:var(--card); stroke:var(--line); stroke-width:1.5; rx:12; }
    .flow-node.frontier rect { stroke:var(--frontier); stroke-width:3; }
    .flow-node text { fill:var(--ink); pointer-events:none; }
    .flow-node .node-id { fill:var(--muted); font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
    .flow-node .node-title { font-size:13px; font-weight:700; }
    .flow-node .node-status { fill:var(--muted); font-size:11px; }
    .legend { display:flex; gap:14px; margin:0 0 12px; color:var(--muted); font-size:12px; flex-wrap:wrap; }
    .legend span { display:inline-flex; align-items:center; gap:6px; }
    .legend i { width:9px; height:9px; border-radius:50%; background:var(--accent); }
    .legend .frontier-key i { background:var(--frontier); }
    .empty { color:var(--muted); font-size:13px; padding:12px 0; }
    @media (max-width:700px) { header, main { padding:18px; } input { min-width:100%; } .controls { width:100%; } .tree-children { margin-left:10px; padding-left:12px; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Read-only projection · canonical state: issue tracker · generated ${escapeHtml(generatedAt)}</div>
    <div class="toolbar">
      <div class="controls">
        <input id="search" type="search" placeholder="Search title, ID, label, or assignee">
        <select id="status"><option value="">All statuses</option></select>
      </div>
      <div class="tabs" role="tablist" aria-label="Board views">
        <button id="treeTab" role="tab" aria-controls="treeView" aria-selected="true">Tree</button>
        <button id="flowTab" role="tab" aria-controls="flowView" aria-selected="false">Flow</button>
      </div>
    </div>
  </header>
  <main>
    <div id="treeView" class="view" role="tabpanel" aria-labelledby="treeTab"></div>
    <div id="flowView" class="view" role="tabpanel" aria-labelledby="flowTab" hidden></div>
  </main>
  <script>
    const items = ${safeData};
    const byKey = new Map(items.map(item => [item.key, item]));
    const laneOrder = ["Open","Triage","Ready","Active","Waiting","Blocked","Done"];
    const search = document.querySelector("#search");
    const status = document.querySelector("#status");
    const treeView = document.querySelector("#treeView");
    const flowView = document.querySelector("#flowView");
    for (const value of laneOrder.filter(lane => items.some(item => item.lane === lane))) status.add(new Option(value, value));

    function visibleItems() {
      const needle = search.value.trim().toLowerCase();
      return items.filter(item => {
        const haystack = [item.id,item.title,item.type,item.state,item.group,...item.labels,...item.assignees].join(" ").toLowerCase();
        return (!needle || haystack.includes(needle)) && (!status.value || item.lane === status.value);
      });
    }

    function ticketCard(item) {
      const card = Object.assign(document.createElement("div"), { className:"ticket-card" + (item.isFrontier ? " frontier" : "") });
      const eyebrow = Object.assign(document.createElement("div"), { className:"eyebrow" });
      eyebrow.append(
        Object.assign(document.createElement("span"), { textContent:item.id + " · " + item.type }),
        Object.assign(document.createElement("span"), { className:"status", textContent:item.isFrontier ? "Frontier" : item.lane })
      );
      const link = Object.assign(document.createElement("a"), { href:item.url, textContent:item.title });
      if (item.url.startsWith("http")) link.target = "_blank";
      const tags = Object.assign(document.createElement("div"), { className:"tags" });
      for (const tag of [...item.labels, ...item.assignees.map(value => "@" + value)]) {
        tags.append(Object.assign(document.createElement("span"), { className:"tag", textContent:tag }));
      }
      card.append(eyebrow, link, tags);
      return card;
    }

    function renderTree(visible) {
      const visibleKeys = new Set(visible.map(item => item.key));
      const groups = [...new Set(visible.map(item => item.group || item.source))].sort();
      const root = Object.assign(document.createElement("div"), { className:"tree-root" });
      const rootCard = Object.assign(document.createElement("div"), { className:"root-card" });
      rootCard.append(
        Object.assign(document.createElement("strong"), { textContent:${JSON.stringify(title)} }),
        Object.assign(document.createElement("span"), { textContent:visible.length + " visible item(s)" })
      );
      const groupList = Object.assign(document.createElement("div"), { className:"groups" });
      for (const groupName of groups) {
        const groupItems = visible.filter(item => (item.group || item.source) === groupName);
        const details = Object.assign(document.createElement("details"), { className:"group", open:true });
        const summary = document.createElement("summary");
        summary.append(
          Object.assign(document.createElement("span"), { className:"group-title", textContent:groupName }),
          Object.assign(document.createElement("span"), { className:"count", textContent:String(groupItems.length) })
        );
        const list = Object.assign(document.createElement("div"), { className:"tree-list" });
        const children = new Map();
        for (const item of groupItems) {
          if (item.parentId && visibleKeys.has(item.parentId)) {
            if (!children.has(item.parentId)) children.set(item.parentId, []);
            children.get(item.parentId).push(item);
          }
        }
        const roots = groupItems.filter(item => !item.parentId || !visibleKeys.has(item.parentId));
        const rendered = new Set();
        function branch(item, ancestry = new Set()) {
          const wrapper = Object.assign(document.createElement("div"), { className:"tree-branch" });
          wrapper.append(ticketCard(item));
          rendered.add(item.key);
          if (ancestry.has(item.key)) return wrapper;
          const nextAncestry = new Set(ancestry);
          nextAncestry.add(item.key);
          const childItems = (children.get(item.key) || []).sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
          if (childItems.length > 0) {
            const childList = Object.assign(document.createElement("div"), { className:"tree-children" });
            for (const child of childItems) childList.append(branch(child, nextAncestry));
            wrapper.append(childList);
          }
          return wrapper;
        }
        for (const item of roots.sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric:true }))) list.append(branch(item));
        for (const item of groupItems.filter(item => !rendered.has(item.key))) list.append(branch(item));
        details.append(summary, list);
        groupList.append(details);
      }
      if (groups.length === 0) groupList.append(Object.assign(document.createElement("div"), { className:"empty", textContent:"No matching items" }));
      root.append(rootCard, groupList);
      treeView.replaceChildren(root);
    }

    function renderFlow(visible) {
      const visibleByKey = new Map(visible.map(item => [item.key, item]));
      const depthMemo = new Map();
      function depth(item, visiting = new Set()) {
        if (depthMemo.has(item.key)) return depthMemo.get(item.key);
        if (visiting.has(item.key)) return 0;
        const next = new Set(visiting);
        next.add(item.key);
        const dependencies = item.blockedBy.map(key => visibleByKey.get(key)).filter(Boolean);
        const value = dependencies.length ? Math.max(...dependencies.map(dependency => depth(dependency, next))) + 1 : 0;
        depthMemo.set(item.key, value);
        return value;
      }
      const columns = new Map();
      for (const item of visible) {
        const value = depth(item);
        if (!columns.has(value)) columns.set(value, []);
        columns.get(value).push(item);
      }
      for (const column of columns.values()) column.sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
      const maxDepth = Math.max(0, ...columns.keys());
      const maxRows = Math.max(1, ...[...columns.values()].map(column => column.length));
      const nodeWidth = 224;
      const nodeHeight = 76;
      const gapX = 92;
      const gapY = 34;
      const margin = 40;
      const width = margin * 2 + (maxDepth + 1) * nodeWidth + maxDepth * gapX;
      const height = margin * 2 + maxRows * nodeHeight + Math.max(0, maxRows - 1) * gapY;
      const positions = new Map();
      for (const [columnDepth, column] of columns) {
        column.forEach((item, index) => positions.set(item.key, {
          x:margin + columnDepth * (nodeWidth + gapX),
          y:margin + index * (nodeHeight + gapY)
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
        group.setAttribute("class", "flow-node" + (item.isFrontier ? " frontier" : ""));
        group.setAttribute("transform", "translate(" + position.x + " " + position.y + ")");
        group.setAttribute("role", "link");
        group.setAttribute("tabindex", "0");
        group.style.cursor = "pointer";
        const rect = document.createElementNS(svg.namespaceURI, "rect");
        rect.setAttribute("width", String(nodeWidth));
        rect.setAttribute("height", String(nodeHeight));
        const idText = document.createElementNS(svg.namespaceURI, "text");
        idText.setAttribute("class", "node-id");
        idText.setAttribute("x", "14");
        idText.setAttribute("y", "19");
        idText.textContent = item.id + " · " + item.type;
        const titleText = document.createElementNS(svg.namespaceURI, "text");
        titleText.setAttribute("class", "node-title");
        titleText.setAttribute("x", "14");
        titleText.setAttribute("y", "42");
        titleText.textContent = item.title.length > 29 ? item.title.slice(0, 28) + "…" : item.title;
        const statusText = document.createElementNS(svg.namespaceURI, "text");
        statusText.setAttribute("class", "node-status");
        statusText.setAttribute("x", "14");
        statusText.setAttribute("y", "62");
        statusText.textContent = item.isFrontier ? "Frontier" : item.lane;
        const open = () => window.open(item.url, item.url.startsWith("http") ? "_blank" : "_self");
        group.addEventListener("click", open);
        group.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") open();
        });
        group.append(rect, idText, titleText, statusText);
        svg.append(group);
      }
      if (visible.length === 0) {
        shell.append(Object.assign(document.createElement("div"), { className:"empty", textContent:"No matching items" }));
      } else {
        shell.append(svg);
      }
      const legend = Object.assign(document.createElement("div"), { className:"legend" });
      const standard = document.createElement("span");
      standard.append(document.createElement("i"), "Ticket");
      const frontier = Object.assign(document.createElement("span"), { className:"frontier-key" });
      frontier.append(document.createElement("i"), "Current frontier");
      const relation = document.createElement("span");
      relation.append("Arrow: blocker → blocked ticket");
      legend.append(standard, frontier, relation);
      flowView.replaceChildren(legend, shell);
    }

    function render() {
      const visible = visibleItems();
      renderTree(visible);
      renderFlow(visible);
    }

    function selectView(name) {
      const treeSelected = name === "tree";
      document.querySelector("#treeTab").setAttribute("aria-selected", String(treeSelected));
      document.querySelector("#flowTab").setAttribute("aria-selected", String(!treeSelected));
      treeView.hidden = !treeSelected;
      flowView.hidden = treeSelected;
    }
    search.addEventListener("input", render);
    status.addEventListener("change", render);
    document.querySelector("#treeTab").addEventListener("click", () => selectView("tree"));
    document.querySelector("#flowTab").addEventListener("click", () => selectView("flow"));
    render();
  </script>
</body>
</html>`;
}

function serveLocalHtml() {
  const local = config.surfaces?.localHtml;
  if (!local?.enabled) fail("Local HTML surface is not enabled");
  const outputPath = path.resolve(repoRoot, local.output || ".project-board/index.html");
  const port = Number(local.port || 4173);

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      return sendFile(response, outputPath, "text/html; charset=utf-8");
    }
    if (requestUrl.pathname === "/favicon.ico") {
      response.writeHead(204);
      return response.end();
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
  const roots = (config.localMarkdown?.roots || []).map((root) =>
    path.resolve(repoRoot, root),
  );
  return roots.some((root) => {
    const relative = path.relative(root, target);
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
