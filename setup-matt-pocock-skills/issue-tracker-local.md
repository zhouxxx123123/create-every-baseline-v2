# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — Destination, Notes, Product areas and linkages, Decisions-so-far, Not-yet-specified, and Out-of-scope.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `open`/`claimed`/`resolved`. Cross-functional tickets record the producer, consumer, shared object/event/action, source-of-truth owner, and expected writeback needed to answer the question.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## Prototype artifacts

- Store or link a prototype manifest beside each prototype. The manifest records origin, Prototype ID, configured full prototype references, semantic display names, historical aliases, immutable artifact and fixed fixture refs, product areas and linkage, question, exact canonical decision sources, scope, excluded behaviour, derivation or exact composition sources, append-only selection history, the current canonical version, version-scoped journey/branch/state/interaction IDs, composition coverage when relevant, review, downstream consumption, conclusion, resume target, and supersession.
- A prototype ticket links the manifest as its asset. Resolving the ticket records the validated conclusion and returns to the originating decision.
- When reviewed evidence is admitted, the originating canonical decision links back to the manifest and names the confirmed states or interaction scope. Do not infer links from filenames or attach rejected, deferred, or superseded prototypes as confirmed evidence.
- Specs may cite reviewed prototype states as evidence. Prototype code and screenshots do not override the product baseline, spec, or ADR.
