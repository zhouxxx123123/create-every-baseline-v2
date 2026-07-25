#!/usr/bin/env python3
"""Deterministically validate a tracker-independent to-tickets plan."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict, deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable


SEVERITY_ORDER = {"P1": 0, "P2": 1, "P3": 2}
ALLOWED_RECONCILIATIONS = {
    "REUSE",
    "EXTERNAL DEPENDENCY",
    "SUPERSEDE",
    "PARTIAL HANDOFF",
    "CONFLICT",
    "HISTORICAL ONLY",
}
VALIDATED_STATUSES = {"CONFIRMED_AND_VALIDATED", "VALIDATED"}
EVIDENCE_FIELDS = (
    "manifest",
    "reference",
    "artifact_ref",
    "artifact_digest",
    "fixture_ref",
    "fixture_digest",
)
INDIRECT_EVIDENCE_PATTERNS = (
    re.compile(r"\bsame as\b", re.IGNORECASE),
    re.compile(r"\bsee (?:the )?(?:parent|ticket|issue|#)", re.IGNORECASE),
    re.compile(r"\bpinned (?:by|in|elsewhere)\b", re.IGNORECASE),
    re.compile(r"\b(?:repeated in )?(?:the )?owning (?:ticket|issue)\b", re.IGNORECASE),
)


@dataclass(frozen=True)
class Finding:
    code: str
    severity: str
    message: str
    ticket_id: str | None = None
    requirement_id: str | None = None
    story_id: str | None = None
    capability_id: str | None = None
    evidence_id: str | None = None
    dependency_path: list[str] | None = None


def _items(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _ids(items: Iterable[dict[str, Any]]) -> list[str]:
    return [item.get("id", "") for item in items if isinstance(item, dict)]


def _duplicates(values: Iterable[str]) -> list[str]:
    return sorted(value for value, count in Counter(values).items() if value and count > 1)


def _missing_fields(value: Any, fields: Iterable[str]) -> list[str]:
    if not isinstance(value, dict):
        return list(fields)
    return [field for field in fields if not isinstance(value.get(field), str) or not value[field].strip()]


def _valid_digest(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    digest = value.strip()
    if re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        return True
    return bool(re.fullmatch(r"[A-Za-z0-9_-]+:[0-9a-fA-F]{32,}", digest))


def _immutable_identity(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {field: value.get(field) for field in EVIDENCE_FIELDS}


def _identities_match(left: Any, right: Any) -> bool:
    return _immutable_identity(left) == _immutable_identity(right)


def _iter_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from _iter_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_strings(child)


def _shortest_blocker_path(
    start: str, target: str, blockers: dict[str, list[str]]
) -> list[str] | None:
    queue: deque[tuple[str, list[str]]] = deque([(start, [start])])
    seen = {start}
    while queue:
        current, path = queue.popleft()
        if current == target:
            return path
        for blocker in blockers.get(current, []):
            if blocker not in seen:
                seen.add(blocker)
                queue.append((blocker, [*path, blocker]))
    return None


def validate_plan(plan: dict[str, Any]) -> dict[str, Any]:
    findings: list[Finding] = []

    def add(
        code: str,
        severity: str,
        message: str,
        *,
        ticket_id: str | None = None,
        requirement_id: str | None = None,
        story_id: str | None = None,
        capability_id: str | None = None,
        evidence_id: str | None = None,
        dependency_path: list[str] | None = None,
    ) -> None:
        findings.append(
            Finding(
                code=code,
                severity=severity,
                message=message,
                ticket_id=ticket_id,
                requirement_id=requirement_id,
                story_id=story_id,
                capability_id=capability_id,
                evidence_id=evidence_id,
                dependency_path=dependency_path,
            )
        )

    if not isinstance(plan, dict):
        add("PLAN_NOT_OBJECT", "P1", "The plan root must be a JSON object.")
        return _result(plan, findings, [])

    requirements_raw = _items(plan.get("requirements"))
    stories_raw = _items(plan.get("source_stories"))
    tickets_raw = _items(plan.get("tickets"))
    capabilities_raw = _items(plan.get("capabilities"))
    external_caps_raw = _items(plan.get("external_validated_capabilities"))
    evidence_raw = _items(plan.get("evidence_units"))
    reconciliations = _items(plan.get("existing_ticket_reconciliation"))

    if not requirements_raw:
        add("NO_REQUIREMENTS", "P1", "The plan must contain at least one in-scope requirement.")
    if not tickets_raw:
        add("NO_TICKETS", "P1", "The plan must contain at least one ticket.")
    if plan.get("evidence_policy") not in {"NONE", "AVAILABLE"}:
        add("EVIDENCE_POLICY_INVALID", "P2", "evidence_policy must be NONE or AVAILABLE.")

    requirement_ids = _ids(requirements_raw)
    story_ids = _ids(stories_raw)
    ticket_ids = _ids(tickets_raw)
    capability_ids = _ids(capabilities_raw)
    external_cap_ids = _ids(external_caps_raw)
    evidence_ids = _ids(evidence_raw)

    for kind, values in (
        ("requirement", requirement_ids),
        ("story", story_ids),
        ("ticket", ticket_ids),
        ("capability", capability_ids),
        ("external capability", external_cap_ids),
        ("evidence", evidence_ids),
    ):
        for duplicate in _duplicates(values):
            add(
                f"DUPLICATE_{kind.upper().replace(' ', '_')}_ID",
                "P1",
                f"Duplicate {kind} ID: {duplicate}.",
            )

    requirements = {
        item["id"]: item
        for item in requirements_raw
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"]
    }
    stories = {
        item["id"]: item
        for item in stories_raw
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"]
    }
    tickets = {
        item["id"]: item
        for item in tickets_raw
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"]
    }
    capabilities = {
        item["id"]: item
        for item in capabilities_raw
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"]
    }
    external_caps = {
        item["id"]: item
        for item in external_caps_raw
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"]
    }
    evidence_units = {
        item["id"]: item
        for item in evidence_raw
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"]
    }

    for story_id, story in stories.items():
        if not isinstance(story.get("source_anchor"), str) or not story["source_anchor"].strip():
            add(
                "SOURCE_STORY_ANCHOR_MISSING",
                "P2",
                "Source story lacks a precise source anchor.",
                story_id=story_id,
            )

    if set(capabilities) & set(external_caps):
        for capability_id in sorted(set(capabilities) & set(external_caps)):
            add(
                "CAPABILITY_INTERNAL_EXTERNAL_CONFLICT",
                "P1",
                "A capability cannot be both internally owned and externally validated.",
                capability_id=capability_id,
            )

    blockers: dict[str, list[str]] = {}
    for ticket_id, ticket in tickets.items():
        declared = [value for value in _items(ticket.get("blocked_by")) if isinstance(value, str)]
        blockers[ticket_id] = declared
        for blocker in declared:
            if blocker == ticket_id:
                add(
                    "SELF_DEPENDENCY",
                    "P1",
                    "A ticket cannot block itself.",
                    ticket_id=ticket_id,
                    dependency_path=[ticket_id, ticket_id],
                )
            elif blocker not in tickets:
                add(
                    "UNKNOWN_BLOCKER",
                    "P1",
                    f"Unknown blocker: {blocker}.",
                    ticket_id=ticket_id,
                    dependency_path=[ticket_id, blocker],
                )

    cycle_keys: set[tuple[str, ...]] = set()
    state: dict[str, int] = {}

    def visit(ticket_id: str, path: list[str]) -> None:
        state[ticket_id] = 1
        for blocker in blockers.get(ticket_id, []):
            if blocker not in tickets:
                continue
            if state.get(blocker) == 1:
                start = path.index(blocker) if blocker in path else 0
                cycle = tuple([*path[start:], blocker])
                if cycle not in cycle_keys:
                    cycle_keys.add(cycle)
                    add(
                        "DEPENDENCY_CYCLE",
                        "P1",
                        "The blocker graph contains a cycle.",
                        ticket_id=ticket_id,
                        dependency_path=list(cycle),
                    )
            elif state.get(blocker, 0) == 0:
                visit(blocker, [*path, blocker])
        state[ticket_id] = 2

    for ticket_id in tickets:
        if state.get(ticket_id, 0) == 0:
            visit(ticket_id, [ticket_id])

    closure_cache: dict[str, set[str]] = {}

    def closure(ticket_id: str, active: set[str] | None = None) -> set[str]:
        if ticket_id in closure_cache:
            return set(closure_cache[ticket_id])
        active = set() if active is None else set(active)
        if ticket_id in active:
            return {ticket_id}
        active.add(ticket_id)
        result = {ticket_id}
        for blocker in blockers.get(ticket_id, []):
            if blocker in tickets:
                result.update(closure(blocker, active))
        closure_cache[ticket_id] = result
        return set(result)

    completed = {value for value in _items(plan.get("completed_ticket_ids")) if isinstance(value, str)}
    for ticket_id in sorted(completed - set(tickets)):
        add("UNKNOWN_COMPLETED_TICKET", "P2", f"Unknown completed ticket: {ticket_id}.")
    frontier = sorted(
        ticket_id
        for ticket_id in tickets
        if ticket_id not in completed and set(blockers.get(ticket_id, [])) <= completed
    )

    requirement_claims: dict[str, list[str]] = defaultdict(list)
    for ticket_id, ticket in tickets.items():
        for requirement_id in _items(ticket.get("primary_requirement_ids")):
            if requirement_id not in requirements:
                add(
                    "UNKNOWN_PRIMARY_REQUIREMENT",
                    "P1",
                    f"Unknown primary requirement: {requirement_id}.",
                    ticket_id=ticket_id,
                    requirement_id=str(requirement_id),
                )
            else:
                requirement_claims[requirement_id].append(ticket_id)
        for requirement_id in _items(ticket.get("supporting_requirement_ids")):
            if requirement_id not in requirements:
                add(
                    "UNKNOWN_SUPPORTING_REQUIREMENT",
                    "P2",
                    f"Unknown supporting requirement: {requirement_id}.",
                    ticket_id=ticket_id,
                    requirement_id=str(requirement_id),
                )

    primary_owners: dict[str, str] = {}
    for requirement_id in requirements:
        owners = requirement_claims.get(requirement_id, [])
        if len(owners) != 1:
            add(
                "REQUIREMENT_PRIMARY_OWNER_COUNT",
                "P1",
                f"Requirement must have exactly one primary owner; found {len(owners)}.",
                requirement_id=requirement_id,
            )
        else:
            primary_owners[requirement_id] = owners[0]

    declared_owner_map = plan.get("primary_requirement_owners")
    if isinstance(declared_owner_map, dict):
        normalized = {str(key): str(value) for key, value in declared_owner_map.items()}
        if normalized != primary_owners:
            add(
                "PRIMARY_OWNER_TABLE_MISMATCH",
                "P2",
                "primary_requirement_owners does not match ticket ownership claims.",
            )

    for requirement_id, requirement in requirements.items():
        if not isinstance(requirement.get("source_anchor"), str) or not requirement["source_anchor"].strip():
            add(
                "REQUIREMENT_SOURCE_ANCHOR_MISSING",
                "P2",
                "Requirement lacks a precise source anchor.",
                requirement_id=requirement_id,
            )
        for field in ("product_area", "handoff"):
            if not isinstance(requirement.get(field), str) or not requirement[field].strip():
                add(
                    "REQUIREMENT_CONTEXT_MISSING",
                    "P2",
                    f"Requirement lacks required context field: {field}.",
                    requirement_id=requirement_id,
                )
        for story_id in _items(requirement.get("source_story_ids")):
            if story_id not in stories:
                add(
                    "UNKNOWN_REQUIREMENT_STORY",
                    "P2",
                    f"Requirement references unknown story: {story_id}.",
                    requirement_id=requirement_id,
                )
        owner_id = primary_owners.get(requirement_id)
        if owner_id and requirement.get("validation_status") not in VALIDATED_STATUSES:
            if not bool(tickets[owner_id].get("bounded_validation_ticket")):
                add(
                    "UNVALIDATED_PRODUCTION_REQUIREMENT",
                    "P1",
                    "A production delivery ticket owns a requirement that is not validated.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                )

    for ticket_id, ticket in tickets.items():
        primary_ids = [value for value in _items(ticket.get("primary_requirement_ids")) if value in requirements]
        expected_stories = {
            story_id
            for requirement_id in primary_ids
            for story_id in _items(requirements[requirement_id].get("source_story_ids"))
        }
        exact_stories = {value for value in _items(ticket.get("exact_source_story_ids")) if isinstance(value, str)}
        supporting_stories = {
            value for value in _items(ticket.get("supporting_story_ids")) if isinstance(value, str)
        }
        if exact_stories != expected_stories:
            missing = sorted(expected_stories - exact_stories)
            extra = sorted(exact_stories - expected_stories)
            add(
                "EXACT_STORY_SET_MISMATCH",
                "P2",
                f"Exact stories differ from the primary-requirement union; missing={missing}, extra={extra}.",
                ticket_id=ticket_id,
            )
        overlap = sorted(exact_stories & supporting_stories)
        if overlap:
            add(
                "SUPPORTING_STORY_AS_EXACT",
                "P2",
                f"Stories cannot be both exact and supporting: {overlap}.",
                ticket_id=ticket_id,
            )
        for story_id in sorted((exact_stories | supporting_stories) - set(stories)):
            add(
                "UNKNOWN_TICKET_STORY",
                "P2",
                f"Ticket references unknown story: {story_id}.",
                ticket_id=ticket_id,
            )

    capability_claims: dict[str, list[str]] = defaultdict(list)
    for ticket_id, ticket in tickets.items():
        for capability_id in _items(ticket.get("capabilities_owned")):
            capability_claims[str(capability_id)].append(ticket_id)

    for capability_id, capability in capabilities.items():
        owner_id = capability.get("implementation_owner")
        if owner_id not in tickets:
            add(
                "CAPABILITY_OWNER_INVALID",
                "P1",
                f"Capability owner is not a plan ticket: {owner_id}.",
                capability_id=capability_id,
            )
        claims = capability_claims.get(capability_id, [])
        if claims != [owner_id]:
            add(
                "CAPABILITY_OWNER_CLAIM_MISMATCH",
                "P1",
                f"Capability must be owned only by {owner_id}; claims={claims}.",
                capability_id=capability_id,
            )
        if capability.get("validation_status") not in VALIDATED_STATUSES:
            add(
                "CAPABILITY_NOT_VALIDATED",
                "P1",
                "An in-scope shared capability is not validated for production use.",
                capability_id=capability_id,
            )
        for field in ("source_of_truth_owner", "result_writeback", "availability_point", "evidence_ref"):
            if not isinstance(capability.get(field), str) or not capability[field].strip():
                add(
                    "CAPABILITY_CONTEXT_MISSING",
                    "P2",
                    f"Capability lacks required context field: {field}.",
                    capability_id=capability_id,
                )
        declared_consumers = {
            value for value in _items(capability.get("consumers")) if isinstance(value, str)
        }
        actual_consumers = {
            ticket_id
            for ticket_id, ticket in tickets.items()
            if capability_id in _items(ticket.get("capabilities_consumed"))
        }
        if declared_consumers != actual_consumers:
            add(
                "CAPABILITY_CONSUMER_TABLE_MISMATCH",
                "P2",
                f"Capability consumers differ; declared={sorted(declared_consumers)}, actual={sorted(actual_consumers)}.",
                capability_id=capability_id,
            )

    for capability_id in sorted(set(capability_claims) - set(capabilities)):
        add(
            "UNKNOWN_OWNED_CAPABILITY",
            "P1",
            "A ticket claims an undeclared capability.",
            capability_id=capability_id,
        )

    for external_id, capability in external_caps.items():
        if capability.get("validation_status") not in VALIDATED_STATUSES or not isinstance(
            capability.get("evidence_ref"), str
        ) or not capability["evidence_ref"].strip():
            add(
                "EXTERNAL_CAPABILITY_NOT_VALIDATED",
                "P1",
                "External capability requires validated status and precise evidence.",
                capability_id=external_id,
            )

    for ticket_id, ticket in tickets.items():
        for capability_id in _items(ticket.get("capabilities_consumed")):
            if capability_id in external_caps:
                continue
            capability = capabilities.get(capability_id)
            if not capability:
                add(
                    "UNKNOWN_CONSUMED_CAPABILITY",
                    "P1",
                    "Ticket consumes an undeclared capability.",
                    ticket_id=ticket_id,
                    capability_id=str(capability_id),
                )
                continue
            owner_id = capability.get("implementation_owner")
            if owner_id not in closure(ticket_id):
                path = _shortest_blocker_path(ticket_id, str(owner_id), blockers)
                add(
                    "CAPABILITY_OWNER_OUTSIDE_BLOCKER_CLOSURE",
                    "P1",
                    f"Capability owner {owner_id} is not in the consumer blocker closure.",
                    ticket_id=ticket_id,
                    capability_id=str(capability_id),
                    dependency_path=path or [ticket_id, f"missing blocker to {owner_id}"],
                )

    for requirement_id, requirement in requirements.items():
        owner_id = primary_owners.get(requirement_id)
        if not owner_id:
            continue
        owner_ticket = tickets[owner_id]
        owner_closure = closure(owner_id)
        declared_caps = set(_items(owner_ticket.get("capabilities_owned"))) | set(
            _items(owner_ticket.get("capabilities_consumed"))
        )
        for capability_id in _items(requirement.get("required_capability_ids")):
            if capability_id not in declared_caps:
                add(
                    "REQUIREMENT_CAPABILITY_NOT_DECLARED_BY_OWNER",
                    "P1",
                    "Primary owner does not list a required capability as owned or consumed.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                    capability_id=str(capability_id),
                )
            if capability_id in external_caps:
                continue
            capability = capabilities.get(capability_id)
            if not capability:
                add(
                    "REQUIREMENT_CAPABILITY_UNKNOWN",
                    "P1",
                    "Requirement needs an undeclared capability.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                    capability_id=str(capability_id),
                )
            elif capability.get("implementation_owner") not in owner_closure:
                cap_owner = str(capability.get("implementation_owner"))
                add(
                    "REQUIREMENT_CAPABILITY_OUTSIDE_CLOSURE",
                    "P1",
                    "Primary owner cannot accept the requirement because a required capability is outside its blocker closure.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                    capability_id=str(capability_id),
                    dependency_path=[owner_id, f"missing blocker to {cap_owner}"],
                )
        for required_ticket_id in _items(requirement.get("required_delivery_ticket_ids")):
            if required_ticket_id not in tickets:
                add(
                    "REQUIREMENT_DELIVERY_TICKET_UNKNOWN",
                    "P1",
                    f"Requirement references unknown delivery ticket: {required_ticket_id}.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                )
            elif required_ticket_id not in owner_closure:
                add(
                    "REQUIREMENT_DELIVERY_OUTSIDE_CLOSURE",
                    "P1",
                    "Primary owner cannot observe a required delivery ticket through its blocker closure.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                    dependency_path=[owner_id, f"missing blocker to {required_ticket_id}"],
                )

    evidence_claims: dict[str, list[str]] = defaultdict(list)
    for ticket_id, ticket in tickets.items():
        for evidence_id in _items(ticket.get("evidence_ids_owned")):
            evidence_claims[str(evidence_id)].append(ticket_id)

    for evidence_id, evidence in evidence_units.items():
        owner_id = evidence.get("delivery_owner")
        if owner_id not in tickets:
            add(
                "EVIDENCE_OWNER_INVALID",
                "P1",
                f"Evidence owner is not a plan ticket: {owner_id}.",
                evidence_id=evidence_id,
            )
        claims = evidence_claims.get(evidence_id, [])
        if claims != [owner_id]:
            add(
                "EVIDENCE_OWNER_COUNT",
                "P1",
                f"Evidence must be owned only by {owner_id}; claims={claims}.",
                evidence_id=evidence_id,
            )
        if plan.get("evidence_policy") == "AVAILABLE":
            missing = _missing_fields(evidence, EVIDENCE_FIELDS)
            if missing or not _valid_digest(evidence.get("artifact_digest")) or not _valid_digest(
                evidence.get("fixture_digest")
            ):
                add(
                    "EVIDENCE_IDENTITY_INCOMPLETE",
                    "P1",
                    f"Evidence identity is incomplete or has an invalid digest; missing={missing}.",
                    evidence_id=evidence_id,
                )

    for evidence_id in sorted(set(evidence_claims) - set(evidence_units)):
        add(
            "UNKNOWN_OWNED_EVIDENCE",
            "P1",
            "A ticket claims undeclared evidence.",
            evidence_id=evidence_id,
        )

    final_id = plan.get("final_integration_ticket_id")
    for ticket_id, ticket in tickets.items():
        for evidence_id in _items(ticket.get("evidence_ids_consumed")):
            evidence = evidence_units.get(evidence_id)
            if not evidence:
                add(
                    "UNKNOWN_CONSUMED_EVIDENCE",
                    "P1",
                    "Ticket consumes undeclared evidence.",
                    ticket_id=ticket_id,
                    evidence_id=str(evidence_id),
                )
                continue
            if evidence.get("downstream_integration"):
                add(
                    "DOWNSTREAM_EVIDENCE_AS_PRODUCTION_DEPENDENCY",
                    "P1",
                    "Downstream integration evidence must not be a production dependency.",
                    ticket_id=ticket_id,
                    evidence_id=str(evidence_id),
                )
            elif evidence.get("production_required", True) and evidence.get("delivery_owner") not in closure(
                ticket_id
            ):
                evidence_owner = str(evidence.get("delivery_owner"))
                add(
                    "EVIDENCE_OWNER_OUTSIDE_BLOCKER_CLOSURE",
                    "P1",
                    "Production evidence owner is outside the consumer blocker closure.",
                    ticket_id=ticket_id,
                    evidence_id=str(evidence_id),
                    dependency_path=[ticket_id, f"missing blocker to {evidence_owner}"],
                )
        for evidence_id in _items(ticket.get("downstream_integration_evidence_ids")):
            evidence = evidence_units.get(evidence_id)
            if not evidence or not evidence.get("downstream_integration"):
                add(
                    "INVALID_DOWNSTREAM_INTEGRATION_EVIDENCE",
                    "P1",
                    "Downstream evidence must reference a declared downstream integration unit.",
                    ticket_id=ticket_id,
                    evidence_id=str(evidence_id),
                )
            elif final_id and evidence.get("delivery_owner") != final_id:
                add(
                    "DOWNSTREAM_EVIDENCE_OWNER_NOT_FINAL",
                    "P1",
                    "Downstream integration evidence must be delivered by the final integration ticket.",
                    ticket_id=ticket_id,
                    evidence_id=str(evidence_id),
                )

        declared_evidence_ids = {
            value
            for key in ("evidence_ids_owned", "evidence_ids_consumed")
            for value in _items(ticket.get(key))
            if isinstance(value, str)
        }
        production_evidence_ids = {
            evidence_id
            for evidence_id in declared_evidence_ids
            if evidence_id in evidence_units
            and evidence_units[evidence_id].get("production_required", True)
            and not evidence_units[evidence_id].get("downstream_integration")
        }

        explicit_bindings = ticket.get("evidence_bindings")
        if isinstance(explicit_bindings, list) and explicit_bindings:
            bindings = explicit_bindings
            legacy_binding = False
        elif isinstance(ticket.get("evidence"), dict):
            bindings = [
                {
                    **ticket["evidence"],
                    "evidence_ids": sorted(production_evidence_ids),
                }
            ]
            legacy_binding = True
        else:
            bindings = []
            legacy_binding = False

        binding_claims: dict[str, list[int]] = defaultdict(list)
        indirect_found = False
        for index, binding in enumerate(bindings):
            missing = _missing_fields(binding, EVIDENCE_FIELDS)
            if missing or not _valid_digest(binding.get("artifact_digest")) or not _valid_digest(
                binding.get("fixture_digest")
            ):
                add(
                    "EVIDENCE_BINDING_INCOMPLETE",
                    "P1",
                    f"Evidence binding is incomplete or has an invalid digest; missing={missing}.",
                    ticket_id=ticket_id,
                )
            binding_ids = {
                value for value in _items(binding.get("evidence_ids")) if isinstance(value, str)
            }
            if not binding_ids and not legacy_binding:
                add(
                    "EVIDENCE_BINDING_IDS_MISSING",
                    "P1",
                    "Evidence binding must list at least one evidence ID.",
                    ticket_id=ticket_id,
                )
            for evidence_id in binding_ids:
                binding_claims[evidence_id].append(index)
                if evidence_id not in production_evidence_ids:
                    add(
                        "EVIDENCE_BINDING_ID_UNDECLARED",
                        "P1",
                        "Evidence binding includes an ID that is not declared as owned or consumed production evidence.",
                        ticket_id=ticket_id,
                        evidence_id=evidence_id,
                    )
                    continue
                evidence = evidence_units[evidence_id]
                if not _identities_match(binding, evidence):
                    add(
                        "EVIDENCE_IDENTITY_MISMATCH",
                        "P1",
                        "Evidence ID is bound to an immutable identity that differs from its evidence unit.",
                        ticket_id=ticket_id,
                        evidence_id=evidence_id,
                    )
            if bool(ticket.get("user_visible")):
                indirect_found = indirect_found or any(
                    pattern.search(value)
                    for value in _iter_strings(binding)
                    for pattern in INDIRECT_EVIDENCE_PATTERNS
                )

        for evidence_id in sorted(production_evidence_ids):
            count = len(binding_claims.get(evidence_id, []))
            if count != 1:
                add(
                    "EVIDENCE_BINDING_COUNT",
                    "P1",
                    f"Production evidence ID must appear in exactly one immutable identity group; found {count}.",
                    ticket_id=ticket_id,
                    evidence_id=evidence_id,
                )

        if bool(ticket.get("user_visible")) and plan.get("evidence_policy") == "AVAILABLE" and not bindings:
            add(
                "USER_VISIBLE_EVIDENCE_INCOMPLETE",
                "P1",
                "User-visible ticket lacks immutable evidence identity.",
                ticket_id=ticket_id,
            )
        evidence_text = {
            "composition": ticket.get("composition"),
            "tracker_payload": ticket.get("tracker_payload"),
        }
        if bool(ticket.get("user_visible")):
            indirect_found = indirect_found or any(
                pattern.search(value)
                for value in _iter_strings(evidence_text)
                for pattern in INDIRECT_EVIDENCE_PATTERNS
            )
        if indirect_found:
            add(
                "INDIRECT_EVIDENCE_REFERENCE",
                "P1",
                "User-visible ticket uses an indirect evidence reference.",
                ticket_id=ticket_id,
            )

    for requirement_id, requirement in requirements.items():
        owner_id = primary_owners.get(requirement_id)
        if not owner_id:
            continue
        owner_ticket = tickets[owner_id]
        owned = set(_items(owner_ticket.get("evidence_ids_owned")))
        consumed = set(_items(owner_ticket.get("evidence_ids_consumed")))
        downstream = set(_items(owner_ticket.get("downstream_integration_evidence_ids")))
        for evidence_id in _items(requirement.get("required_evidence_ids")):
            evidence = evidence_units.get(evidence_id)
            if not evidence:
                add(
                    "REQUIREMENT_EVIDENCE_UNKNOWN",
                    "P1",
                    "Requirement maps to undeclared evidence.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                    evidence_id=str(evidence_id),
                )
                continue
            if evidence.get("downstream_integration"):
                if evidence_id not in downstream:
                    add(
                        "REQUIREMENT_DOWNSTREAM_EVIDENCE_UNLISTED",
                        "P1",
                        "Primary owner must list mapped downstream integration evidence.",
                        ticket_id=owner_id,
                        requirement_id=requirement_id,
                        evidence_id=str(evidence_id),
                    )
            elif evidence_id not in owned | consumed:
                add(
                    "REQUIREMENT_EVIDENCE_UNLISTED",
                    "P1",
                    "Primary owner must list mapped evidence as owned or dependency.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                    evidence_id=str(evidence_id),
                )
            if evidence.get("production_required", True) and not evidence.get("downstream_integration"):
                evidence_owner = evidence.get("delivery_owner")
                if evidence_owner not in closure(owner_id):
                    add(
                        "REQUIREMENT_EVIDENCE_OUTSIDE_CLOSURE",
                        "P1",
                        "Primary owner cannot accept the requirement because production evidence is outside its blocker closure.",
                        ticket_id=owner_id,
                        requirement_id=requirement_id,
                        evidence_id=str(evidence_id),
                        dependency_path=[owner_id, f"missing blocker to {evidence_owner}"],
                    )

    required_source_refs = {
        value for value in _items(plan.get("composition_required_source_refs")) if isinstance(value, str)
    }
    required_integration_ids = {
        value
        for value in _items(plan.get("composition_integration_evidence_ids"))
        if isinstance(value, str)
    }
    for ticket_id, ticket in tickets.items():
        if not ticket.get("composition_ticket"):
            continue
        composition = ticket.get("composition")
        missing = _missing_fields(
            composition,
            ("identity", "manifest", "artifact_ref", "artifact_digest", "fixture_ref", "fixture_digest"),
        )
        if missing or not isinstance(composition, dict):
            add(
                "COMPOSITION_IDENTITY_INCOMPLETE",
                "P1",
                f"Composition identity is incomplete; missing={missing}.",
                ticket_id=ticket_id,
            )
            continue
        if not _valid_digest(composition.get("artifact_digest")) or not _valid_digest(
            composition.get("fixture_digest")
        ):
            add(
                "COMPOSITION_DIGEST_INVALID",
                "P1",
                "Composition artifact or fixture digest is invalid.",
                ticket_id=ticket_id,
            )
        sources = _items(composition.get("sources"))
        actual_refs: set[str] = set()
        composition_source_claims: dict[str, list[int]] = defaultdict(list)
        for source_index, source in enumerate(sources):
            source_missing = _missing_fields(source, EVIDENCE_FIELDS)
            if source_missing or not _valid_digest(source.get("artifact_digest")) or not _valid_digest(
                source.get("fixture_digest")
            ):
                add(
                    "COMPOSITION_SOURCE_INCOMPLETE",
                    "P1",
                    f"Composition source identity is incomplete; missing={source_missing}.",
                    ticket_id=ticket_id,
                )
            reference = source.get("reference") if isinstance(source, dict) else None
            if isinstance(reference, str):
                actual_refs.add(reference)
            source_ids = {
                value for value in _items(source.get("source_ids")) if isinstance(value, str)
            } if isinstance(source, dict) else set()
            delivery_owners = source.get("delivery_owners", {}) if isinstance(source, dict) else {}
            if not source_ids:
                add(
                    "COMPOSITION_SOURCE_IDS_MISSING",
                    "P1",
                    "Composition source must list consumed source IDs.",
                    ticket_id=ticket_id,
                )
            for evidence_id in source_ids:
                composition_source_claims[evidence_id].append(source_index)
                evidence = evidence_units.get(evidence_id)
                declared_owner = delivery_owners.get(evidence_id) if isinstance(delivery_owners, dict) else None
                if not evidence or declared_owner != evidence.get("delivery_owner"):
                    add(
                        "COMPOSITION_SOURCE_OWNER_MISMATCH",
                        "P1",
                        "Composition source ID lacks its exact delivery owner.",
                        ticket_id=ticket_id,
                        evidence_id=evidence_id,
                    )
                if evidence and not _identities_match(source, evidence):
                    add(
                        "COMPOSITION_SOURCE_IDENTITY_MISMATCH",
                        "P1",
                        "Composition source ID is bound to an immutable identity that differs from its evidence unit.",
                        ticket_id=ticket_id,
                        evidence_id=evidence_id,
                    )
        for evidence_id, source_indexes in sorted(composition_source_claims.items()):
            if len(source_indexes) != 1:
                add(
                    "COMPOSITION_SOURCE_ID_COUNT",
                    "P1",
                    f"Composition source ID must appear in exactly one source identity group; found {len(source_indexes)}.",
                    ticket_id=ticket_id,
                    evidence_id=evidence_id,
                )
        if any(
            pattern.search(value)
            for value in _iter_strings(composition)
            for pattern in INDIRECT_EVIDENCE_PATTERNS
        ):
            add(
                "INDIRECT_EVIDENCE_REFERENCE",
                "P1",
                "Composition uses an indirect evidence reference.",
                ticket_id=ticket_id,
            )
        if required_source_refs and actual_refs != required_source_refs:
            add(
                "COMPOSITION_SOURCE_SET_MISMATCH",
                "P1",
                f"Composition source references differ; expected={sorted(required_source_refs)}, actual={sorted(actual_refs)}.",
                ticket_id=ticket_id,
            )
        actual_integration_ids = {
            value for value in _items(composition.get("integration_ids")) if isinstance(value, str)
        }
        if actual_integration_ids != required_integration_ids:
            add(
                "COMPOSITION_INTEGRATION_SET_MISMATCH",
                "P1",
                "Composition integration IDs do not match the plan declaration.",
                ticket_id=ticket_id,
            )

    flagged_final_ids = {
        ticket_id for ticket_id, ticket in tickets.items() if bool(ticket.get("final_integration"))
    }
    final_candidates = set(flagged_final_ids)
    if isinstance(final_id, str) and final_id:
        final_candidates.add(final_id)

    derived_delivery_ids: set[str] = set()
    for ticket_id, ticket in tickets.items():
        if ticket_id in final_candidates:
            continue
        owns_production_evidence = any(
            evidence_id in evidence_units
            and evidence_units[evidence_id].get("production_required", True)
            and not evidence_units[evidence_id].get("downstream_integration")
            for evidence_id in _items(ticket.get("evidence_ids_owned"))
        )
        has_actual_delivery = bool(
            _items(ticket.get("primary_requirement_ids"))
            or _items(ticket.get("supporting_requirement_ids"))
            or _items(ticket.get("capabilities_owned"))
            or owns_production_evidence
            or ticket.get("user_visible")
            or ticket.get("bounded_validation_ticket")
            or ticket.get("composition_ticket")
        )
        if has_actual_delivery and ticket.get("delivery_ticket") is False:
            add(
                "DELIVERY_TICKET_FALSE_NEGATIVE",
                "P1",
                "A ticket with actual delivery responsibility cannot be hidden with delivery_ticket=false.",
                ticket_id=ticket_id,
            )
        if has_actual_delivery or ticket.get("delivery_ticket") is True:
            derived_delivery_ids.add(ticket_id)

    wide_refactor = plan.get("wide_refactor")
    wide_refactor_valid = False
    if wide_refactor is not None:
        if not isinstance(wide_refactor, dict):
            add("WIDE_REFACTOR_INVALID", "P1", "wide_refactor must be an expand-contract object.")
        else:
            expand_id = wide_refactor.get("expand_ticket_id")
            migrate_ids = {
                value
                for value in _items(wide_refactor.get("migrate_ticket_ids"))
                if isinstance(value, str) and value
            }
            contract_id = wide_refactor.get("contract_ticket_id")
            participant_ids = ({expand_id, contract_id} | migrate_ids) - {None, ""}
            expected_contract_blockers = {expand_id} | migrate_ids
            invalid_wide_refactor = (
                not isinstance(expand_id, str)
                or not expand_id
                or not isinstance(contract_id, str)
                or not contract_id
                or not migrate_ids
                or len(participant_ids) != len(migrate_ids) + 2
                or not participant_ids <= set(tickets)
                or participant_ids != derived_delivery_ids
                or any(expand_id not in set(blockers.get(ticket_id, [])) for ticket_id in migrate_ids)
                or not expected_contract_blockers <= set(blockers.get(contract_id, []))
            )
            if invalid_wide_refactor:
                add(
                    "WIDE_REFACTOR_INVALID",
                    "P1",
                    "wide_refactor must identify distinct expand, migrate, and contract delivery tickets with complete direct blockers.",
                )
            else:
                wide_refactor_valid = True

    composed_plan = bool(
        required_source_refs
        or required_integration_ids
        or any(bool(ticket.get("composition_ticket")) for ticket in tickets.values())
    )
    final_required = composed_plan or (len(derived_delivery_ids) > 1 and not wide_refactor_valid)

    if final_required and (not isinstance(final_id, str) or not final_id):
        add(
            "FINAL_TICKET_REQUIRED",
            "P1",
            "A composed workflow or plan with multiple delivery tickets requires one final integration ticket.",
        )
    if final_required and len(flagged_final_ids) != 1:
        add(
            "FINAL_TICKET_COUNT",
            "P1",
            f"Exactly one ticket must declare final_integration=true; found {len(flagged_final_ids)}.",
        )
    elif len(flagged_final_ids) > 1:
        add(
            "FINAL_TICKET_COUNT",
            "P1",
            f"At most one ticket may declare final_integration=true; found {len(flagged_final_ids)}.",
        )
    if flagged_final_ids and (not isinstance(final_id, str) or not final_id):
        add(
            "FINAL_TICKET_ID_MISMATCH",
            "P1",
            "A ticket flagged for final integration must match final_integration_ticket_id.",
        )

    if final_id is not None:
        if final_id not in tickets:
            add("FINAL_TICKET_UNKNOWN", "P1", f"Unknown final integration ticket: {final_id}.")
        else:
            final_ticket = tickets[final_id]
            if not final_ticket.get("final_integration"):
                add(
                    "FINAL_TICKET_FLAG_MISSING",
                    "P1",
                    "Configured final integration ticket lacks final_integration=true.",
                    ticket_id=final_id,
                )
            if flagged_final_ids and flagged_final_ids != {final_id}:
                add(
                    "FINAL_TICKET_ID_MISMATCH",
                    "P1",
                    "final_integration_ticket_id does not match the sole ticket flagged for final integration.",
                    ticket_id=final_id,
                )
            missing_blockers = sorted(derived_delivery_ids - set(blockers.get(final_id, [])))
            if missing_blockers:
                add(
                    "FINAL_TICKET_MISSING_DELIVERY_BLOCKERS",
                    "P1",
                    f"Final integration ticket must be directly blocked by all derived delivery tickets; missing={missing_blockers}.",
                    ticket_id=final_id,
                )
            for evidence_id in _items(final_ticket.get("evidence_ids_owned")):
                evidence = evidence_units.get(evidence_id)
                if evidence and not evidence.get("downstream_integration"):
                    add(
                        "FINAL_TICKET_OWNS_SOURCE_EVIDENCE",
                        "P1",
                        "Final integration ticket must not re-own source evidence.",
                        ticket_id=final_id,
                        evidence_id=str(evidence_id),
                    )
            for evidence_id in required_integration_ids:
                evidence = evidence_units.get(evidence_id)
                if not evidence or evidence.get("delivery_owner") != final_id:
                    add(
                        "FINAL_TICKET_MISSING_INTEGRATION_EVIDENCE",
                        "P1",
                        "Final integration ticket must own each composition integration evidence ID.",
                        ticket_id=final_id,
                        evidence_id=evidence_id,
                    )
    for requirement_id, requirement in requirements.items():
        if requirement.get("requires_final_integration"):
            owner_id = primary_owners.get(requirement_id)
            if not final_id or owner_id != final_id:
                add(
                    "FINAL_REQUIREMENT_OWNER_MISMATCH",
                    "P1",
                    "A final-integration requirement must be owned by the final integration ticket.",
                    ticket_id=owner_id,
                    requirement_id=requirement_id,
                )

    for item in reconciliations:
        if not isinstance(item, dict):
            add("RECONCILIATION_INVALID", "P2", "Reconciliation entry must be an object.")
            continue
        ticket_ref = item.get("ticket_ref")
        if not isinstance(ticket_ref, str) or not ticket_ref.strip():
            add("RECONCILIATION_TICKET_REF_MISSING", "P2", "Reconciliation lacks ticket_ref.")
        classification = item.get("classification")
        if classification not in ALLOWED_RECONCILIATIONS:
            add(
                "RECONCILIATION_CLASS_INVALID",
                "P2",
                f"Unknown reconciliation classification: {classification}.",
            )
        affected = {
            value for value in _items(item.get("affected_ticket_ids")) if isinstance(value, str) and value
        }
        if not affected:
            add(
                "RECONCILIATION_AFFECTED_TICKETS_MISSING",
                "P2",
                "Reconciliation must identify at least one affected plan ticket.",
            )
        unknown_affected = sorted(affected - set(tickets))
        if unknown_affected:
            add(
                "RECONCILIATION_AFFECTED_TICKET_UNKNOWN",
                "P2",
                f"Reconciliation references unknown plan tickets: {unknown_affected}.",
            )
        planned_action = item.get("planned_action")
        if not isinstance(planned_action, str) or not planned_action.strip():
            add("RECONCILIATION_ACTION_MISSING", "P2", "Reconciliation lacks planned_action.")
        resolution_status = item.get("resolution_status")
        if not isinstance(resolution_status, str) or not resolution_status.strip():
            add("RECONCILIATION_STATUS_MISSING", "P2", "Reconciliation lacks resolution_status.")
        if classification == "CONFLICT" and item.get("resolution_status") != "RESOLVED":
            exposed = sorted(affected & set(tickets))
            add(
                "UNRESOLVED_CONFLICT_IN_FRONTIER",
                "P1",
                f"Unresolved existing-ticket conflict blocks publication and readiness for affected tickets: {exposed}.",
            )

    return _result(plan, findings, frontier)


def _result(plan: Any, findings: list[Finding], frontier: list[str]) -> dict[str, Any]:
    ordered = sorted(
        findings,
        key=lambda finding: (
            SEVERITY_ORDER.get(finding.severity, 99),
            finding.ticket_id or "",
            finding.requirement_id or "",
            finding.story_id or "",
            finding.code,
        ),
    )
    counts = Counter(finding.severity for finding in ordered)
    return {
        "verdict": "PASS" if not ordered else "FAIL",
        "plan_id": plan.get("plan_id") if isinstance(plan, dict) else None,
        "severity_counts": {severity: counts.get(severity, 0) for severity in ("P1", "P2", "P3")},
        "frontier": frontier,
        "findings": [asdict(finding) for finding in ordered],
    }


def human_summary(result: dict[str, Any]) -> str:
    lines = [
        f"{result['verdict']}: P1={result['severity_counts']['P1']} "
        f"P2={result['severity_counts']['P2']} P3={result['severity_counts']['P3']}",
        "Frontier: " + (", ".join(result.get("frontier", [])) or "None"),
    ]
    for finding in result.get("findings", []):
        context = [
            value
            for value in (
                finding.get("ticket_id"),
                finding.get("requirement_id"),
                finding.get("story_id"),
                finding.get("capability_id"),
                finding.get("evidence_id"),
            )
            if value
        ]
        suffix = f" [{' / '.join(context)}]" if context else ""
        path = finding.get("dependency_path")
        if path:
            suffix += f" path={' -> '.join(path)}"
        lines.append(f"- {finding['severity']} {finding['code']}{suffix}: {finding['message']}")
    return "\n".join(lines)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path, help="Path to the structured ticket plan JSON.")
    parser.add_argument(
        "--format",
        choices=("human", "json", "both"),
        default="both",
        help="Output format. Default: both.",
    )
    parser.add_argument("--json-out", type=Path, help="Optional standalone JSON result path.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        with args.plan.open("r", encoding="utf-8") as handle:
            plan = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    result = validate_plan(plan)
    if args.json_out:
        try:
            args.json_out.write_text(
                json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
        except OSError as error:
            print(f"ERROR: {error}", file=sys.stderr)
            return 2

    if args.format in {"human", "both"}:
        print(human_summary(result))
    if args.format == "both":
        print("--- JSON ---")
    if args.format in {"json", "both"}:
        print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["verdict"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
