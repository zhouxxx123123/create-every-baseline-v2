---
name: start-setup
description: Configure a repo for the engineering skills by choosing local-only or GitHub-backed Git, setting up its issue tracker and optional GitHub Project plus local HTML board, then recording triage and domain conventions. Also use update-board mode to add, repair, or upgrade board projections in an existing configured project without rerunning full setup.
---

# Start Setup

Scaffold the per-repo configuration that the engineering skills assume:

- **Git destination** — whether history remains local-only or is backed by GitHub
- **Issue tracker** — where issues live (GitHub by default; local markdown is also supported out of the box)
- **Project board** — optional GitHub Project and local read-only HTML projections of the canonical tracker
- **Triage labels** — the strings used for the five canonical triage roles, plus the repository's ready-label semantics
- **Domain docs** — where `CONTEXT.md`, product baselines, prototype evidence, and ADRs live, and the consumer rules for reading them

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Modes

- **Full setup (`FULL_SETUP`)** — the default for a new or unconfigured repository. Follow the complete process below.
- **Update board (`UPDATE_BOARD`)** — use when the user explicitly says `update-board`, asks to update or repair an existing project's board, or wants to add the current board to a previously configured project. Follow the focused workflow below and do not rerun the other setup sections.

### Update board workflow

Treat this as an in-place projection migration, not a new project setup.

1. Record `git status --short` and inspect the existing setup authority:
   - `AGENTS.md` or `CLAUDE.md`;
   - `docs/agents/git.md`, `docs/agents/issue-tracker.md`, and `docs/agents/project-board.md`;
   - `.project-board/config.json`, `.project-board/project-board.mjs`, and `.gitignore`;
   - existing `.scratch/*/map.md`, canonical tickets, real specifications, and implementation issues only to verify projection compatibility.
2. Determine the canonical tracker from the existing authority files. Do not infer it from the board, reopen settled Git/tracker/triage/domain choices, or modify Map and ticket content. If tracker authority is missing or contradictory, stop and report that blocker instead of guessing.
3. Preserve the existing board mode, GitHub Project identity, title, locale, port, tracker roots, and unknown config fields unless the user explicitly asks to change them. If no board exists, ask only which Section C board surface to add; recommend from the already configured Git destination and tracker.
4. Show the exact board-only migration scope before editing. Limit changes to the `### Project board` setup reference when needed, `docs/agents/project-board.md`, `.project-board/config.json`, `.project-board/project-board.mjs`, and the generated-output ignore rule. Preserve unrelated working-tree changes.
5. Apply the current Section C authority, hierarchy, localization, and live-refresh rules. Existing Map files remain navigation authority. Never create, copy, renumber, or rewrite Map, decision, research, prototype, specification, or implementation artifacts merely to make the board render.
6. Run `node .project-board/project-board.mjs sync`. For local HTML, start `serve`, request the configured localhost URL, verify Tree and Flow, then stop the verification server. For a GitHub surface, verify its canonical issue projection without creating draft copies.
7. When the user has installed the bundled [board launcher](./scripts/board) on `PATH`, verify that running `board` from the project or a nested directory opens this local surface. The launcher is a convenience only; the project-local adapter remains the portable recovery path.
8. Report the preserved authority, changed board files, rendered node counts, detected Active frontier, verification result, and exact recovery command. Do not stage, commit, push, or describe a projection as current unless those actions actually succeeded.

`UPDATE_BOARD` is a setup workflow mode. It is not a replacement for the generated adapter's `sync`, `render`, or `serve` runtime commands.

