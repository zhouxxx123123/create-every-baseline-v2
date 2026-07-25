# UI Prototype

Build or verify immutable UI prototype versions. Every version has a stable ID; never overwrite a version the user has already seen or selected.

If the question is about logic/state rather than what something looks like — wrong branch. Use [LOGIC.md](LOGIC.md).

## Choose the work mode

- `EXPLORE_VERSIONS`: no design has been selected, or the user explicitly asks for alternatives. Generate several different candidate versions.
- `REFINE_SELECTED`: a version is already selected and the user asks to change or complete it. Build exactly one new candidate derived from the selected version; keep the selected artifact unchanged until the user chooses the new candidate.
- `VERIFY_SELECTED`: the user asks whether the selected version already works. Do not create or modify a version; exercise and record its existing behaviour.
- `COMPOSE_SELECTED`: several bounded prototypes already have selected versions and the user needs one continuously operable product workflow. Build one new integrated candidate with its own stable ID and an exact `Composed from` source list.

Do not reopen multi-version exploration during refinement or verification unless the user explicitly asks for alternatives.

## When this is the right shape

- "What should this page look like?"
- "I want to see a few options for this dashboard before committing."
- "Try a different layout for the settings screen."
- "Complete or repair the interaction chain for the version I selected."
- "Verify that the selected prototype actually works from its natural entry."
- "Connect the selected workflows into one product experience I can use from start to finish."
- Any time the user would otherwise spend a day picking between three vague mockups in their head.

## Two sub-shapes — strongly prefer sub-shape A

A UI prototype is much easier to judge when it's **butting up against the rest of the app** — real header, real sidebar, real data, real density. A throwaway route on its own is a vacuum: every version looks fine in isolation. Default to sub-shape A whenever there's a plausible existing page to host the versions. Only reach for sub-shape B if the prototype genuinely has no nearby home.

### Sub-shape A — adjustment to an existing page (preferred)

The route already exists. Prototype versions are rendered **on the same route**, gated in exploration mode by a stable `?prototypeRef=` URL search param containing the full prototype reference. The existing data fetching, params, and auth all stay — only the rendered prototype subtree changes. This is the default; pick it unless there's a specific reason not to.

If the prototype is for something that doesn't yet have a page but *would naturally live inside one* (a new section of the dashboard, a new card on the settings screen, a new step in an existing flow) — that's still sub-shape A. Mount the prototype versions inside the host page.

### Sub-shape B — a new page (last resort)

Only use this when the thing being prototyped genuinely has no existing page to live inside — e.g. an entirely new top-level surface, or a flow that can't be embedded anywhere sensible.

Create a **throwaway route** following whatever routing convention the project already uses — don't invent a new top-level structure. Name it so it's obviously a prototype (e.g. include the word `prototype` in the path or filename). Use the same stable prototype-version ID convention.

Before committing to sub-shape B, sanity-check: is there really no existing page this could be embedded in? An empty route hides design problems that a populated one would expose.

In both sub-shapes, keep exploration controls separate from the exact formal review route.

## Process

### 1. State the question, mode, and full prototype references

For `EXPLORE_VERSIONS`, default to **3 versions**. More than 5 stops being radically different and starts being noise — cap there. For `REFINE_SELECTED`, create exactly one new version. For `VERIFY_SELECTED`, create none. For `COMPOSE_SELECTED`, create exactly one integrated candidate from the exact selected source versions.

Use the repository convention established by setup. Resolve the Prototype ID, reserve the next sequential version numbers in the manifest before building, and show the full prototype reference on review surfaces. Record `Derived from` as a full reference for refinements and exact manifest + full reference identities under `Composed from` for compositions. Give every version a concise semantic display name. Do not create standalone letter labels or opaque combinations such as `A`, `AJ`, `BF`, or `L1J`; preserve inherited codes only under the manifest's `Legacy aliases`.

Write down the plan in one line, in the prototype's location or a top-of-file comment:

> "Mode: EXPLORE_VERSIONS. Three versions of the settings page on the existing `/settings` route, with stable IDs on the exploration route."

This works whether the user is here to push back or not.

### 2. Build the required versions

In `EXPLORE_VERSIONS`, make the candidates structurally different. In `REFINE_SELECTED`, preserve the selected version's accepted direction and change only the bounded behaviour being refined. In `COMPOSE_SELECTED`, preserve every admitted source behaviour and add only the shell, navigation, shared state, handoffs, and terminal continuity needed to operate them together. Hold each new version to:

- The page's purpose and the data it has access to.
- The project's component library / styling system (TailwindCSS, shadcn, MUI, plain CSS, whatever).
- A clear exported component or artifact name derived from its full prototype reference.

Exploration versions must be **structurally different** — different layout, different information hierarchy, different primary affordance, not just different colours. Refinement versions do not need artificial visual differences; they answer the bounded change request.

