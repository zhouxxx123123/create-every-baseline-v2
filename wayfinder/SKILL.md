---
name: wayfinder
description: Plan a huge chunk of work — more than one agent session can hold — as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
---

A loose idea has arrived — too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on the repo's issue tracker, then works its **decision tickets** — questions whose resolution is a decision, not slices of a build to execute — one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting — it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic — engineering work, course content, whatever fits the shape.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes** — carrying execution into the map itself — but absent that, produce decisions, not deliverables.

## Refer by name

Every map and ticket is an issue, so it has a **name** — its title. In everything the human reads — narration, the map's Decisions-so-far — refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish — a name wraps its link — but they ride *inside* the name, never stand in for it.

## The Map

The map is a single issue on this repo's issue tracker, labelled `wayfinder:map` — the canonical artifact. Its tickets are child issues of the map.

The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place — its ticket — so the map never restates it, only gists it and links.

**Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific.** The issue tracker should have been provided to you — run `/start-setup` if not. Consult the tracker doc's "Wayfinding operations" section for how _this_ repo expresses them. If no tracker has been provided, default to the local-markdown tracker.

If `docs/agents/project-board.md` exists, the tracker remains canonical. After a successful map or ticket write that changes creation, claim, blocking, status, or closure, run the configured board sync command. Never read a board-only field as product or routing authority. A projection failure does not undo the canonical write; report the stale surface and recovery command.

### The map body

The whole map at low resolution, loaded once per session. Open tickets are **not** listed — they are open child issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like — the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort. If deferred-scope automation is used, declare the one canonical ledger, scan roots, scanner, and coverage boundary here.>

## Product areas and linkages

<low-resolution index of affected product areas and known handoffs. Use one line per linkage: producer -> consumer via shared object/event/action; link the decision ticket when one exists. Keep unresolved detail in its ticket or Not yet specified, not duplicated here.>

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [<closed ticket title>](link) — <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a **child issue** of the map; the tracker's issue id is its identity. Its body is the question, sized to one 100K token agent session. When the question crosses product areas, include only the linkage context needed to resolve it:

```markdown
## Product areas and linkage

<producer> -> <consumer> via <shared object/event/action>; source-of-truth owner and expected writeback when known

## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries a `wayfinder:<type>` label — one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).

### Deferred scope ledger

Every decision ticket must classify limiting or deferred language before it closes. Use the semantic classes defined by the active grilling or product-readiness workflow:

- `EXCLUSION_ONLY`
- `DEFERRED_PRODUCT`
- `DOWNSTREAM_PROTOTYPE`
- `DOWNSTREAM_SPEC`
- `TECHNICAL_VALIDATION`
- `FUTURE_OPTIONAL`
- `RESOLVED_LATER`
- `SUPERSEDED`
- `NEEDS_CLASSIFICATION`

For each `DEFERRED_PRODUCT`, record the canonical owner, phase, exact resume gate, and blocking level. If the question is sharp now, create or link its ticket. If it is still fog, keep it in **Not yet specified** with the condition that will make it sharp. Downstream validation and specification work should link its evidence owner rather than become a duplicate product ticket. `EXCLUSION_ONLY` creates no future work.

The map stores only a one-line route or link. The source phrase, classification rationale, authority, and complete boundary stay in the decision ticket or a dedicated audit ticket.

A ticket cannot close while:

- an in-scope `DEFERRED_PRODUCT` lacks an owner or resume gate;
- a deferred phrase remains `NEEDS_CLASSIFICATION`;
- a prototype, specification, research, or technical item is being presented as a confirmed product answer;
- the ticket's answer relies on an unresolved adjacent choice without recording the dependency.

For a corpus-wide recovery or completeness audit, build a source-to-ledger coverage matrix from the original canonical tickets. Every detected deferred source must map to one semantic classification ID. Counts inside the audit ledger cannot prove the ledger is complete by themselves.

When an effort uses a dedicated deferred-scope ledger, its map Notes must identify:

- `Deferred ledger`: the one canonical ledger or audit ticket;
- `Deferred scan roots`: the canonical source paths included in coverage;
- `Deferred scanner`: the configured command or tool;
- `Deferred coverage boundary`: the effort, phase, or corpus the result covers.

Do not invent a second ledger when these values already exist. A coverage result is a snapshot of the declared roots at their current content, not a permanent property of the effort.

#### Incremental pre-resolve gate

Run this sequence before resolving every persisted decision ticket:

1. Persist the user's exact confirmed answer in the canonical ticket.
2. Scan that changed ticket against the configured ledger.
3. Semantically classify and register every new source ID. Split a line that mixes several classes into separate, meaning-preserving source statements before registration.
4. Reconcile existing ledger items that the new answer resolves or replaces. Preserve their audit trace, update them to `RESOLVED_LATER` or `SUPERSEDED`, and link the current canonical answer.
5. Refresh affected classification totals, blocker summaries, deferred queues, and the exact resume target.
6. Run a strict ticket-local coverage check. Missing IDs, duplicate IDs, unclassified records, or `NEEDS_CLASSIFICATION` all block closure.
7. Immediately before changing tracker status to `resolved`, run the configured full-scope strict check. This catches changes in other canonical sources and stale "coverage complete" claims.

Automatic scanning detects and enforces coverage; it does not make product decisions. If semantic classification cannot be established from current authority, use `NEEDS_CLASSIFICATION`, keep the ticket claimed or open, and ask or route the single required question. A dedicated audit ticket may remain resolved while receiving governance synchronization, because this updates its ledger rather than reopening its original product question.

For a Local Markdown tracker, also run the bundled structural validator before changing frontier or ticket status:

```bash
node "<resolved-wayfinder-skill-dir>/scripts/validate-local-map.mjs" \
  .scratch/<effort>/map.md \
  --require-active