## Full Setup Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config` — is this a GitHub repo? Which one?
- `git status --short`, the current branch, tracked-file count, ignored files, unexpectedly large files, and obvious secret-bearing paths — can setup safely establish or connect history without sweeping unrelated material into a baseline?
- `AGENTS.md` and `CLAUDE.md` at the repo root — does either exist? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/product/`, prototype manifests, and prototype indexes when the repo already uses them
- any existing prototype identity and version-number convention, including the scope in which IDs are unique and how full references are written
- `docs/agents/` — does this skill's prior output already exist?
- `.project-board/config.json` and `docs/agents/project-board.md` — is a board already configured, and which source owns its state?
- `.scratch/` — sign that a local-markdown issue tracker convention is already in use
- Is the `triage` skill installed? (a `triage` skill folder alongside this one, or `triage` in your available skills.) This decides whether Section D runs at all.
- Monorepo signals — a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. Present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order — one section, one answer, then the next.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip the section entirely when exploration already settled it (Section D when `triage` isn't installed, Section E when there's no monorepo).

**Section A — Git destination.**

> Explainer: This controls where Git history is stored. It is independent from the issue tracker: a repo may use local-only Git with Local Markdown issues, local-only Git with another tracker, or GitHub-backed Git with either GitHub Issues or Local Markdown issues.

Always ask this section, even when a remote already exists. Recommend the detected current state, but do not silently preserve, add, replace, or remove a remote.

- **Local only (`LOCAL_ONLY`)** — initialize Git locally when needed; do not create a remote, push, or publish the repository.
- **GitHub (`GITHUB`)** — use an existing GitHub remote or create/connect a GitHub repository after confirming the exact owner, repository name, and visibility. Recommend `private` for a new repository unless the user explicitly requests public visibility.

Record the choice in `docs/agents/git.md`. For `LOCAL_ONLY`, record `Remote: None` and never call a hosting API. For `GITHUB`, verify `gh auth status`, record the canonical remote URL and default branch, and stop for authentication rather than substituting another account.

Before an initial commit or first push:

1. inspect status, ignored files, large files, and obvious secret-bearing paths;
2. show the exact proposed file scope;
3. exclude generated, secret, unrelated, or user-owned work that was not approved;
4. ask for explicit confirmation of the initial commit and, separately, the first push.

Choosing `GITHUB` authorizes setup of the destination after the repository identity is confirmed; it does not authorize publishing a dirty worktree, changing visibility, force-pushing, or rewriting history. Choosing `LOCAL_ONLY` does not prevent the user from adding GitHub later by rerunning setup repair.

**Section B — Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `to-tickets`, `triage`, `to-spec`, and `qa` read from and write to it — they need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: these skills were designed for GitHub. If a `git remote` points at GitHub, propose that. If a `git remote` points at GitLab (`gitlab.com` or a self-hosted host), propose GitLab. Otherwise (or if the user prefers), offer:

- **GitHub** — issues live in the repo's GitHub Issues (uses the `gh` CLI)
- **GitLab** — issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- **Local markdown** — issues live as files under `.scratch/<feature>/` in this repo (good for solo projects or repos without a remote)
- **Other** (Jira, Linear, etc.) — ask the user to describe the workflow in one paragraph; the skill will record it as freeform prose

Record the choice in `docs/agents/issue-tracker.md`. The GitHub and GitLab templates carry a "PRs as a request surface" flag, defaulted **off** — leave it off and don't raise it; a user who wants external PRs in the triage queue can flip the flag in the file later.

**Section C — Project board surfaces.**

> Explainer: A project board is a view of the issue tracker, not a second tracker. GitHub Project provides the shared online management view; local HTML provides read-only `Tree` and dependency `Flow` views at `127.0.0.1`. Both must project the same canonical ticket state.

Ask which mode to configure:

- **Dual (`DUAL`)** — GitHub Project plus local HTML. Recommend this when Section A selected `GITHUB` and Section B selected GitHub Issues.
- **Local HTML (`LOCAL_HTML`)** — a generated read-only local board. Recommend this for `LOCAL_ONLY` Git or Local Markdown issues.
- **GitHub Project (`GITHUB_PROJECT`)** — a shared GitHub Project without the local HTML surface.
- **None (`NONE`)** — no board projection.

`DUAL` and `GITHUB_PROJECT` require both GitHub-backed Git and GitHub Issues as the canonical tracker. Do not mirror Local Markdown tickets into GitHub draft items: that would create a second identity and state model. If the requested combination is incompatible, offer to change the Git or tracker choice, use `LOCAL_HTML`, or select `NONE`.

For a GitHub surface, confirm the exact project owner and title. Verify `gh auth status`, the `project` token scope, repository identity, and whether a matching project already exists before creating anything. Reuse only after the user confirms the exact match. Create with `gh project create`, link it to the repository, and record the resulting number and URL.

For local HTML, default to port `4173`; choose another free localhost port without asking only when `4173` is occupied. The server must bind to `127.0.0.1`, expose only the board and explicitly selected local Markdown source files, and never bind to a public interface.

Enable live refresh by default. While `serve` is running, Local Markdown uses recursive file watching with a safe polling fallback, GitHub Issues uses a 30-second polling interval, and the browser reloads through a localhost-only server-sent event only when normalized ticket data changes. Preserve `sync` as the explicit recovery and non-server update path.

The optional machine-level [board launcher](./scripts/board) provides the short command `board [project-path]`. It locates the nearest configured project, reads its local port, reuses an existing board server when possible, or starts `serve` and opens the browser. Do not treat this convenience command as repository authority or require it for another collaborator to use the project.

Set the board interface language from the user's setup language or an existing repository convention: use `zh-CN` for a Chinese setup conversation and `en` for an English setup conversation. Record the chosen locale without adding another question unless the signals conflict. This localizes board controls, states, legends, and known ticket types; canonical titles and labels remain unchanged.

The local HTML surface always provides two tabs:

- **Tree** — repository/project -> effort or map -> independently tracked product decisions or validation detours -> a real published specification -> implementation issues -> independently tracked sub-issues, using canonical parent/sub-issue relationships when available;
- **Flow** — blocker -> blocked ticket dependency edges, with the Map-declared Active frontier highlighted when present and a derived unblocked/unclaimed frontier only when no Map authority exists.

For Local Markdown, keep `map.md` as the navigation authority and use its declared Active frontier when present. A real `spec.md` appears only after it exists; implementation files under `issues/` are then shown beneath that specification. Product questions, headings, checklists, and ordinary document sections remain inside their owning ticket or specification and must not become board nodes. An independent Research, Technical Spike, Prototype, or sub-issue appears only when it has its own canonical tracker item and lifecycle.

Do not invent hierarchy or dependencies from title similarity, numbering proximity, or visual placement. If a tracker does not expose a relationship, leave it unconnected rather than guessing.

For every enabled board:

1. record human-facing authority and recovery instructions in `docs/agents/project-board.md` using [project-board.md](./project-board.md);
2. create `.project-board/config.json` with `schemaVersion`, `title`, `canonicalTracker`, `repoRoot`, tracker identity, and enabled surfaces;
3. copy [scripts/project-board.mjs](./scripts/project-board.mjs) to `.project-board/project-board.mjs`;
4. add `.project-board/index.html` to `.gitignore` because it is generated, while keeping the config and script tracked;
5. run `node .project-board/project-board.mjs sync`;
6. verify the local endpoint with `node .project-board/project-board.mjs serve`, request `http://127.0.0.1:<port>/`, then stop the verification server.

