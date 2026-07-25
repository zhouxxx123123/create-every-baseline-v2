# Ticket Plan Schema

Use this schema to materialize an approved ticket plan before publishing it. Keep the plan in disposable workflow storage unless the configured tracker requires a durable copy. Do not modify the source specification to add generated IDs.

## Contents

1. Root object
2. Requirements and stories
3. Tickets
4. Shared capabilities
5. Evidence
6. Existing-ticket reconciliation
7. Validation and output

## Root object

Represent the plan as UTF-8 JSON:

```json
{
  "plan_id": "catalog-search-v1",
  "tracker": {
    "kind": "local",
    "ready_semantics": "configured by the repository"
  },
  "evidence_policy": "AVAILABLE",
  "source_stories": [],
  "requirements": [],
  "tickets": [],
  "capabilities": [],
  "external_validated_capabilities": [],
  "evidence_units": [],
  "existing_ticket_reconciliation": [],
  "completed_ticket_ids": [],
  "primary_requirement_owners": {},
  "final_integration_ticket_id": null,
  "composition_required_source_refs": [],
  "composition_integration_evidence_ids": [],
  "wide_refactor": null
}
```

Use `evidence_policy: "NONE"` when no reviewed prototype or design evidence exists. Use `AVAILABLE` when immutable reviewed evidence exists and user-visible tickets must carry it.

Treat `tracker.kind` and `tracker.ready_semantics` as repository configuration. Do not infer label meaning from this schema.

## Requirements And Stories

Declare stable source story IDs when they exist. Give every source story a non-empty exact `source_anchor`. When the source has no stable requirement ID, allocate deterministic plan-local IDs such as `R-001`, preserve `source_anchor`, and leave the source unchanged.

```json
{
  "source_stories": [
    {
      "id": "STORY-001",
      "source_anchor": "approved-plan#search"
    }
  ],
  "requirements": [
    {
      "id": "REQ-001",
      "source_anchor": "approved-plan#search-results",
      "source_story_ids": ["STORY-001"],
      "product_area": "catalog",
      "handoff": "query input to durable result display",
      "required_capability_ids": ["CAP-QUERY"],
      "required_evidence_ids": ["EVIDENCE-RESULTS"],
      "required_delivery_ticket_ids": [],
      "validation_status": "CONFIRMED_AND_VALIDATED",
      "assumptions": [],
      "stop_conditions": [],
      "crosses_subflows": false,
      "requires_final_integration": false
    }
  ]
}
```

Use `required_capability_ids` for every production prerequisite needed to observe the result, including a shell, client surface, API operation, durable state, permission boundary, provider, event contract, or audit writer. Use `required_delivery_ticket_ids` only when a named ticket is itself a required observable prerequisite that cannot be expressed as a shared capability.

Use `crosses_subflows` to record that a requirement spans more than one local flow. It does not force final-ticket ownership: an ordinary vertical ticket may own it when its complete blocker closure provides every required capability, delivery ticket, and production evidence owner.

Set `requires_final_integration` only when the requirement can be accepted exclusively through the complete integrated workflow. Only this field forces primary ownership by the final integration ticket.

## Tickets

Declare one object per approved ticket:

```json
{
  "id": "T01",
  "title": "Return a searchable catalog result",
  "blocked_by": [],
  "primary_requirement_ids": ["REQ-001"],
  "supporting_requirement_ids": [],
  "exact_source_story_ids": ["STORY-001"],
  "supporting_story_ids": [],
  "capabilities_owned": ["CAP-QUERY"],
  "capabilities_consumed": [],
  "evidence_ids_owned": ["EVIDENCE-RESULTS"],
  "evidence_ids_consumed": [],
  "downstream_integration_evidence_ids": [],
  "user_visible": true,
  "delivery_ticket": true,
  "final_integration": false,
  "bounded_validation_ticket": false,
  "composition_ticket": false,
  "evidence_bindings": [],
  "evidence": {
    "manifest": "evidence/catalog-manifest.md",
    "reference": "catalog-results@version-001",
    "artifact_ref": "evidence/catalog-results.zip",
    "artifact_digest": "sha256:<64 lowercase hex characters>",
    "fixture_ref": "evidence/catalog-results.fixture.json",
    "fixture_digest": "sha256:<64 lowercase hex characters>"
  },
  "composition": null,
  "out_of_scope": [],
  "tracker_payload": {}
}
```

