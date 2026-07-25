---
name: prototype
description: Build a throwaway prototype to answer a bounded design question. Use for state, component, logic, or end-to-end UI workflow validation, including version comparison and natural-entry interaction checks before specification.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Preserve the caller

Before building, record:

- the originating workflow or `standalone`;
- the exact unresolved design question;
- the artifact, conversation, issue, or decision to resume;
- what the user must be able to observe or validate.

Also record the affected product areas and the cross-functional handoff being tested: producer, consumer, shared object/event/action, source-of-truth owner, and expected result or writeback.

## Determine the prototype unit

Classify the bounded evidence before building:

- `STATE`: one observable state with no claim that the surrounding journey works;
- `COMPONENT`: one bounded control or interaction with no claim that the surrounding journey works;
- `WORKFLOW`: a user journey with a natural entry, one or more actions, an observable terminal outcome, and a return path or handoff.

Use `WORKFLOW` whenever the design question includes entry, navigation, submission, a sequence of state transitions, or a return path. A collection of directly addressable screens is not a workflow prototype.

## Resolve the repository identity convention

Before creating or changing a prototype, read the effective convention recorded by `start-setup` in `docs/agents/domain.md` or the repository-declared equivalent.

- Use a coherent existing repository convention exactly as recorded.
- For a repository's first prototype, setup establishes the default `PT-<bounded-target>@V001` convention without asking a product question.
- If no convention is recorded, do not improvise a random ID or private numbering scheme. Run setup or setup repair first.
- Preserve every historical full reference. Never renumber reviewed, selected, deferred, superseded, or abandoned versions to remove gaps.

Allocate before building:

1. Resolve or create the repository-unique Prototype ID for the bounded target.
2. Read every existing version row for that Prototype ID, including reserved and deferred rows.
3. Serialize allocation for that Prototype ID. Use the repository's existing lock or transactional write mechanism; when none exists, do not allocate versions for the same Prototype ID concurrently.
4. Reserve the next unused sequential Version ID or contiguous block of IDs by appending `RESERVED` rows to the manifest in one write. Re-read and verify the reservation before building; if another writer won the allocation, reload and reserve the next available numbers. Never reuse a number from a failed reservation.
5. Change each reserved row to `CANDIDATE` only after its artifact and fixture identity exist.

The canonical identity used outside the manifest is the full prototype reference defined by the recorded repository convention. Under the default it is `<Prototype ID>@<Version ID>`. Pair every version with a concise semantic display name that describes the visible design direction. Opaque codes such as `A`, `AJ`, `BF`, or `L1J` are not valid display names. A coherent legacy convention may use another recorded identity form, but a bare locally scoped version number, display name, route, or timestamp is not sufficient.

When migrating historical letter-coded versions, preserve the original code under `Legacy aliases`, assign a semantic display name, and keep the original full prototype reference, artifact, fixture, review, and selection history unchanged. Renaming display metadata never authorizes renumbering or rewriting reviewed evidence.

The validator treats the old `Display label` column as a migration warning, while the current `Display name` schema enforces semantic naming and the `Legacy aliases` column. New manifests must use the current schema.

## Create a prototype manifest

Keep a manifest beside the prototype in the repository-declared format. If none exists, use `PROTOTYPE.md`; an existing `NOTES.md` may be upgraded in place. The manifest is the traceability record, while the prototype code remains throwaway.