Use this machine-config shape, omitting tracker-specific properties that do not apply:

```json
{
  "schemaVersion": 1,
  "title": "项目看板",
  "locale": "zh-CN",
  "canonicalTracker": "github",
  "repoRoot": "..",
  "github": {
    "repository": "owner/repository",
    "loadNativeRelationships": true,
    "triageLabels": {
      "needsInfo": "needs-info",
      "needsTriage": "needs-triage",
      "readyForAgent": "ready-for-agent",
      "readyForHuman": "ready-for-human"
    }
  },
  "localMarkdown": {
    "roots": [".scratch"]
  },
  "surfaces": {
    "githubProject": {
      "enabled": true,
      "owner": "owner",
      "number": 1,
      "url": "https://github.com/users/owner/projects/1"
    },
    "localHtml": {
      "enabled": true,
      "output": ".project-board/index.html",
      "port": 4173,
      "liveRefresh": {
        "enabled": true,
        "debounceMs": 300,
        "githubPollMs": 30000,
        "localPollMs": 1000
      }
    }
  }
}
```

The bundled adapter supports GitHub Issues and Local Markdown. A GitLab or custom tracker needs a separately confirmed adapter before local HTML can be enabled; do not pretend an unsupported tracker is synchronized.

The issue tracker remains canonical. GitHub Project and local HTML must not own separate decisions, blockers, lifecycle states, or copies of ticket content. After a successful canonical tracker write, skills follow `docs/agents/project-board.md` and run its sync command. A projection failure does not roll back a canonical write, but it must be reported accurately with the recovery command.

**Section D — Triage label vocabulary.** Skip this section entirely if the `triage` skill isn't installed (exploration told you) — an uninstalled skill needs no labels.

If it is installed, ask exactly one question:

> Do you want to keep the default triage labels? (recommended: **yes**)