Compute `exact_source_story_ids` as the set union of `source_story_ids` for all primary requirements owned by the ticket. Keep supporting stories separate.

Use `evidence_ids_owned` for evidence delivered by this ticket. Use `evidence_ids_consumed` for production evidence delivered by a blocker. Use `downstream_integration_evidence_ids` for integration evidence delivered later by the final ticket; never add a reverse blocker for it.

Set `delivery_ticket` for every in-scope delivery ticket that must directly block final integration. The validator also derives delivery responsibility from primary or supporting requirements, internally owned capabilities, owned production evidence, user-visible behavior, bounded validation, and composition responsibility, so `delivery_ticket: false` cannot hide actual delivery work. Set `bounded_validation_ticket` only when the ticket intentionally validates a not-yet-production-authorized decision.

A composed workflow or a plan with multiple derived delivery tickets requires exactly one `final_integration` ticket named by `final_integration_ticket_id`. It must be directly blocked by every derived delivery ticket. A single-delivery plan may omit it. The final ticket cannot re-own source evidence already assigned to delivery tickets.

For an expand-contract wide refactor that intentionally has no final integration ticket, declare and validate the established sequence:

```json
{
  "wide_refactor": {
    "expand_ticket_id": "W01",
    "migrate_ticket_ids": ["W02", "W03"],
    "contract_ticket_id": "W04"
  }
}
```

Each migrate ticket must be directly blocked by the expand ticket. The contract ticket must be directly blocked by the expand ticket and every migrate ticket. These participants must equal the plan's derived delivery-ticket set.

## Shared Capabilities

Declare every capability consumed by more than one ticket, plus any capability required to prove a requirement closure:

```json
{
  "id": "CAP-QUERY",
  "implementation_owner": "T01",
  "consumers": ["T02"],
  "source_of_truth_owner": "catalog service",
  "result_writeback": "search result projection",
  "availability_point": "T01 complete",
  "validation_status": "CONFIRMED_AND_VALIDATED",
  "external": false,
  "evidence_ref": "approved-plan#query-contract"
}
```

For an external validated capability, omit it from `capabilities` and declare:

```json
{
  "id": "CAP-EXTERNAL-NOTIFY",
  "validation_status": "VALIDATED",
  "evidence_ref": "external-acceptance-record#notify"
}
```

Require each consumer either to own the capability, depend on its owner through blocker closure, or cite a validated external capability with precise evidence.

## Evidence

Declare one unit per stable journey, branch, state, interaction, design token set, or integration evidence unit:

```json
{
  "id": "EVIDENCE-RESULTS",
  "delivery_owner": "T01",
  "kind": "source",
  "production_required": true,
  "downstream_integration": false,
  "manifest": "evidence/catalog-manifest.md",
  "reference": "catalog-results@version-001",
  "artifact_ref": "evidence/catalog-results.zip",
  "artifact_digest": "sha256:<64 lowercase hex characters>",
  "fixture_ref": "evidence/catalog-results.fixture.json",
  "fixture_digest": "sha256:<64 lowercase hex characters>"
}
```

Assign every evidence ID to exactly one delivery owner. Keep requirement primary ownership separate from evidence delivery ownership.

Bind each ticket's owned and consumed production evidence IDs to immutable identities. For a single identity, the legacy ticket-level `evidence` object remains valid and applies to all declared production evidence IDs only when all of those evidence units have exactly that identity. For one or more explicit identity groups, use `evidence_bindings`:

