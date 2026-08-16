# WorkforceOS prototype design sources

Use this stack for WorkforceOS UI prototypes only. Product authority, the interaction contract, the fixed fixture, and the selected immutable ancestor always outrank design references.

## Portable restoration

Treat [`design-sources.lock.json`](design-sources.lock.json) as the machine-readable source identity. Install or hot-update the complete stack with:

```powershell
& "<prototype-skill>\scripts\hot-update-prototype-stack.ps1" -WorkspaceRoot "<workspace>"
```

This installs the current `prototype`, `codex`, and `apple-design` Skill snapshots, restores all three pinned component repositories, and verifies every managed file. Existing Skill directories move to a timestamped recovery location before replacement; an installation failure restores them.

After the Skill stack is installed, restore or verify only the public component sources with:

```powershell
& "<prototype-skill>\scripts\restore-design-sources.ps1" -WorkspaceRoot "<workspace>"
```

When an authorized recovery bundle already contains the pinned Git checkouts, restore without network access by adding `-SourceCacheRoot "<recovery-root>"`. The cache root must contain the same `vendor/jakubantalik/...` relative paths; restored repositories still retain their official GitHub URLs as `origin`.

Verify an existing installation with:

```powershell
& "<prototype-skill>\scripts\verify-design-sources.ps1" -WorkspaceRoot "<workspace>"
```

The hot updater installs `codex` and `apple-design` from the controlled snapshots shipped with the Prototype Skill and verifies their complete registered file sets. Use `-CodexSkillRoot` or `-AppleDesignSkillRoot` only when Codex discovers Skills from a non-default location.

The ChatGPT Community `.fig` stays at its official Figma source. The stack installation is complete with that registered remote reference; when a local authorized export is available, pass `-ChatGPTFigmaPath` and require its SHA-256 to match. A remote reference is sufficient to install the stack, but a UI build that must inspect components still stops if neither the live Figma file nor the registered export can be read.

Do not vendor the three Git repositories or the raw `.fig` into the Prototype Skill. The updater restores Git sources from pinned official commits, bundles the two explicitly registered Skill snapshots, and preserves applicable third-party notices.

## Precedence

1. Preserve formal product authority and confirmed prototype behavior.
2. Use the ChatGPT UI Kit for component anatomy, conversation patterns, density, hierarchy, and control states.
3. Use `codex` for the global visual baseline: restrained color, typography-led hierarchy, flat surfaces, concise copy, and accessible explicit states.
4. Use `apple-design` for spatial behavior, direct manipulation, interruptible motion, feedback, platform familiarity, reduced motion, and accessibility.
5. Use the three Jakub Antalik sources only for a semantically matching bounded interaction.

When sources conflict, preserve product authority first, then accessibility and comprehension. Use Codex as the visual baseline and Apple as the behavior/motion baseline. Do not combine stylistic effects merely because they are available.

## Fixed source registry

### ChatGPT UI Kit

- Live source: `https://www.figma.com/design/khXXA7rqerQEipLKEFbF2m/ChatGPT-UI-Kit--AI-Chat--Community-?t=Mq9HMb31zeQ5Y2Bz-0`
- File key: `khXXA7rqerQEipLKEFbF2m`
- Local export: resolve `chatgpt-ui-kit-community-fig.targetRelativePath` from the lock against the active workspace, or use the explicitly supplied authorized path
- Registered SHA-256: `7CCE1327A962A152177250CF88810AF1232042A8E9524685F6B3667DE7965BD8`
- WorkforceOS preflight record, when that repository is the caller: `.scratch/product-readiness/us-insurance-intake-to-work-thin-slice/wos-prototype-preflight-fig-sources-20260815-161023-cst.md`

Reinspect the live source when available and verify the local export hash before every build or verification. Treat a hash change as a new source identity. If neither the live source nor the registered export can be inspected, stop before building UI; do not reconstruct the kit from memory.

