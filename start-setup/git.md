# Git Repository

- Mode: `LOCAL_ONLY | GITHUB`
- Repository root: `<absolute path>`
- Default branch: `<branch>`
- Remote: `<canonical GitHub URL or None>`
- Visibility: `private | public | internal | Not applicable`
- Initial baseline: `<commit ID or Not created>`
- Last verified: `<date and verification>`

## Safety Rules

- A Git destination choice is independent from the configured issue tracker.
- Never stage secrets, generated output, unrelated work, or files outside the confirmed baseline scope.
- `LOCAL_ONLY` never creates or pushes to a remote.
- `GITHUB` requires confirmed owner, repository name, and visibility before creation or connection.
- First commit and first push require separate explicit confirmation after showing their exact scope.
- Never force-push, rewrite history, change visibility, or replace an existing remote without a new explicit request.