```json
{
  "evidence_bindings": [
    {
      "evidence_ids": ["EVIDENCE-RESULTS", "EVIDENCE-EMPTY-STATE"],
      "manifest": "evidence/catalog-manifest.md",
      "reference": "catalog-results@version-001",
      "artifact_ref": "evidence/catalog-results.zip",
      "artifact_digest": "sha256:<64 lowercase hex characters>",
      "fixture_ref": "evidence/catalog-results.fixture.json",
      "fixture_digest": "sha256:<64 lowercase hex characters>"
    }
  ]
}
```

Every owned or consumed production evidence ID must appear in exactly one group and that group's six immutable identity fields must exactly equal the corresponding `evidence_unit`. IDs that share one immutable identity may share one group; do not repeat the identity for every state. A ticket carrying multiple identities must carry one complete group per identity.

For a composition ticket, provide a complete `composition` object:

```json
{
  "identity": "composed-workflow@version-001",
  "manifest": "evidence/composed-manifest.md",
  "artifact_ref": "evidence/composed.zip",
  "artifact_digest": "sha256:<64 lowercase hex characters>",
  "fixture_ref": "evidence/composed.fixture.json",
  "fixture_digest": "sha256:<64 lowercase hex characters>",
  "integration_ids": ["EVIDENCE-INTEGRATION-001"],
  "sources": [
    {
      "manifest": "evidence/catalog-manifest.md",
      "reference": "catalog-results@version-001",
      "artifact_ref": "evidence/catalog-results.zip",
      "artifact_digest": "sha256:<64 lowercase hex characters>",
      "fixture_ref": "evidence/catalog-results.fixture.json",
      "fixture_digest": "sha256:<64 lowercase hex characters>",
      "source_ids": ["EVIDENCE-RESULTS"],
      "delivery_owners": {
        "EVIDENCE-RESULTS": "T01"
      }
    }
  ]
}
```

List every expected source reference in root `composition_required_source_refs`. List every integration evidence ID in root `composition_integration_evidence_ids`.

Each composition `source_ids` entry must be bound to the exact source identity declared by its `evidence_unit`, and each source ID must appear in exactly one source identity group.

Never use indirect evidence text such as `same as another ticket`, `see parent spec`, `pinned elsewhere`, or `repeated in owning issue` in place of immutable identity fields.

## Existing-Ticket Reconciliation

Classify possible overlaps before publishing:

```json
{
  "ticket_ref": "tracker-item-reference",
  "classification": "PARTIAL HANDOFF",
  "resolution_status": "RESOLVED",
  "affected_ticket_ids": ["T02"],
  "planned_action": "record the approved handoff before readiness"
}
```

Use only `REUSE`, `EXTERNAL DEPENDENCY`, `SUPERSEDE`, `PARTIAL HANDOFF`, `CONFLICT`, or `HISTORICAL ONLY`. Keep a conflict out of the frontier until the approved reconciliation is complete.

Require a non-empty `ticket_ref`, at least one `affected_ticket_ids` entry that names a current plan ticket, a non-empty `planned_action`, and an explicit non-empty `resolution_status`. An unresolved `CONFLICT` blocks publication and readiness. Validator success proves only that the reconciliation record is structurally complete; obtain and verify user authorization in the Skill workflow before changing any existing tracker item.

## Validation And Output

Resolve the directory containing the currently invoked `to-tickets/SKILL.md`, preserve the project working directory, and run:

```text
python "<resolved-to-tickets-skill-dir>/scripts/validate_ticket_plan.py" <plan.json> --format both
```

Use `--json-out <path>` when another check needs a standalone machine-readable result. Treat exit code `0` as PASS, `1` as a plan-quality failure, and `2` as invalid input or tool failure.

Read the human summary and machine JSON. Fix the plan, not the source specification, when ownership or dependencies are wrong. Return to the configured Workflow Authority when the source lacks a material product or technical decision.
