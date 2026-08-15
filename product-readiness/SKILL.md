---
name: product-readiness
description: Guide one product feature, workflow, or bounded subsystem through the configured discovery skills until it is ready for `to-spec`. Use when product decisions, evidence, prototypes, cross-functional effects, or source documents may still be incomplete or inconsistent. Do not use for implementation planning, integration acceptance, release readiness, or deployment.
---

# Product Readiness

Act as the product-stage coordinator. Do not redo the interviews, research, prototypes, technical experiments, or specification work owned by other skills.

## Lock the review target

Before judging readiness, state:

- the one feature, workflow, or bounded subsystem being reviewed;
- the intended specification boundary;
- the repository-declared canonical product sources;
- the originating workflow or decision to resume, when applicable.

Do not silently expand the review to the whole product. If the target is too large for one bounded specification, route to `wayfinder`.

If the user asks whether all historical, deferred, or cross-product decisions are complete, that is a corpus-completeness audit rather than a bounded readiness check. Route it through `wayfinder` and require source-to-ledger coverage. Do not claim global completeness by finding only the current blocker or by reconciling counts inside an audit ledger.

## Find the current blocker

Read only enough current material to identify the most important unresolved item. Classify it as:

- **Product decision**: requires a product choice -> `grilling` (and `domain-modeling` when object relationships or terminology are material);
- **External evidence**: requires current primary-source evidence or industry practice -> `research`;
- **Design validation**: requires observable interaction, layout, or state behaviour -> `prototype`;
- **Technical validation**: requires a minimal experiment -> `technical-spike`;
- **Implementation detail**: does not change the product contract -> do not block `to-spec`;
- **Out of scope**: record the boundary -> exclude it from this specification.

Choose exactly one next skill for the current blocker. Do not run every discovery skill by default.

## Check deferred-scope coverage

Before declaring the bounded target ready, inspect its canonical decision and directly material dependencies for limiting or deferred language. Read [references/deferred-scope-protocol.md](references/deferred-scope-protocol.md) and require every material source phrase to be classified.

- An in-scope `DEFERRED_PRODUCT` without a canonical owner and resume gate is a product blocker.
- `NEEDS_CLASSIFICATION` is always blocking.
- `EXCLUSION_ONLY` creates no later task.
- Prototype, specification, implementation, production, and technical-validation items remain separate dimensions and do not become product questions merely because they are unfinished.
- A resolved tracker ticket is not evidence that its deferred clauses were routed.

For a corpus-completeness audit, use `scripts/audit-deferred-scopes.mjs` to generate stable source IDs and compare them with the dedicated audit ledger. The audit may be complete only when every detected source ID is classified or explicitly accepted as a documented false positive.

Treat deferred coverage as fresh only when it was checked against the current canonical source content and the declared scan roots. Any later edit that adds, changes, resolves, or replaces deferred language makes the prior `COMPLETE` claim stale until the incremental ledger synchronization and configured strict scan are rerun. Do not trust a historical count, resolved audit ticket, or old scanner hash by itself.

Before accepting a recently resolved decision ticket, verify that its final confirmed answer passed the ticket-local deferred gate and that existing deferred items answered by it were updated to `RESOLVED_LATER` or `SUPERSEDED`. If the ledger is missing new source IDs, still carries stale unresolved items, or has not been rerun over the configured full scope, return `NOT_READY` and route to `wayfinder` for governance repair rather than reopening unrelated product decisions.

## Preserve the return path

Before invoking a bounded detour, record the originating workflow, exact unresolved question, resume target, and evidence needed. Respect the invoked skill's own completion contract instead of copying or redefining it here.

When the detour returns, consume its result, update or route back to the canonical product decision, and reassess the same review target. Producing an artifact does not automatically authorize the next workflow.

## Apply the readiness gate

When first assessing the target, or after a detour returns, read [references/readiness-checks.md](references/readiness-checks.md). Use only the checks relevant to the target.