Use this source for app-shell-adjacent conversation UI, composers, project/tree navigation, lists, cards, action rows, toolbars, popovers, forms, empty states, disabled states, and confirmation flows. Do not inherit sample business semantics, branding, data models, or runtime behavior.

### Codex visual system

- Skill: resolve `codex-skill.installPathTemplate` from the lock
- Distribution: controlled bundled snapshot with TypeUI MIT attribution

Read the complete skill. Apply its blank-canvas restraint, typography-led hierarchy, minimal color, flat surfaces, concise writing, component-state completeness, and WCAG 2.2 AA requirements. Do not interpret minimalism as removing necessary context or affordances.

### Apple interaction and motion

- Skill: resolve `apple-design-skill.installPathTemplate` from the lock
- Distribution: controlled bundled snapshot under the repository's license

Read the complete skill. Apply immediate feedback, spatial consistency, interruptibility, spring behavior, reduced-motion alternatives, platform familiarity, and accessibility. Use translucency, bounce, momentum, or gesture physics only when the bounded interaction benefits from them; they are not mandatory decoration.

### Transitions.dev

- Local source: resolve `transitions-dev.targetRelativePath` from the lock against the active workspace
- Official repository: `https://github.com/Jakubantalik/transitions.dev`
- Fixed commit: `a34d3676a0d9530d1eb15d5fa374718d6916eac1`

Inspect it for state swaps, panel reveal, side-by-side navigation, dropdowns, modals, icon swaps, success feedback, and error feedback. Prefer its reduced-motion-aware transition structure when a matching interaction exists. The checked-out repository does not expose a root license file; treat it as reference-only unless the exact reused file or package has a confirmed compatible license. Do not copy unlicensed implementation into an artifact.

### Border Beam

- Local source: resolve `border-beam.targetRelativePath` from the lock against the active workspace
- Official repository: `https://github.com/Jakubantalik/border-beam`
- Fixed commit: `51727b6082e247dcf640ea65253088f4459c707e`
- Package: `border-beam`
- License: MIT

Use only for a meaningful active, connecting, processing, or attention state that cannot be expressed more clearly with ordinary status UI. Keep it subtle and bounded. Reject it when it conflicts with Codex restraint, creates decorative motion, resembles progress without measuring progress, or competes with content.

### Thinking Orbs

- Local source: resolve `thinking-orbs.targetRelativePath` from the lock against the active workspace
- Official repository: `https://github.com/Jakubantalik/thinking-orbs`
- Fixed commit: `de85557ca220332586d070d8788c0e1d6e877a0d`
- Package: `thinking-orbs@0.3.1`
- License: MIT

Use for genuine indeterminate AI or agent activity only. Map the displayed state to the real runtime lifecycle; never use it as determinate progress, completion, business success, or a substitute for status text. Supply a task-specific accessible label, honor reduced motion, and remove the orb on success, failure, cancellation, or idle.

## Required preflight

Before allocating or editing a UI version:

1. Run the complete stack verifier and require all managed Skills and Git sources to pass. For Figma, require either the live source to be inspectable or the authorized export hash to pass.
2. Read both design skills completely.
3. Inspect the Figma components and the relevant sections of all three code sources.
4. Record, for each source, `USED`, `INSPECTED_NOT_USED`, `CONFLICT_REJECTED`, or `SOURCE_UNAVAILABLE`.
5. Name the exact component or pattern adopted, its product purpose, and what semantics were not inherited.
6. Record any runtime package name and exact version in the artifact contract and dependency lock.

Inspection is mandatory; visual use is conditional. A source marked `INSPECTED_NOT_USED` is a valid outcome when it does not serve the bounded question.

## Existing and future prototypes

Do not alter a reviewed or selected artifact in place. To apply this stack to the current prototype, derive one new immutable candidate from the selected baseline and limit it to the user-authorized bounded question. Preserve all earlier artifacts and keep `CURRENT_CANONICAL` unchanged until the user explicitly selects the candidate.

Use the same preflight for every later UI version. Do not turn this stack into product authority, a production design-system decision, or permission to enter implementation.
