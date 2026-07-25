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
  if (config.canonicalTracker === "github") {
    return loadGitHubIssues();
  }
  if (config.canonicalTracker === "local-markdown") {
    return loadLocalMarkdownTickets();
  }
  fail(`Unsupported canonicalTracker: ${config.canonicalTracker}`);
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
      "number,title,state,url,labels,assignees,updatedAt",
    ],
    { capture: true },
  );

  return JSON.parse(raw).map((issue) => {
    const labels = issue.labels.map((label) => label.name);
    return {
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
    };
  });
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

  return tickets.map(({ absolutePath, blockerNumbers, fileNumber, ...ticket }) => ticket);
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
  const blockerNumbers = [...blockers.matchAll(/\b(\d{1,4})\b/g)].map(
    (match) => String(Number(match[1])),
  );
  const fileNumber = path.basename(absolutePath).match(/^(\d{1,4})[-_]/)?.[1];

  return {
    absolutePath,
    blockerNumbers,
    fileNumber: fileNumber ? String(Number(fileNumber)) : null,
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
  };
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
    :root { --paper:#f4f0e6; --ink:#12263a; --muted:#66717d; --line:#d7d0c2; --accent:#d55d3d; --card:#fffdf8; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:radial-gradient(circle at 15% 0%, #fff8e8 0, transparent 35%), var(--paper); font-family:"Avenir Next","DIN Alternate",sans-serif; }
    header { position:sticky; top:0; z-index:2; padding:24px 28px 18px; border-bottom:1px solid var(--line); background:rgba(244,240,230,.94); backdrop-filter:blur(12px); }
    h1 { margin:0 0 4px; font-size:clamp(24px,3vw,40px); letter-spacing:-.04em; }
    .meta { color:var(--muted); font-size:13px; }
    .controls { display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; }
    input, select { border:1px solid var(--line); border-radius:999px; background:var(--card); color:var(--ink); padding:10px 14px; font:inherit; }
    input { min-width:min(420px, 80vw); }
    main { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(260px,1fr); gap:16px; overflow-x:auto; padding:22px 28px 40px; align-items:start; }
    section { min-height:240px; }
    h2 { display:flex; justify-content:space-between; align-items:center; margin:0 0 12px; font-size:14px; text-transform:uppercase; letter-spacing:.1em; }
    .count { color:var(--muted); font-variant-numeric:tabular-nums; }
    .cards { display:grid; gap:10px; }
    article { border:1px solid var(--line); border-left:4px solid var(--accent); border-radius:12px; background:var(--card); padding:14px; box-shadow:0 6px 20px rgba(18,38,58,.05); }
    article a { color:inherit; text-decoration:none; font-weight:650; line-height:1.35; }
    article a:hover { color:var(--accent); }
    .eyebrow { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .tags { display:flex; gap:5px; flex-wrap:wrap; margin-top:10px; }
    .tag { border-radius:999px; background:#e8e2d6; padding:3px 7px; color:#495561; font-size:10px; }
    .empty { color:var(--muted); font-size:13px; padding:12px 0; }
    @media (max-width:700px) { header { padding:18px; } main { padding:18px; grid-auto-columns:minmax(82vw,1fr); } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Read-only projection · canonical state: issue tracker · generated ${escapeHtml(generatedAt)}</div>
    <div class="controls">
      <input id="search" type="search" placeholder="Search title, ID, label, or assignee">
      <select id="source"><option value="">All sources</option></select>
    </div>
  </header>
  <main id="board"></main>
  <script>
    const items = ${safeData};
    const laneOrder = ["Open","Triage","Ready","Active","Waiting","Blocked","Done"];
    const board = document.querySelector("#board");
    const search = document.querySelector("#search");
    const source = document.querySelector("#source");
    const sources = [...new Set(items.map(item => item.source))].sort();
    for (const value of sources) source.add(new Option(value, value));
    function render() {
      const needle = search.value.trim().toLowerCase();
      const selectedSource = source.value;
      const visible = items.filter(item => {
        const haystack = [item.id,item.title,item.type,item.state,...item.labels,...item.assignees].join(" ").toLowerCase();
        return (!needle || haystack.includes(needle)) && (!selectedSource || item.source === selectedSource);
      });
      board.replaceChildren(...laneOrder.map(lane => {
        const laneItems = visible.filter(item => item.lane === lane);
        const section = document.createElement("section");
        const heading = document.createElement("h2");
        heading.append(lane, Object.assign(document.createElement("span"), { className:"count", textContent:String(laneItems.length) }));
        const cards = Object.assign(document.createElement("div"), { className:"cards" });
        if (laneItems.length === 0) cards.append(Object.assign(document.createElement("div"), { className:"empty", textContent:"No items" }));
        for (const item of laneItems) {
          const article = document.createElement("article");
          const eyebrow = Object.assign(document.createElement("div"), { className:"eyebrow" });
          eyebrow.append(Object.assign(document.createElement("span"), { textContent:item.id }), Object.assign(document.createElement("span"), { textContent:item.type }));
          const link = Object.assign(document.createElement("a"), { href:item.url, textContent:item.title });
          if (item.url.startsWith("http")) link.target = "_blank";
          const tags = Object.assign(document.createElement("div"), { className:"tags" });
          for (const tag of [...item.labels, ...item.assignees.map(value => "@" + value)]) tags.append(Object.assign(document.createElement("span"), { className:"tag", textContent:tag }));
          article.append(eyebrow, link, tags);
          cards.append(article);
        }
        section.append(heading, cards);
        return section;
      }));
    }
    search.addEventListener("input", render);
    source.addEventListener("change", render);
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
