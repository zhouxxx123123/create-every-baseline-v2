# Deferred Scope Protocol

Use this protocol when a confirmed answer, decision ticket, or baseline contains limiting language such as "not confirmed here", "confirm later", "leave to prototype", or "out of scope". Classify by meaning, not by keyword.

| Class | Meaning | Required handling |
| --- | --- | --- |
| `EXCLUSION_ONLY` | Protects the current answer from adjacent assumptions; no later answer is required. | Record the boundary only. |
| `DEFERRED_PRODUCT` | A user-visible product choice remains unresolved. | Record one canonical owner, phase, resume gate, and blocking level. |
| `DOWNSTREAM_PROTOTYPE` | Product behaviour is settled; observable design validation remains. | Link the prototype validation owner and exact question. |
| `DOWNSTREAM_SPEC` | Product behaviour is settled; fields, defaults, contracts, or detailed rules remain. | Link the specification owner and stop conditions. |
| `TECHNICAL_VALIDATION` | Feasibility or a material mechanism must be proven. | Link a bounded Technical Spike and return target. |
| `FUTURE_OPTIONAL` | Explicitly outside the current destination and activated only by a future trigger. | Record the trigger and phase; do not block the current destination. |
| `RESOLVED_LATER` | A later authoritative decision answered the earlier deferral. | Link the canonical answer and preserve the source trace. |
| `SUPERSEDED` | A later authoritative decision replaced the old rule. | Link the covering decision and retain audit history. |
| `NEEDS_CLASSIFICATION` | Evidence is insufficient to determine the class. | Block closure until reviewed. |
| `FALSE_POSITIVE` | The scanner matched quoted, historical, or non-deferred text. | Record the reason so the source is not silently omitted. |

## Decision test

Use this order:

1. Does the phrase merely limit the current answer? Use `EXCLUSION_ONLY`.
2. Would different answers change user-visible behaviour, objects, lifecycle, permissions, ownership, routing, or safety? Use `DEFERRED_PRODUCT`.
3. Is the behaviour already settled and only its presentation being tested? Use `DOWNSTREAM_PROTOTYPE`.
4. Is the behaviour settled and only formal detail needed to implement it? Use `DOWNSTREAM_SPEC`.
5. Is feasibility uncertain? Use `TECHNICAL_VALIDATION`.
6. Is it intentionally outside the current destination? Use `FUTURE_OPTIONAL`.
7. Did a later decision answer or replace it? Use `RESOLVED_LATER` or `SUPERSEDED`.
8. If none can be established from authority, use `NEEDS_CLASSIFICATION`.

Do not infer confirmation from tracker status, prototypes, research, code, or audit counts. Do not infer who drafted a user message. Only an explicit answer to the exact current product question is decision authority.

## Source granularity

One registered source statement should express one semantic obligation. If a sentence or bullet combines product questions, prototype details, specification details, technical validation, and future scope, split it into meaning-preserving bullets before generating or registering source IDs. Do not assign one broad class to a mixed line and silently lose the remaining obligations.

Automatic scanning can detect candidate language and enforce coverage. It cannot safely determine product meaning, authority, owner, phase, or blocker. Those remain evidence-based semantic judgments.

## Coverage record

For a corpus audit, include each source ID emitted by the audit script in the ledger:

```markdown
<!-- deferred-source: DS-0123456789ab; class: DEFERRED_PRODUCT; owner: <canonical link>; phase: V1; gate: <resume condition>; blocker: <level> -->
```

Document false positives explicitly rather than silently omitting them:

```markdown
<!-- deferred-source: DS-0123456789ab; class: FALSE_POSITIVE; reason: quoted historical text -->
```

The ledger is complete only when every emitted ID appears exactly once.

## Incremental synchronization

Use this sequence whenever a persisted decision gains a confirmed answer:

1. Save the confirmed answer in the canonical decision.
2. Scan the changed decision against the canonical ledger.
3. Classify and register each new source ID.
4. Reconcile older semantic items affected by the answer. Preserve their audit identity, mark them `RESOLVED_LATER` or `SUPERSEDED`, and link the authoritative answer.
5. Refresh classification totals, blocker summaries, deferred queues, and resume targets.
6. Run a strict scan of the changed decision.
7. Immediately before tracker resolution or readiness, run the configured full-scope strict scan.

Missing IDs, duplicate IDs, records without a class, and `NEEDS_CLASSIFICATION` block closure. If no dedicated corpus ledger exists, apply the same semantic checks in the canonical ticket and current map rather than creating an overlapping ledger.

## Coverage freshness

`COMPLETE` is valid only for the declared scan roots and their exact current content. Adding or changing deferred language invalidates the previous claim until synchronization and strict scanning pass again. A resolved audit ticket may receive ledger-only governance updates without pretending its original product question was reopened.
