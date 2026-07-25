---
name: pre-prd-hardening
description: Harden product context before the final Product Readiness gate for new projects, large features, multi-client products, or ambiguous requirements. Use for context freeze, uncertainty splitting, and identifying decisions, research, prototype work, or technical spikes still needed before specification.
---

# Pre-PRD Hardening

Use this skill after `/grill-with-docs`, `/wayfinder`, `/research`, `/prototype`, or accepted spike work has clarified the context, and before `product-readiness`.

Do not use this as the opening interview. Use `/skill-router`, `/grill-with-docs`, or `/wayfinder` first when the idea is still foggy.

The goal is to prevent unclear context, unverified technical assumptions, and hidden scope gaps from becoming PRD/spec commitments. Do not write the PRD/spec, create issues, triage issues, or implement code during this workflow unless the user explicitly asks after the readiness verdict.

## Inputs to read

Use the conversation first. If a repo exists, inspect lightweight project guidance before answering:

- `AGENTS.md` or `CLAUDE.md`
- `CONTEXT.md` or `CONTEXT-MAP.md`
- relevant `docs/agents/*.md`
- relevant `docs/adr/*.md`
- relevant existing PRDs, specs, prototypes, interface notes, or product docs
- accepted spikes under `docs/spikes/`, if the repo defines a spike workflow

If a question can be answered from local docs or code, inspect them instead of asking the user.

## Output shape

Produce one concise report with these four sections.

### 1. Context Freeze

Restate the current understanding without expanding scope:

- product goal in 5-10 bullets;
- user roles and actors;
- clients, platforms, repos, or surfaces in scope;
- first-version scope;
- explicit non-goals;
- core domain objects and vocabulary;
- main user journeys;
- external systems, APIs, data sources, prototypes, or legacy systems;
- facts that are confirmed vs inferred;
- questions that must not be guessed.

Call out contradictions or overloaded terms. If the repo has `CONTEXT.md`, use its vocabulary and flag conflicts with avoided terms.

### 2. Uncertainty Split

Classify every unresolved item into one of these buckets:

- **Product decision**: the user can answer it; ask or mark as pending.
- **Technical assumption**: needs evidence before PRD/spec; route to spike.
- **Implementation detail**: can be decided during `/to-issues`, `/to-tickets`, or `/tdd`; do not block PRD/spec.
- **Out of scope**: explicitly exclude from this PRD/spec.

For each technical assumption, state why it matters and what would break if it is false.

### 3. Spike Candidates

For each technical assumption that could change architecture, API contracts, issue breakdown, release feasibility, privacy, security, native capability, performance, AI quality, or deployment readiness, recommend a spike.

Each candidate must include:

- spike title;
- primary question;
- hypothesis;
- smallest useful experiment;
- required inputs or environment;
- success criteria;
- failure fallback;
- expected artifact path, usually `docs/spikes/<kebab-name>-spike.md`;
- how the result affects `CONTEXT.md`, `docs/adr/`, PRD/spec, issues/tickets, and TDD.

If the installed `create-technical-spike` skill is available, recommend using it for the spike documents. Do not run the spike unless the user asks.

### 4. Product Readiness Handoff

Give one context-hardening verdict:

- **`READY_FOR_PRODUCT_READINESS`**: context is sufficiently stable for the final Product Readiness gate.
- **`NEEDS_USER_DECISIONS`**: list the minimum product questions.
- **`NEEDS_SPIKE`**: list blocking spike candidates.
- **`NEEDS_MORE_GRILLING`**: list unclear product decisions and suggest `/grill-me` or `/grill-with-docs`.

These verdicts do not authorize `to-prd` or `to-spec`. Only `product-readiness` may return `READY_FOR_TO_SPEC` after checking the current bounded target, canonical sources, reviewed prototype evidence, and cross-functional linkage and persisting its scoped readiness receipt.

For `READY_FOR_PRODUCT_READINESS`, provide the exact next prompt the user should send, for example:

```text
Use product-readiness for <bounded target>.
Use the Context Freeze, accepted evidence, prototypes, ADRs, and unresolved boundaries from this report. Do not widen the target or introduce assumptions.
```

## Rules

- Do not turn guesses into requirements.
- Do not write a PRD/spec until `product-readiness` returns `READY_FOR_TO_SPEC` for the exact bounded target.
- Do not create issues/tickets until a PRD/spec or equivalent accepted plan exists.
- Do not use spike as a dumping ground for normal product decisions.
- Do not put technical implementation conclusions into `CONTEXT.md`; put durable decisions in ADRs and evidence in spikes.
- Prefer short, direct questions over broad "tell me more" prompts.
- If the user is confused, explain the next step in plain language before giving templates.
