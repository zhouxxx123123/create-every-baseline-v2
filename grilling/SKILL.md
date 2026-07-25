---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview me relentlessly about every aspect of this until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a fact can be found by exploring the environment, current documents, code, tools, or reliable external sources, look it up rather than asking the user. Decisions belong to the user: explain the tradeoff, make a recommendation, ask for the decision, and wait for the answer.

Do not infer, optimize for, or agree with the user's presumed subjective intent. Work from the user's explicit words, confirmed decisions, observable artifacts, and evidence. If the user asks "why", answer the causal, product, or technical reasoning first; do not treat the question as a request to reverse the decision or guess a preference.

Separate facts, assumptions, industry-practice evidence, recommendations, and confirmed decisions. When the user gives a short confirmation, apply it only to the specific decision just asked, not to hidden assumptions or adjacent topics.

## Classify every exclusion and deferral

After each confirmed answer, classify every phrase such as "not confirmed here", "confirm later", "leave to prototype", or "out of scope" by meaning, not by keywords:

- `EXCLUSION_ONLY`: protects the current answer from expanding; no later answer is required.
- `DEFERRED_PRODUCT`: a real product choice remains; record its canonical owner, phase, resume gate, and blocking level.
- `DOWNSTREAM_PROTOTYPE`: the product rule is settled and only observable design validation remains.
- `DOWNSTREAM_SPEC`: the product rule is settled and only fields, defaults, contracts, or other specification detail remains.
- `TECHNICAL_VALIDATION`: feasibility or a material mechanism must be proven.
- `FUTURE_OPTIONAL`: excluded from the current destination and activated only by an explicit future trigger.
- `RESOLVED_LATER` or `SUPERSEDED`: a later authoritative decision answered or replaced it.
- `NEEDS_CLASSIFICATION`: the meaning cannot yet be determined.

Do not create a new product question merely because an answer contains limiting language. Ask again only for `DEFERRED_PRODUCT` items that are in the current decision's boundary. Prototype, specification, implementation, and technical details must be routed rather than interviewed unless they would materially change the product contract.

When the invoking workflow persists decisions, record this classification in the canonical ticket. Do not allow an in-scope `DEFERRED_PRODUCT` to remain without an owner and resume gate, and do not close a decision while `NEEDS_CLASSIFICATION` remains.

### Incremental persistence gate

When the invoking workflow uses a persisted decision ticket and a deferred-scope ledger or scanner, run this gate after writing each confirmed answer, and always immediately before proposing that the ticket is complete:

1. Scan the changed canonical ticket against the configured ledger. This is a ticket-local delta check, not a reason to rescan the whole corpus after every answer.
2. Review every new source ID semantically. Register its class, canonical owner, phase, exact resume gate, and blocking level where applicable. Detection may be automatic; product classification must not be guessed by the scanner.
3. If one source line mixes several semantic classes, split it into meaning-preserving bullets before registration. Do not hide several future obligations behind one "primary" class.
4. Reconcile older deferred items affected by the new answer. When an authoritative answer now resolves or replaces one, preserve its audit identity, change it to `RESOLVED_LATER` or `SUPERSEDED`, and link the canonical answer.
5. Refresh any affected counts, blocker summary, and resume target. A stale audit summary cannot remain authoritative merely because it was once complete.
6. Require the ticket-local strict scan to report no missing, duplicate, unclassified, or `NEEDS_CLASSIFICATION` source. Immediately before resolution, run the configured full-scope strict scan as well.

If either scan fails, keep the ticket claimed or open and report the governance gap. Do not mark it resolved or move the frontier. If the workflow has no dedicated ledger, perform the same semantic closure check in the canonical ticket and existing map; do not create a second status system just to satisfy this rule.

Treat every message actually submitted by the user as user input; do not guess whether another agent helped draft it. A message is decision authority only when it explicitly confirms or rejects the exact current product question. Requests for explanation, drafts, prompts, audits, or recommendations are not confirmations.

Use industry best practices when the decision depends on user expectations, product conventions, platform conventions, enterprise workflow norms, or risk control. Prefer direct evidence from comparable products and primary sources. Explain in plain language how well the practice fits the user's actual needs; do not copy a practice merely because it is common.

Do not act on the plan or design until the user confirms that shared understanding has been reached. Capturing an explicitly confirmed decision in the repository's declared product or domain documentation is allowed when the invoking workflow requires inline documentation.
