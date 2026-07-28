# Project Board

- Setup workflow: `FULL_SETUP | UPDATE_BOARD`
- Mode: `NONE | LOCAL_HTML | GITHUB_PROJECT | DUAL`
- Adapter version: `3`
- Canonical state: `ISSUE_TRACKER`
- Interface language: `zh-CN | en`
- GitHub Project: `<URL or Not configured>`
- Local HTML: `<repo-relative output path or Not configured>`
- Local URL: `http://127.0.0.1:<port>/`
- Local views: `Product Catalog | Tree | Flow`
- Product catalog: `<repo-relative catalog path or Not configured>`
- Machine config: `.project-board/config.json`
- Quick open command: `board`
- Doctor command: `node .project-board/project-board.mjs doctor`
- Sync command: `node .project-board/project-board.mjs sync`
- Serve command: `node .project-board/project-board.mjs serve`
- Live refresh: `Local Markdown watch | GitHub polling | Disabled`
- Last verified: `<date and result>`

## Authority

- `UPDATE_BOARD` changes only this projection setup; it preserves the existing Git destination, canonical tracker, Wayfinder Maps, tickets, domain rules, and prototype identity.
- The configured issue tracker owns ticket content and workflow state.
- GitHub Project and local HTML are projections of that same canonical state.
- `Product Catalog` organizes stable product capabilities across efforts without replacing their canonical decisions, specifications, or implementation tickets.
- Multiple Wayfinder Maps may contribute to one product catalog; Map directories remain historical workflow identities, not automatic product boundaries.
- Do not create board-only decisions, blockers, or lifecycle states.
- Local HTML is read-only. Apply changes through the canonical tracker, then run the sync command.
- A GitHub Project field must not override or silently diverge from canonical issue state.
- `Tree` keeps each Wayfinder Map as the effort root, preserves known parent/child ticket relationships, and shows a real specification and its implementation issues only after those canonical artifacts exist.
- `Flow` draws blocker-to-blocked dependency edges and highlights the Map-declared Active frontier, or the derived executable frontier when no Map authority exists.
- Product questions, headings, checklists, and ordinary document sections are inspector content, not board nodes. Research, Spike, Prototype, specification, implementation, and sub-issue nodes require their own canonical artifact.
- When a Local Markdown Map declares an Active frontier, that declaration wins over a board-derived unblocked candidate calculation.

## Product Catalog Rules

- Do not require a complete product function tree before discovery. Open or claimed tickets without a stable mapping remain in `Exploration`.
- After a decision is resolved, record one catalog effect in the same canonical write:
  - `Catalog impact: ADD | UPDATE | SUPERSEDE | NO_CHANGE | NEEDS_CLASSIFICATION`
  - `Catalog nodes: <stable-catalog-id>[, <stable-catalog-id>]` for `ADD`, `UPDATE`, or `SUPERSEDE`
- Update the catalog Markdown only for stable capability changes. Keep full answers and evidence in their canonical tracker items.
- Specifications and implementation tickets may declare the same `Catalog nodes` metadata so delivery status is derived automatically.
- Board sync, doctor, rendering, and status derivation are deterministic. Use semantic assistance only for genuinely ambiguous mappings.

## Refresh Rules

- Run the sync command after a successful canonical tracker write that creates an item or changes state, labels, assignment, blocking, or closure.
- While the serve command is running, Local Markdown changes are watched and GitHub Issues are polled. The browser reloads only when canonical item data actually changes.
- Live refresh is a convenience, not a replacement for the sync command. Keep the explicit command as the recovery path and for updates made while the local server is stopped.
- A projection refresh failure does not roll back a successful canonical write. Report the stale surface and exact recovery command.
- Never report the GitHub Project or local HTML surface as synchronized unless its latest refresh succeeded.
- The local server binds to `127.0.0.1` by default and must not expose repository content on a public interface.