```markdown
# <Prototype name>

## Origin
<standalone, map ticket, spec, product decision, or conversation artifact>

## Prototype unit
- Prototype ID: <repository-unique ID from the configured convention>
- Type: `STATE | COMPONENT | WORKFLOW`
- Bounded target: <one bounded design question>
- Natural entry: <where the user begins, or `Not applicable`>
- Terminal outcome: <observable ending, or `Not applicable`>
- Return path or handoff: <where the user lands next, or `Not applicable`>

## Product areas and linkage
- Areas: <affected product functions>
- Handoff: <producer> -> <consumer> via <shared object/event/action>
- Source of truth: <owner of the durable state>
- Result/writeback: <what changes and where it is recorded>

## Question
<one exact unresolved design question>

## Decision sources
<links to the exact product-baseline decision or other canonical decision being tested, plus relevant glossary terms, ADRs, or specs>

## In scope
<pages, states, interactions, and prototype versions being tested>

## Not validated
<placeholders and deliberately excluded behaviour>

## States and routes
<specific commands, URLs, prototype versions, or state names>

## Prototype versions
| Version ID | Full prototype reference | Display name | Legacy aliases | Derived from | Composed from | Status | Review route | Immutable artifact ref | Fixture ref | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <ordered version ID> | <configured full prototype reference> | <semantic human-facing name> | <historical codes or `None`> | <full prototype ref or `None`> | <exact manifest + full prototype ref + artifact + fixture refs, or `None`> | `RESERVED | CANDIDATE | CURRENT_CANONICAL | NOT_SELECTED | SUPERSEDED | DEFERRED` | <formal route> | <commit, content hash, immutable build, or archived bundle> | <fixed data/config identity> | <reason or distinction> |

## Selection history
| Selected at | Full prototype reference | Selected by | Superseded selection |
| --- | --- | --- | --- |
| <date/time> | <configured full prototype reference> | <product authority> | <previous full prototype ref or `None`> |

## Journey coverage
| Full prototype reference | Step ID | From | User action | Expected visible result | Reachability | Mechanical check | Product review | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <full prototype reference> | <version-scoped stable ID> | <state> | <action> | <result> | `NATURAL | DETERMINISTIC_FIXTURE | DIRECT_STATE_ONLY | OUT_OF_SCOPE` | `PASS | FAIL | NOT_RUN` | `CONFIRMED | REJECTED | DEFERRED | NOT_REVIEWED` | <observation, capture, or trace> |

## Branch coverage
| Full prototype reference | Branch ID | Trigger | Expected result | Reachability | Mechanical check | Product review | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <full prototype reference> | <version-scoped stable ID> | <condition or action> | <result> | <reachability> | <check> | <review> | <observation, capture, or trace> |

## Composition coverage
| Integrated ID | Source manifest | Source version | Source IDs | Integration responsibility | Evidence |
| --- | --- | --- | --- | --- | --- |
| <version-scoped integration ID> | <manifest link> | <exact selected full prototype reference> | <exact source IDs> | <entry, navigation, shared state, handoff, writeback, or terminal result> | <observation, capture, or trace> |

## External boundaries
| Control or handoff | Boundary owner | Behaviour validated here | Not validated here |
| --- | --- | --- | --- |
| <control or handoff> | <other slice or system> | <validated boundary> | <excluded destination behaviour> |

## Review
- Version reviewed: <full prototype reference>
- Immutable artifact reviewed: <exact artifact ref>
- Fixture reviewed: <exact fixed data/config ref>
- Mechanically verified: <date, environment, and input method>
- Reviewed by: <product authority>
- Status: `EXPLORING | PARTIALLY_CONFIRMED | CONFIRMED`
- Exact reviewed scope: <full prototype reference plus journey, step, branch, state, or interaction IDs>

## Conclusion
<validated answer and remaining uncertainty>

## Resume at
<exact decision, map ticket, product-baseline section, or spec that consumes the answer and must add the evidence backlink after admission>

## Downstream consumption
- Current canonical prototype version: <one full prototype reference>
- Immutable artifact and fixture refs: <exact refs>
- Composed source versions: <exact manifest + full prototype ref + artifact + fixture refs, or `None`>
- Consumable integration journey and branch IDs for that version: <ids>
- Consumable source IDs admitted through the composition: <manifest + full prototype ref + IDs, or `None`>
- Other versions and excluded evidence that downstream work must not consume: <version IDs and evidence IDs>
- Remaining assumptions: <items>
- Stop conditions: <conditions requiring return to product work>

## Supersession
<what this replaces and what later replaced it, if applicable>
```