For a composition, map every visible source action to its exact source manifest, version, and interaction ID. Add stable integration IDs for navigation and cross-workflow transitions that did not exist inside any source. If the sources conflict, stop and return the conflict to the originating product decision instead of silently choosing one.

### 3. Wire them together

For exploration only, create a switcher on a development route or mode. Use URL-encoded full prototype references in the URL:

```tsx
// pseudo-code — adapt to the project's framework
const prototypeRef = searchParams.get('prototypeRef') ?? currentCandidateRef;
return (
  <>
    {prototypeRef === 'PT-settings@V001' && <PTSettingsV001 {...data} />}
    {prototypeRef === 'PT-settings@V002' && <PTSettingsV002 {...data} />}
    <PrototypeSwitcher versions={candidateRefs} current={prototypeRef} />
  </>
);
```

For sub-shape A (existing page): keep all the existing data fetching above the switcher; only the rendered subtree changes per version.

For sub-shape B (new page): the throwaway route under `/prototype/<name>` mounts the same switcher.

The formal review route opens one exact version with the switcher hidden. It must resolve to the artifact and fixture refs recorded for that version, or the manifest must provide the exact command for reproducing that pinned artifact locally. A mutable development route alone is not a formal review source. The switcher belongs only to exploration mode.

For `COMPOSE_SELECTED`, use one formal integration route with the normal product shell. Its natural entry, navigation, shared in-memory state or deterministic stubs, source-workflow handoffs, terminal result, and return path must all work without a version switcher or direct-state shortcut.

### 4. Build the floating switcher

A small fixed-position bar at the bottom-centre of the exploration route with three pieces:

- **Left arrow** — cycles to the previous candidate version (wraps around).
- **Version label** — shows the full prototype reference and semantic display name, for example `PT-settings@V002 — Sidebar layout`.
- **Right arrow** — cycles forward (wraps around).

Behaviour:

- Clicking an arrow updates the URL search param (use the framework's router — `router.replace` on Next, `navigate` on React Router, etc) so the exact version is shareable and reload-stable.
- Keyboard: `←` and `→` arrow keys also cycle. Don't intercept arrow keys when an `<input>`, `<textarea>`, or `[contenteditable]` is focused.
- Visually distinct from the page (e.g. high-contrast pill, subtle shadow) so it's obviously not part of the design being evaluated.
- Hidden in production builds — gate on `process.env.NODE_ENV !== 'production'` or an equivalent check, so a stray prototype merge can't ship the bar to users.

Put the switcher in a single shared component so both sub-shapes can reuse it. Locate it wherever shared UI lives in the project.

### 5. Hand it over

Surface the exploration URLs and one exact formal review URL per candidate. For every candidate the user sees, record the immutable artifact ref and fixed fixture ref so the same version can be reproduced later. If the user asks to combine parts of alternatives within one prototype, build that combination as one new derived version before asking them to select it. If the user asks to connect selected bounded workflows, build one `COMPOSE_SELECTED` version and surface its exact source-version and source-artifact list with the formal integration URL.

### 6. Capture the answer and retire exploration controls

Once the user chooses a version, verify its recorded artifact and fixture refs reproduce what was reviewed, mark it `CURRENT_CANONICAL`, append the choice to selection history, and preserve every other version unchanged. Make the selected version's pinned formal URL or reproduction command the default review source. For a composed version, also freeze its exact source-version, artifact, and fixture set in the manifest. Keep the switcher and unselected versions only in the repository's declared throwaway prototype location or branch, never in the downstream implementation contract.

Do not fold prototype code directly into production. The selected version and confirmed interaction IDs become evidence for the canonical product decision and specification; production implementation is rewritten under normal architecture, test, error-handling, accessibility, and security requirements.

## Anti-patterns

- **Overwriting a reviewed version.** Any observable change creates a new stable version derived from the old one.
- **Treating a mutable URL as a frozen version.** Bind every presented version to an immutable artifact and deterministic fixture; a route that follows current source code is only a convenience pointer.
- **Generating alternatives during refinement.** Build one derived version unless the user explicitly reopens exploration.
- **Exploration versions that differ only in colour or copy.** Real alternatives disagree about structure; a small requested change is refinement, not exploration.
- **Wiring versions to real mutations.** Use in-memory state or deterministic stubs. When the bounded question is a workflow, the visible user action and resulting transition must work even though the real backend is not involved.
- **Pasting selected prototypes beside one another.** A composition must implement the natural entry, navigation, shared state, handoffs, and terminal continuity between them.
- **Silently changing a source during composition.** Create and review a new derived source version, then create a new composed version that names it.
- **Building a whole-product mega-prototype.** Compose one bounded release workflow or subsystem at a time and connect it through the shared shell.
- **Promoting the prototype directly to production.** Prototype code was written under prototype constraints. Rewrite the selected behaviour properly during the production implementation workflow.