The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write them as-is. Only if the user says no — usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`) — collect the overrides so `triage` applies existing labels instead of creating duplicates.

Record one repository-level ready semantics value in `docs/agents/triage-labels.md` without adding another setup question:

- `FRONTIER_ONLY` — default. Apply the ready label only when a ticket has no unresolved blockers and can start now.
- `STRUCTURALLY_READY` — apply the ready label after post-publication structural validation even when blockers remain; implementation still verifies blocker completion.

Preserve an existing explicit value when it is one of these two values. If the field is missing, write `FRONTIER_ONLY`. Never infer ready semantics from labels already present on tracker items. If an explicit value is unsupported or contradictory, report a setup-repair blocker instead of silently replacing it.

**Section E — Domain docs.** Default to **single-context** — one `CONTEXT.md` + `docs/adr/` at the repo root. This fits almost every repo; write it without asking.

Offer **multi-context** — a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files — only when exploration found monorepo signals. Then confirm which layout they want.

Prototype numbering is workflow configuration, not a product choice, so do not ask a separate question for it:

- If the repository declares one coherent convention that gives every prototype a stable identity and every version a never-reused ordered number within a clear scope, preserve it and record it in `docs/agents/domain.md`.
- If no convention exists, write the default convention from [domain.md](./domain.md) before the first prototype is created.
- If historical manifests use one clear but undocumented convention, document that convention without renumbering them.
- If historical identifiers use several conventions, preserve their exact legacy references and apply the default only to new prototypes. Do not bulk-renumber reviewed evidence.
- If the same full reference already identifies different artifacts, report a setup-repair blocker; do not guess which artifact owns it.

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to whichever of `CLAUDE.md` / `AGENTS.md` is being edited (see step 4 for selection rules)
- The contents of `docs/agents/git.md`, `docs/agents/issue-tracker.md`, `docs/agents/project-board.md` when enabled, `docs/agents/domain.md`, and `docs/agents/triage-labels.md` (the last only when `triage` is installed)

Let them edit before writing. Keep `docs/agents/triage-labels.md` concise: the five-role mapping, the configured ready semantics value, and one sentence explaining it. Detailed readiness, publication, readback, and frontier rules remain owned by the currently invoked workflow skill.

### 4. Write

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create — don't pick for them.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa) — always edit the one that's already there.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Workflow authority

Workflow rules belong to the skill that defines the workflow. Re-read the relevant invoked skill and apply it as the workflow authority instead of copying, rewriting, or renegotiating its rules as project decisions.

### Git repository

[one-line summary of local-only or GitHub-backed history]. See `docs/agents/git.md`.

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Project board

[one-line summary of the configured GitHub Project and/or local HTML projection]. See `docs/agents/project-board.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout — "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Include the `### Project board` sub-block and write `docs/agents/project-board.md` only when Section C selected a mode other than `NONE`. Include the `### Triage labels` sub-block, and write `docs/agents/triage-labels.md`, only when `triage` is installed and Section D ran.

Then write the docs files using the seed templates in this skill folder as a starting point. Preserve any existing product-baseline and prototype-traceability conventions instead of reducing the repo back to glossary-and-ADR-only documentation. Ensure `docs/agents/domain.md` records the effective prototype identity convention, whether preserved from the repository or established from the default:

- [git.md](./git.md) — local-only or GitHub-backed Git configuration
- [issue-tracker-github.md](./issue-tracker-github.md) — GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md) — GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md) — local-markdown issue tracker
- [project-board.md](./project-board.md) — board authority, surfaces, and refresh rules
- [scripts/board](./scripts/board) — optional one-word local launcher installed on the user's `PATH`
- [scripts/project-board.mjs](./scripts/project-board.mjs) — dependency-free GitHub Project sync and local HTML renderer/server
- [triage-labels.md](./triage-labels.md) — label mapping (only if `triage` is installed)
- [domain.md](./domain.md) — domain doc consumer rules + layout

For "other" issue trackers, write `docs/agents/issue-tracker.md` from scratch using the user's description.

When repairing an existing setup, preserve already settled Git destination, issue-tracker, board mode and authority, label-name, domain-doc, workflow-authority, and prototype-identity choices unless the user explicitly asks to change one. If ready semantics alone is missing, add the default `FRONTIER_ONLY` value and its one-sentence meaning without reopening those choices. Do not run tracker queries or inspect current labels to infer the missing value.

### 5. Done

Tell the user the setup is complete and which engineering skills will now read from these files. Report whether Git is local-only or GitHub-backed and which board surfaces were verified. Do not call a local-only setup "published", a GitHub setup "synced", or a board "current" unless the corresponding push or board sync actually succeeded. Mention they can edit `docs/agents/*.md` directly later — re-running this skill is only necessary if they want to change the Git destination, switch issue trackers or board surfaces, or restart from scratch.