For `STATE` and `COMPONENT`, use only the coverage rows relevant to the bounded question and write `Not applicable` for journey fields. For `WORKFLOW`, the journey table is mandatory. For a non-composed version, write `None` under `Composed from` and `Not applicable` under `Composition coverage` and composed-source consumption. Namespace every coverage ID by prototype version so evidence from different versions cannot be mixed accidentally.

Run the bundled manifest validator after every material manifest edit:

```bash
node "<resolved-prototype-skill-dir>/scripts/validate-prototype-manifest.mjs" \
  <prototype-manifest.md>
```

Before admitting reviewed evidence downstream, rerun it with `--require-canonical --require-confirmed`. The strict mode checks one canonical version, selection history, immutable artifact and fixture identities, reviewed-version alignment, concrete workflow journey evidence, downstream consumption identity, duplicate coverage IDs, and local decision/return links. Structural success does not replace product review.

Do not restate a product decision as if the manifest owns it. Link to the canonical decision; after review, the originating workflow decides whether and where that decision is updated.

## Close the traceability loop

When the originating workflow admits reviewed prototype evidence:

1. Keep the manifest's `Decision sources` link pointed at the exact canonical decision.
2. Add a backlink from that decision to this manifest.
3. On the backlink, name the exact canonical prototype version + immutable artifact + fixture identity and only its confirmed states, routes, or interaction IDs. Do not imply that another version, artifact, fixture, or unreviewed area was accepted.
4. If a prototype version is not selected, deferred, or superseded, record that status in the manifest and do not attach it as current confirmed evidence.

The two links serve different purposes: the manifest explains what decision it tested; the product decision shows which reviewed evidence supports it.

A prototype validates only the exact design question and reviewed scope recorded in the manifest. It does not prove that the broader business rule, market assumption, data source, or technical mechanism is correct. The originating product workflow decides whether the result is sufficient to change a material decision's validation status.

## Complete workflow prototypes

For a `WORKFLOW` prototype:

1. Make the primary success journey mechanically reachable from the natural product entry. Direct state URLs or debug controls may supplement evidence but cannot replace this journey.
2. Make every visible in-scope action cause its recorded transition. A visible no-op is a failed mechanical check.
3. Use `DETERMINISTIC_FIXTURE` for failures or rare conditions that cannot be reproduced reliably, but trigger the resulting state through the real user action whenever practical.
4. Record visible controls that cross the bounded target under `External boundaries`. Either make the handoff work, clearly disable it as outside the prototype, or remove it from the reviewed surface; do not leave an unexplained no-op.
5. Exercise the natural success journey and every material confirmed branch in a running prototype. Record environment, input method, and an evidence reference. Code presence or a screenshot of one state alone is not mechanical workflow evidence.
6. Use `PARTIALLY_CONFIRMED` while any required step is `FAIL`, `NOT_RUN`, `NOT_REVIEWED`, or only `DIRECT_STATE_ONLY`. Use `CONFIRMED` only for the exact prototype version + immutable artifact + fixture identity whose natural success journey passes, whose required branches have sufficient evidence, and whose exact IDs the product authority reviewed.

Do not silently expand the prototype to the whole product. Completeness applies only inside the recorded bounded target; adjacent capabilities remain explicit handoffs or exclusions.

## Manage immutable prototype versions

