# Project Board

- Mode: `NONE | LOCAL_HTML | GITHUB_PROJECT | DUAL`
- Canonical state: `ISSUE_TRACKER`
- GitHub Project: `<URL or Not configured>`
- Local HTML: `<repo-relative output path or Not configured>`
- Local URL: `http://127.0.0.1:<port>/`
- Local views: `Tree | Flow`
- Machine config: `.project-board/config.json`
- Sync command: `node .project-board/project-board.mjs sync`
- Serve command: `node .project-board/project-board.mjs serve`
- Last verified: `<date and result>`

## Authority

- The configured issue tracker owns ticket content and workflow state.
- GitHub Project and local HTML are projections of that same canonical state.
- Do not create board-only decisions, blockers, or lifecycle states.
- Local HTML is read-only. Apply changes through the canonical tracker, then run the sync command.
- A GitHub Project field must not override or silently diverge from canonical issue state.
- `Tree` groups efforts and preserves known parent/child ticket relationships.
- `Flow` draws blocker-to-blocked dependency edges and highlights the current executable frontier.

## Refresh Rules

- Run the sync command after a successful canonical tracker write that creates an item or changes state, labels, assignment, blocking, or closure.
- A projection refresh failure does not roll back a successful canonical write. Report the stale surface and exact recovery command.
- Never report the GitHub Project or local HTML surface as synchronized unless its latest refresh succeeded.
- The local server binds to `127.0.0.1` by default and must not expose repository content on a public interface.