- If a blocking product question remains, return `NOT_READY` and route to one skill.
- If deferred-scope coverage is incomplete, return `NOT_READY` and route to `wayfinder` for governance repair.
- If a material validation need lacks evidence, return `NOT_READY` and route to one skill.
- If current sources contradict one another, return `NOT_READY`; do not choose a preferred source.
- If all material product decisions and evidence are sufficient for the bounded specification, return `READY_FOR_TO_SPEC`.

Do not require implementation contracts, repository sequencing, test accounts, release evidence, observability infrastructure, or rollback commands at this stage.

## Persist a readiness receipt

Before returning `READY_FOR_TO_SPEC`, persist one immutable readiness receipt scoped to the exact bounded target. It is workflow evidence, not a product decision and not implementation authority.

Choose the first available location:

1. the originating configured-tracker work item, as a clearly labelled workflow receipt or attachment;
2. the repository-declared workflow-evidence location;
3. `.scratch/product-readiness/<target-slug>/<receipt-id>.md`.

Do not overwrite an older receipt. A later assessment creates a new receipt and may name the earlier receipt it supersedes. An issue comment is timeline evidence only; canonical product sources remain authoritative.

For a new machine-verifiable receipt, read [references/readiness-receipt-automation.md](references/readiness-receipt-automation.md), create it with `scripts/readiness-receipt.mjs create`, then immediately run `scripts/readiness-receipt.mjs verify`. The script hashes only the declared complete files or bounded heading sections and refuses to overwrite a receipt. It verifies source identity freshness; it does not decide whether the selected sources, product boundary, prototype evidence, or verdict are substantively correct.

Use this shape:

```markdown
# Product Readiness Receipt

- Receipt ID: <stable unique ID>
- Target: <exact feature, workflow, or bounded subsystem>
- Specification boundary: <exact admitted scope>
- Assessed at: <timestamp>
- Verdict: READY_FOR_TO_SPEC
- Supersedes: <receipt ID or None>

## Canonical source identities
| Source | Exact relevant anchor | Revision or content identity |
| --- | --- | --- |
| <canonical source link> | <section, decision ID, or exact anchor> | <revision, immutable link, or bounded content hash> |

## Prototype identities
| Manifest | Full prototype reference | Immutable artifact ref | Fixture ref | Admitted IDs |
| --- | --- | --- | --- | --- |
| <manifest link> | <configured full prototype reference> | <artifact> | <fixture> | <journey/branch/state/interaction IDs> |

## Composition identity
<exact composed identity and source identity set, or Not applicable>

## Explicit boundaries
<out-of-scope, deferred, and deliberately unvalidated behaviour>

## Remaining non-blocking items
<owner and boundary, or None>
```

Record identities only for the material sections and evidence consumed by this readiness decision. Do not hash an entire large document when unrelated edits should not invalidate the receipt, and do not copy product rules into the receipt.

A receipt is stale when its target or boundary differs, a recorded canonical decision or relevant anchored content changes, a prototype version/artifact/fixture/admitted-ID identity changes, the composed source set changes, or recorded sources conflict. A stale receipt remains historical evidence but cannot authorize `to-spec`. Re-run this skill against the changed sources; do not automatically reopen unchanged product decisions.

If no receipt can be persisted, return `NOT_READY` with receipt persistence as the workflow blocker. Do not reopen product discovery or claim cross-session readiness merely because the substantive checks passed.

## Output

Keep the response short and use plain language:

```text
Review target:
Specification boundary:
Canonical sources:
Current blocker:
Deferred coverage: COMPLETE | PARTIAL | NOT_APPLICABLE
Next required skill:
Verdict: READY_FOR_TO_SPEC | NOT_READY
Readiness receipt: <persisted link or `None`>
Reason:
```

When the verdict is `NOT_READY`, recommend exactly one next step. When it is `READY_FOR_TO_SPEC`, include the persisted receipt link and determine whether the bounded target persists operational business state. If it does, offer `data-design` as the next stage and pass the exact receipt; if it does not, offer `to-spec`. Do not invoke either stage silently, and do not let Product Readiness invent the data contract.

Do not infer the user's preferred answer from tone or phrasing. Product decisions belong to the user; discoverable facts belong to evidence.