- Give every prototype and version its configured full reference and never reuse it. Also give every version a concise semantic display name; standalone letters, compound letter codes, and route-like codes are forbidden for new names. A display name never replaces the full reference.
- Preserve historical opaque names only under `Legacy aliases`. Do not use a legacy alias as a current display name, route identity, selection identity, or downstream reference.
- Never overwrite a previously presented, reviewed, or selected version. Keep it unchanged. Any observable design, copy, interaction, state, or workflow change creates one new version with `Derived from` pointing to its source version.
- On first presentation or mechanical review, bind the full prototype reference to an immutable artifact identity and fixed fixture identity. Prefer a version-control revision plus reproducible command, content-addressed build, or archived runnable bundle. If none is available, archive the bounded prototype files and deterministic fixtures with checksums. A route, branch name, filename, screenshot, bare version number, or display name alone is not immutable identity.
- Shared components, routes, dependencies, configuration, and data may continue evolving, but they must not change what an existing full prototype reference resolves to. If the reviewed behaviour changes under a newer dependency or fixture, create a new version and artifact ref.
- Do not mark a version `CONFIRMED` or list it for downstream consumption unless its reviewed interactive behaviour can be reproduced from the recorded artifact and fixture refs. Screenshots or recordings may support review but cannot replace a runnable artifact for a workflow claim.
- Allow any number of candidate versions. After the product authority makes a choice, record exactly one `CURRENT_CANONICAL` version and append the choice to the append-only selection history; preserve all other versions as history.
- A later selection supersedes the previous selection but does not edit or erase the previously selected artifact. New versions do not alter existing specifications or tickets automatically.
- Make the current candidate or canonical version available at a stable formal review route with exploration controls hidden. Keep version switchers on a separate exploration route or mode.
- List only the current canonical version's confirmed, version-scoped IDs under `Downstream consumption`.
- When the repository declares a prototype-journey index, register each new version and update the current canonical pointer without copying product decisions into the index.

Downstream specifications and tickets pin one exact prototype version + immutable artifact + fixture identity. Do not combine IDs from different versions or substitute a mutable route for the pinned artifact. To combine alternatives within one bounded prototype, build a new derived version, have the product authority select it, and review that version as its own artifact.

## Compose selected workflows

Use `COMPOSE_SELECTED` when several bounded prototypes already have selected versions but the user needs to validate that they operate as one coherent product workflow.

1. Create one new `WORKFLOW` prototype version with its own reserved full prototype reference. Record every source as an exact manifest, selected full prototype reference, immutable artifact ref, and fixture ref under `Composed from`; never infer a source from a filename, display name, route, or latest timestamp.
2. Preserve each source version's accepted local behaviour. Add the shared product shell, natural entry, navigation, return paths, shared state, cross-workflow handoffs, durable writebacks, and terminal result needed to make the bounded composition continuously operable.
3. Record every admitted source ID and every new cross-workflow integration ID in `Composition coverage`. A visible source action that becomes a no-op after composition fails the composed workflow.
4. If composition requires changing an accepted source behaviour, do not edit it inside the composition. Create and review a new derived source version first, then create a new composed version that names the replacement source.
5. Review the composed version from its natural entry through every in-scope source workflow and the final handoff. Selecting a composed version does not erase or replace the canonical selections inside its source manifests.
6. Keep the target bounded to one release workflow or subsystem. Do not build a whole-product mega-prototype merely because several prototypes exist.

A composed version is the explicit, reviewed exception to the no-mixing rule: downstream work may consume only the exact source-version set and IDs named by that composed version. The composed version governs cross-workflow entry, navigation, shared state, and handoffs; source versions govern their admitted local interaction details.

## Pick a branch

Identify which question is being answered — from the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a tiny interactive terminal app that pushes the state machine through cases that are hard to reason about on paper.
- **"What should this look like or how should this UI workflow behave?"** → [UI.md](UI.md). Choose exploration, refinement, or verification mode before creating or changing versions.

The two branches produce very different artifacts — getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious — but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
2. **One command to run.** Whatever the project's existing task runner supports — `pnpm <name>`, `python <path>`, `bun <path>`, etc. The user must be able to start it without thinking.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE — wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every version switch (UI), print or render the full relevant state so the user can see what changed.
6. **Capture the answer when done.** Update the manifest with what the user exercised, the exact states confirmed or rejected, the validated conclusion, unresolved points, and downstream pointer. Keep the prototype on a throwaway branch or other repository-declared prototype location. The main branch keeps only decisions later admitted by the originating workflow.

## Return before advancing

A prototype is a bounded design detour. After the user validates the relevant conclusion, return to the recorded caller and resume the exact design question. The caller decides whether the conclusion closes a product decision, changes the specification, requires another validation, or is ready for implementation.

Prototype completion is not permission to invoke `to-spec`, create tickets, or fold code into production. If invoked standalone, report the conclusion and recommend at most one explicit next workflow without invoking it silently.