```

The validator checks ticket metadata, blocker references, the single claimed ticket, the map's canonical Current frontier link, Resume target, Next skill, and local Markdown link targets. Its computed unblocked-open list is routing evidence, not permission to invent dependencies or choose a product answer.

A session **claims** a ticket by assigning it to the dev driving the map, **first**, before any work, so concurrent sessions skip it. That assignee _is_ the claim: an open, unassigned ticket is unclaimed.

Blocking uses the tracker's **native** dependency relationship — essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children — the edge of the known.

The answer isn't part of the body — it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.

## Ticket Types

Every ticket is either **HITL** — human in the loop, worked *with* a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a `/research` **subagent**. Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to — an outline, a rough take, a stub, or UI/logic code via the /prototype skill. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation via the /grilling and /domain-modeling skills, one question at a time. The default case.
- **Task** (HITL or AFK): Manual work that must happen before a *decision* can be made — nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that *does* rather than decides — and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war** — the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets — one at a time, until the way to the destination is clear and no tickets remain.

The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination — everything here is in scope, just not sharp enough to ticket. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.

**Fog or ticket?** The test is whether you can state the question precisely now — _not_ whether you can answer it now.

- **Ticket when** the question is already sharp — even if it's blocked and you can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Don't pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and one patch may graduate into several tickets, or none, once the frontier reaches it.

**Not yet specified** excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope** — it isn't fog, and it doesn't belong in **Not yet specified**. It gets its own **Out of scope** section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.

Out-of-scope work never graduates — the frontier stops at the destination — so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.

Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination — mis-scoped in while charting, or exposed by a resolution — **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked — a scope boundary isn't a step on it.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session** — with the exception of research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Run a `/grilling` and `/domain-modeling` session to pin down what this map is finding its way to — the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** — the way to the destination is already clear, the whole journey small enough for one session — you don't need a map. Stop and ask the user how they'd like to proceed.
3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Create the tickets you can specify now** as child issues of the map — then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Wiring sorts them into the frontier and the blocked; everything you can't yet specify stays in the fog — the **Not yet specified** section.
5. **Fire the research subagents.** For each `research` ticket you just created, spin up a `/research` subagent to resolve it in parallel, capturing its findings on a throwaway `research/<name>` branch with a context pointer from the ticket.
6. Stop — charting is one session's work; it hand-resolves nothing.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional** — without one, you pick the next decision, not the user.

1. Load the **map** — the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. **Claim it**: assign it to yourself before any work.
3. Resolve it — **zoom as needed**: fetch the full body of any related or closed ticket on demand; invoke the skills the `## Notes` block names. If in doubt, use `/grilling` and `/domain-modeling`.
4. Run the incremental pre-resolve gate, including ticket-local and configured full-scope strict coverage checks. For a Local Markdown tracker, run `validate-local-map.mjs` before and after the status/frontier update; the pre-update run may omit `--require-active` only when the current ticket is about to be resolved, while the post-update run must reflect the newly selected active frontier or a completed map. Only after the applicable checks pass, record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far. Tracker `resolved` means the ticket's product question is answered; it does not imply prototype, technical, specification, implementation, or production validation.
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals a ticket — this one or another — sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.

The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.
