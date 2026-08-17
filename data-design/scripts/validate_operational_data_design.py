#!/usr/bin/env python3
"""Validate a database-neutral operational data design contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote, urlparse


VALIDATOR_VERSION = "1.2.0"
SCHEMA_VERSION = "1.2"

CLASSIFICATIONS = {
    "DERIVED_FROM_AUTHORITY",
    "IMPLEMENTATION_CHOICE",
    "PROPOSED_ARCHITECTURE",
    "BLOCKED_PRODUCT_DECISION",
    "BLOCKED_PROTOTYPE",
    "BLOCKED_TECHNICAL_VALIDATION",
    "OUT_OF_SCOPE",
}
BLOCKED_CLASSIFICATIONS = {
    "BLOCKED_PRODUCT_DECISION",
    "BLOCKED_PROTOTYPE",
    "BLOCKED_TECHNICAL_VALIDATION",
}
CONFIRMED_AUTHORITY_STATUSES = {"CONFIRMED", "CONFIRMED_AND_VALIDATED"}
AUTHORITY_STATUSES = CONFIRMED_AUTHORITY_STATUSES | {
    "RESEARCH_ONLY",
    "PROTOTYPE_ONLY",
    "TECHNICAL_EVIDENCE",
}
CONFIRMED_AUTHORITY_KINDS = {
    "CANONICAL_PRODUCT_DECISION",
    "ACCEPTED_ADR",
    "PROJECT_STANDARD",
    "PRODUCT_READINESS_RECEIPT",
}
VALIDATION_STATUSES = {"VALIDATED", "PROPOSED", "BLOCKED", "NOT_APPLICABLE"}
DESIGN_STATUSES = {"DRAFT", "BLOCKED", "READY_FOR_SPEC", "READY_FOR_TICKETS"}
GATES = {"READY_FOR_SPEC", "READY_FOR_TICKETS"}
BLOCK_LEVELS = {"LOGICAL", "PHYSICAL", "BOTH"}
MATERIAL_COLLECTIONS = (
    "objects",
    "relationships",
    "invariants",
    "state_transitions",
    "commands",
    "transaction_boundaries",
    "permission_checks",
    "consistency_requirements",
    "idempotency_contracts",
    "unknown_outcome_contracts",
    "physical_adapters",
    "migration_requirements",
    "contract_tests",
    "blocked_items",
    "out_of_scope",
)
LOGICAL_BEHAVIOR_COLLECTIONS = (
    "invariants",
    "state_transitions",
    "commands",
    "transaction_boundaries",
    "permission_checks",
    "consistency_requirements",
    "idempotency_contracts",
    "unknown_outcome_contracts",
)
CRITICAL_LOGICAL_COLLECTIONS = (
    "objects",
    "invariants",
    "state_transitions",
    "commands",
    "transaction_boundaries",
    "permission_checks",
    "consistency_requirements",
    "idempotency_contracts",
    "unknown_outcome_contracts",
    "contract_tests",
)
NOT_APPLICABLE_ALLOWED = {
    "relationships",
    "state_transitions",
    "idempotency_contracts",
    "unknown_outcome_contracts",
    "migration_requirements",
    "out_of_scope",
}
PHYSICAL_TEST_CATEGORIES = {
    "CONSTRAINT",
    "CONCURRENCY",
    "PERMISSION",
    "RECOVERY",
    "MIGRATION",
    "ADAPTER",
}
CONTENT_MODES = {"STORED", "REFERENCED", "HYBRID"}
CARDINALITIES = {"ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_ONE", "MANY_TO_MANY"}
CONSISTENCY_MODELS = {
    "IMMEDIATE",
    "OPTIMISTIC_CAS",
    "SERIALIZABLE",
    "EVENTUAL",
    "EXTERNAL_AUTHORITY",
}
SUPPORTED_ADAPTER_KINDS = {"POSTGRESQL", "SUPABASE"}
PROTOTYPE_REVIEW_STATUSES = {"PENDING", "ADMITTED", "REJECTED"}
SUPPORTED_ADMISSION_VERIFIER = "product-readiness-receipt/v1"
MATERIAL_ENUMS: dict[tuple[str, str], set[str]] = {
    ("objects", "content_mode"): CONTENT_MODES,
    ("relationships", "cardinality"): CARDINALITIES,
    ("consistency_requirements", "consistency_model"): CONSISTENCY_MODELS,
    ("transaction_boundaries", "atomicity_mode"): {"ATOMIC", "SAGA", "EXTERNAL_NON_ATOMIC"},
    ("transaction_boundaries", "partial_success_mode"): {"NONE", "RECORDED_AND_RECOVERABLE", "COMPENSATED"},
    ("unknown_outcome_contracts", "retry_mode"): {"VERIFY_THEN_RETRY", "NO_AUTOMATIC_RETRY", "MANUAL_RECOVERY"},
    ("contract_tests", "test_level"): {"LOGICAL", "PHYSICAL", "END_TO_END"},
    ("blocked_items", "blocks"): BLOCK_LEVELS,
}
PHYSICAL_CATEGORY_TARGETS: dict[str, set[str]] = {
    "CONSTRAINT": {"invariants"},
    "CONCURRENCY": {"commands", "consistency_requirements"},
    "PERMISSION": {"permission_checks"},
    "RECOVERY": {"idempotency_contracts", "unknown_outcome_contracts"},
    "MIGRATION": {"migration_requirements"},
    "ADAPTER": {"physical_adapters"},
}
STABLE_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9._:-]{2,127}$")
SHA256_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")

# Required semantic fields for active material. Common provenance fields are
# validated separately. This is intentionally stricter than a generic bag of
# strings: a READY package must carry the actual business contract.
MATERIAL_SCHEMAS: dict[str, dict[str, tuple[str, ...]]] = {
    "objects": {
        "strings": (
            "name",
            "purpose",
            "stable_identity",
            "source_of_truth_owner",
            "lifecycle",
            "retention_ref",
            "content_mode",
        ),
        "lists": ("current_state_fields", "immutable_fact_refs"),
    },
    "relationships": {
        "strings": (
            "name",
            "from_object_ref",
            "to_object_ref",
            "cardinality",
            "ownership",
            "retention_behavior",
        ),
        "lists": ("invariant_refs",),
        "bools": ("optional",),
    },
    "invariants": {"strings": ("statement", "enforcement_point")},
    "state_transitions": {
        "strings": ("name", "from_state", "to_state", "trigger_ref"),
        "lists": ("preconditions", "effects"),
    },
    "commands": {
        "strings": (
            "name",
            "actor_contract",
            "observed_version",
            "success_outcome",
        ),
        "lists": (
            "target_object_refs",
            "authorization_check_refs",
            "preconditions",
            "atomic_effects",
            "failure_outcomes",
            "audit_facts",
        ),
    },
    "transaction_boundaries": {
        "strings": ("name", "atomicity_mode", "atomicity", "partial_success_mode", "partial_success_policy"),
        "lists": ("command_refs", "writes"),
        "optional_lists": ("external_effects",),
    },
    "permission_checks": {
        "strings": ("name", "actor_scope", "data_scope", "denial_outcome"),
        "lists": ("target_refs",),
        "bools": ("execution_time_revalidation",),
    },
    "consistency_requirements": {
        "strings": ("name", "consistency_model", "enforcement", "conflict_outcome"),
        "lists": ("target_refs",),
    },
    "idempotency_contracts": {
        "strings": (
            "name",
            "key_scope",
            "target_binding",
            "request_fingerprint",
            "retention_window",
            "replay_result",
            "partial_success_behavior",
            "unknown_result_behavior",
        ),
        "lists": ("command_refs",),
    },
    "unknown_outcome_contracts": {
        "strings": (
            "name",
            "unknown_state",
            "authoritative_source",
            "verification_method",
            "retry_policy",
            "retry_mode",
            "resolution_fact",
        ),
        "lists": ("command_refs",),
    },
    "physical_adapters": {
        "strings": (
            "adapter_kind",
            "mapping_summary",
            "constraint_strategy",
            "transaction_strategy",
            "concurrency_strategy",
            "permission_strategy",
            "recovery_strategy",
        ),
        "bools": ("selected",),
    },
    "migration_requirements": {
        "strings": (
            "strategy",
            "compatibility_plan",
            "backfill_plan",
            "validation_plan",
            "rollback_plan",
        ),
        "lists": ("deployment_order",),
    },
    "contract_tests": {
        "strings": ("name", "test_level", "expected_behavior"),
        "lists": ("covers", "coverage_categories"),
    },
    "blocked_items": {
        "strings": ("question", "owner", "return_target", "blocks"),
    },
    "out_of_scope": {"strings": ("scope", "reason")},
}


@dataclass(frozen=True)
class Finding:
    code: str
    severity: str
    message: str
    item_id: str | None = None
    field: str | None = None


def _items(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_string_list(value: Any, *, allow_empty: bool = False) -> bool:
    return (
        isinstance(value, list)
        and (allow_empty or bool(value))
        and all(_nonempty(item) for item in value)
    )


def _string_list(value: Any) -> list[str]:
    return list(value) if _valid_string_list(value, allow_empty=True) else []


def _duplicates(values: Iterable[str]) -> list[str]:
    return sorted(value for value, count in Counter(values).items() if value and count > 1)


def _valid_timestamp(value: Any) -> bool:
    return _parse_timestamp(value) is not None


def _parse_timestamp(value: Any) -> datetime | None:
    if not _nonempty(value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def _is_future_timestamp(value: Any) -> bool:
    parsed = _parse_timestamp(value)
    return parsed is not None and parsed > datetime.now(timezone.utc) + timedelta(minutes=5)


def _is_active(item: dict[str, Any]) -> bool:
    return item.get("validation_status") != "NOT_APPLICABLE" and item.get("classification") != "OUT_OF_SCOPE"


def _resolve_local_ref(ref: str, design_path: Path) -> Path | None:
    path_text = unquote(ref.split("#", 1)[0])
    if not path_text:
        return None
    candidate = Path(path_text)
    if candidate.is_absolute():
        return candidate if candidate.is_file() else None
    if urlparse(path_text).scheme:
        return None
    for parent in (design_path.parent, *design_path.parents):
        resolved = parent / candidate
        if resolved.is_file():
            return resolved
    return None


def _markdown_anchor_exists(path: Path, ref: str) -> bool:
    fragment = unquote(ref.split("#", 1)[1]).strip() if "#" in ref else ""
    if not fragment:
        return True
    if path.suffix.lower() not in {".md", ".markdown"}:
        return False
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return False
    anchors: set[str] = set()
    counts: Counter[str] = Counter()
    for line in text.splitlines():
        match = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", line)
        if not match:
            continue
        heading = re.sub(r"<[^>]+>", "", match.group(1)).strip().lower()
        slug = re.sub(r"[^\w\- ]", "", heading, flags=re.UNICODE).replace(" ", "-")
        slug = re.sub(r"-+", "-", slug).strip("-")
        suffix = counts[slug]
        counts[slug] += 1
        anchors.add(slug if suffix == 0 else f"{slug}-{suffix}")
    return fragment.lower() in anchors


def _is_local_ref(ref: str) -> bool:
    path_text = unquote(ref.split("#", 1)[0])
    return bool(path_text) and (Path(path_text).is_absolute() or not urlparse(path_text).scheme)


def validate_design(
    design: Any,
    required_gate: str | None = None,
    design_path: Path | None = None,
) -> dict[str, Any]:
    findings: list[Finding] = []

    def add(
        code: str,
        severity: str,
        message: str,
        *,
        item_id: str | None = None,
        field: str | None = None,
    ) -> None:
        findings.append(Finding(code, severity, message, item_id, field))

    if required_gate is not None and required_gate not in GATES:
        add("INVALID_REQUIRED_GATE", "P1", f"Unsupported gate: {required_gate}.")

    if not isinstance(design, dict):
        add("ROOT_NOT_OBJECT", "P1", "The design root must be a JSON object.")
        return _result(design, required_gate, findings)

    if design.get("schema_version") != SCHEMA_VERSION:
        add("SCHEMA_VERSION_INVALID", "P1", f"schema_version must be {SCHEMA_VERSION}.", field="schema_version")

    for field in ("design_id", "target", "boundary"):
        if not _nonempty(design.get(field)):
            add("ROOT_FIELD_MISSING", "P1", f"Missing non-empty root field: {field}.", field=field)

    status = design.get("status")
    if status not in DESIGN_STATUSES:
        add("DESIGN_STATUS_INVALID", "P1", f"Unsupported design status: {status!r}.", field="status")

    for field in ("source_authorities", "prototype_evidence", *MATERIAL_COLLECTIONS):
        if not isinstance(design.get(field), list):
            add("COLLECTION_MISSING", "P1", f"{field} must be a JSON array.", field=field)

    authority_ids: list[str] = []
    authority_status_by_id: dict[str, str] = {}
    authority_currentness_times: list[datetime] = []
    for raw in _items(design.get("source_authorities")):
        if not isinstance(raw, dict):
            add("AUTHORITY_NOT_OBJECT", "P1", "Every source authority must be an object.")
            continue
        item_id = raw.get("stable_id")
        if not _valid_id(item_id):
            add("AUTHORITY_ID_INVALID", "P1", "Authority stable_id is missing or invalid.", item_id=str(item_id))
            continue
        authority_ids.append(item_id)
        status_value = raw.get("authority_status")
        authority_status_by_id[item_id] = str(status_value or "")
        for field in ("ref", "authority_kind", "authority_status", "version", "content_sha256", "currentness_status"):
            if not _nonempty(raw.get(field)):
                add("AUTHORITY_IMMUTABLE_IDENTITY_MISSING", "P1", f"Authority requires {field}.", item_id=item_id, field=field)
        digest = raw.get("content_sha256")
        if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(digest):
            add("AUTHORITY_DIGEST_INVALID", "P1", "Authority content_sha256 must be 64 hexadecimal characters.", item_id=item_id)
        if status_value not in AUTHORITY_STATUSES:
            add("AUTHORITY_STATUS_INVALID", "P1", f"Unsupported authority_status: {status_value!r}.", item_id=item_id)
        if status_value in CONFIRMED_AUTHORITY_STATUSES:
            if raw.get("authority_kind") not in CONFIRMED_AUTHORITY_KINDS:
                add("CONFIRMED_AUTHORITY_KIND_INVALID", "P1", "Only canonical authority kinds may be confirmed.", item_id=item_id)
            if raw.get("currentness_status") != "CURRENT":
                add("AUTHORITY_NOT_CURRENT", "P1", "Confirmed authority must be rechecked as CURRENT.", item_id=item_id)
            if not _valid_timestamp(raw.get("currentness_checked_at")):
                add("AUTHORITY_CURRENTNESS_TIME_INVALID", "P1", "Confirmed authority requires a timezone-aware currentness_checked_at.", item_id=item_id)
            elif _is_future_timestamp(raw.get("currentness_checked_at")):
                add("AUTHORITY_CURRENTNESS_TIME_FUTURE", "P1", "Authority currentness check cannot be in the future.", item_id=item_id)
            else:
                parsed_currentness = _parse_timestamp(raw.get("currentness_checked_at"))
                if parsed_currentness is not None:
                    authority_currentness_times.append(parsed_currentness)
        ref = raw.get("ref")
        if design_path is not None and _nonempty(ref):
            if not _is_local_ref(ref):
                add("AUTHORITY_NOT_LOCALLY_VERIFIABLE", "P1", "Confirmed readiness authority must resolve to locally verifiable immutable bytes.", item_id=item_id)
            else:
                resolved = _resolve_local_ref(ref, design_path)
                if resolved is None:
                    add("AUTHORITY_REF_NOT_FOUND", "P1", f"Local authority reference does not exist: {ref}.", item_id=item_id)
                else:
                    if not _markdown_anchor_exists(resolved, ref):
                        add("AUTHORITY_ANCHOR_NOT_FOUND", "P1", f"Authority anchor does not exist: {ref}.", item_id=item_id)
                    if isinstance(digest, str) and SHA256_PATTERN.fullmatch(digest):
                        try:
                            actual = hashlib.sha256(resolved.read_bytes()).hexdigest()
                        except OSError as error:
                            add("AUTHORITY_REF_UNREADABLE", "P1", f"Authority bytes cannot be read: {error}.", item_id=item_id)
                        else:
                            if actual.lower() != digest.lower():
                                add("AUTHORITY_DIGEST_MISMATCH", "P1", "Local authority bytes do not match content_sha256.", item_id=item_id)

    if not authority_ids:
        add("NO_SOURCE_AUTHORITY", "P1", "At least one precise source authority is required.")

    prototype_ids: list[str] = []
    prototype_review_by_id: dict[str, str] = {}
    prototype_admitted_by_id: dict[str, set[str]] = {}
    for raw in _items(design.get("prototype_evidence")):
        if not isinstance(raw, dict):
            add("PROTOTYPE_NOT_OBJECT", "P1", "Every prototype evidence entry must be an object.")
            continue
        item_id = raw.get("stable_id")
        if not _valid_id(item_id):
            add("PROTOTYPE_ID_INVALID", "P1", "Prototype stable_id is missing or invalid.", item_id=str(item_id))
            continue
        prototype_ids.append(item_id)
        review_status = str(raw.get("review_status") or "")
        prototype_review_by_id[item_id] = review_status
        prototype_admitted_by_id[item_id] = set(_string_list(raw.get("admitted_ids")))
        for field in ("ref", "review_status", "version", "manifest_ref", "artifact_ref", "fixture_ref"):
            if not _nonempty(raw.get(field)):
                add("PROTOTYPE_FIELD_MISSING", "P1", f"Prototype evidence requires {field}.", item_id=item_id, field=field)
        for field in ("manifest_sha256", "artifact_sha256", "fixture_sha256"):
            if not isinstance(raw.get(field), str) or not SHA256_PATTERN.fullmatch(raw[field]):
                add("PROTOTYPE_DIGEST_INVALID", "P1", f"Prototype evidence requires a valid {field}.", item_id=item_id, field=field)
        if review_status not in PROTOTYPE_REVIEW_STATUSES:
            add("PROTOTYPE_REVIEW_STATUS_INVALID", "P1", f"Unsupported prototype review_status: {review_status!r}.", item_id=item_id)
        if review_status != "ADMITTED" and _string_list(raw.get("admitted_ids")):
            add("PROTOTYPE_NOT_ADMITTED", "P1", "Only an ADMITTED prototype may admit design item IDs.", item_id=item_id)
        if design_path is not None:
            for prefix in ("manifest", "artifact", "fixture"):
                ref = raw.get(f"{prefix}_ref")
                digest = raw.get(f"{prefix}_sha256")
                if _nonempty(ref):
                    if not _is_local_ref(ref):
                        add("PROTOTYPE_NOT_LOCALLY_VERIFIABLE", "P1", f"Prototype {prefix} must resolve to locally verifiable immutable bytes.", item_id=item_id)
                        continue
                    resolved = _resolve_local_ref(ref, design_path)
                    if resolved is None:
                        add("PROTOTYPE_REF_NOT_FOUND", "P1", f"Local prototype {prefix} does not exist: {ref}.", item_id=item_id)
                    elif isinstance(digest, str) and SHA256_PATTERN.fullmatch(digest):
                        try:
                            actual = hashlib.sha256(resolved.read_bytes()).hexdigest()
                        except OSError as error:
                            add("PROTOTYPE_REF_UNREADABLE", "P1", f"Prototype {prefix} bytes cannot be read: {error}.", item_id=item_id)
                        else:
                            if actual.lower() != digest.lower():
                                add("PROTOTYPE_DIGEST_MISMATCH", "P1", f"Local prototype {prefix} bytes do not match {prefix}_sha256.", item_id=item_id)
        if not _valid_string_list(raw.get("source_refs")):
            add("PROTOTYPE_SOURCE_REFS_MISSING", "P1", "Prototype evidence requires precise source_refs.", item_id=item_id)
        if not _valid_string_list(raw.get("admitted_ids")):
            add("PROTOTYPE_ADMITTED_IDS_MISSING", "P1", "Prototype evidence requires exact admitted_ids.", item_id=item_id)

    material_ids: list[str] = []
    item_by_id: dict[str, dict[str, Any]] = {}
    collection_by_id: dict[str, str] = {}
    for collection in MATERIAL_COLLECTIONS:
        for raw in _items(design.get(collection)):
            if not isinstance(raw, dict):
                add("MATERIAL_ITEM_NOT_OBJECT", "P1", f"Every {collection} item must be an object.", field=collection)
                continue
            item_id = raw.get("stable_id")
            if not _valid_id(item_id):
                add("MATERIAL_ID_INVALID", "P1", f"Invalid stable_id in {collection}.", item_id=str(item_id), field=collection)
                continue
            material_ids.append(item_id)
            item_by_id[item_id] = raw
            collection_by_id[item_id] = collection
            if not _valid_string_list(raw.get("source_refs")):
                add("SOURCE_REFS_MISSING", "P1", "Material item requires a non-empty string-only source_refs array.", item_id=item_id)
            classification = raw.get("classification")
            validation_status = raw.get("validation_status")
            if classification not in CLASSIFICATIONS:
                add("CLASSIFICATION_INVALID", "P1", f"Unsupported classification: {classification!r}.", item_id=item_id)
            if not _nonempty(raw.get("rationale")):
                add("RATIONALE_MISSING", "P2", "Material item requires rationale.", item_id=item_id)
            if validation_status not in VALIDATION_STATUSES:
                add("VALIDATION_STATUS_INVALID", "P1", f"Unsupported validation_status: {validation_status!r}.", item_id=item_id)
            if collection == "blocked_items":
                if classification not in BLOCKED_CLASSIFICATIONS:
                    add("BLOCKER_CLASSIFICATION_INVALID", "P1", "blocked_items must use a BLOCKED_* classification.", item_id=item_id)
                if raw.get("blocks") not in BLOCK_LEVELS:
                    add("BLOCK_LEVEL_INVALID", "P1", "A blocker must declare LOGICAL, PHYSICAL, or BOTH.", item_id=item_id)
                if validation_status != "BLOCKED":
                    add("BLOCKER_STATUS_INVALID", "P1", "A blocker must use validation_status BLOCKED.", item_id=item_id)
            elif collection == "out_of_scope":
                if classification != "OUT_OF_SCOPE" or validation_status != "NOT_APPLICABLE":
                    add("OUT_OF_SCOPE_STATUS_INVALID", "P1", "out_of_scope items require OUT_OF_SCOPE and NOT_APPLICABLE.", item_id=item_id)
            else:
                if classification in BLOCKED_CLASSIFICATIONS:
                    add("BLOCKER_IN_WRONG_COLLECTION", "P1", "BLOCKED_* items belong in blocked_items.", item_id=item_id)
                if classification == "OUT_OF_SCOPE":
                    add("OUT_OF_SCOPE_IN_WRONG_COLLECTION", "P1", "OUT_OF_SCOPE items belong in out_of_scope.", item_id=item_id)
                if validation_status == "NOT_APPLICABLE" and collection not in NOT_APPLICABLE_ALLOWED:
                    add("NOT_APPLICABLE_NOT_ALLOWED", "P1", f"{collection} cannot be waived as NOT_APPLICABLE.", item_id=item_id)
            if _is_active(raw) or collection in {"blocked_items", "out_of_scope"}:
                _validate_material_shape(collection, raw, item_id, add)

    for duplicate in _duplicates([*authority_ids, *prototype_ids, *material_ids]):
        add("DUPLICATE_STABLE_ID", "P1", f"Stable ID is not globally unique: {duplicate}.", item_id=duplicate)

    known_ids = set(authority_ids) | set(prototype_ids) | set(material_ids)
    for item_id, raw in item_by_id.items():
        for ref in _string_list(raw.get("source_refs")):
            if ref not in known_ids:
                add("UNKNOWN_SOURCE_REF", "P1", f"Unknown source reference: {ref}.", item_id=item_id)
            if ref == item_id:
                add("SELF_SOURCE_REF", "P1", "A material item cannot cite itself as a source.", item_id=item_id)
            if ref in prototype_review_by_id and (
                prototype_review_by_id[ref] != "ADMITTED"
                or item_id not in prototype_admitted_by_id.get(ref, set())
            ):
                add("PROTOTYPE_SOURCE_NOT_ADMITTED", "P1", "Material may cite prototype evidence only when that exact item ID was admitted.", item_id=item_id)

    for raw in _items(design.get("prototype_evidence")):
        if not isinstance(raw, dict):
            continue
        item_id = str(raw.get("stable_id"))
        for ref in _string_list(raw.get("source_refs")):
            if ref not in set(authority_ids):
                add("PROTOTYPE_AUTHORITY_REF_INVALID", "P1", f"Prototype source ref is not an authority: {ref}.", item_id=item_id)
        for admitted in _string_list(raw.get("admitted_ids")):
            if admitted not in item_by_id:
                add("PROTOTYPE_ADMITTED_ID_UNKNOWN", "P1", f"Prototype admitted_id is unknown: {admitted}.", item_id=item_id)

    _validate_source_graph(item_by_id, authority_status_by_id, add)
    _validate_typed_references(design, item_by_id, collection_by_id, add)

    logical_model = design.get("logical_model")
    if not isinstance(logical_model, dict):
        add("LOGICAL_MODEL_MISSING", "P1", "logical_model must be an object.", field="logical_model")
    elif logical_model.get("status") not in {"INCOMPLETE", "COMPLETE"}:
        add("LOGICAL_MODEL_STATUS_INVALID", "P1", "logical_model.status must be INCOMPLETE or COMPLETE.", field="logical_model.status")

    handoff = design.get("downstream_handoff")
    if not isinstance(handoff, dict):
        add("DOWNSTREAM_HANDOFF_MISSING", "P1", "downstream_handoff must be an object.", field="downstream_handoff")
    else:
        if handoff.get("requested_gate") not in GATES:
            add("HANDOFF_GATE_INVALID", "P1", "downstream_handoff.requested_gate is invalid.", field="downstream_handoff.requested_gate")
        if not _nonempty(handoff.get("consumer")):
            add("HANDOFF_CONSUMER_MISSING", "P2", "downstream_handoff.consumer is required.", field="downstream_handoff.consumer")

    gate = required_gate
    if gate is None and isinstance(handoff, dict) and handoff.get("requested_gate") in GATES:
        gate = handoff["requested_gate"]
    if required_gate is not None and isinstance(handoff, dict) and handoff.get("requested_gate") != required_gate:
        add("HANDOFF_GATE_MISMATCH", "P1", "The explicit validation gate must match downstream_handoff.requested_gate.", field="downstream_handoff.requested_gate")
    if status in GATES and isinstance(handoff, dict) and handoff.get("requested_gate") != status:
        add("DESIGN_STATUS_HANDOFF_MISMATCH", "P1", "A ready design status must equal downstream_handoff.requested_gate.", field="downstream_handoff.requested_gate")
    if isinstance(handoff, dict) and gate in GATES:
        expected_consumer = "to-spec" if gate == "READY_FOR_SPEC" else "to-tickets"
        if handoff.get("consumer") != expected_consumer:
            add("HANDOFF_CONSUMER_GATE_MISMATCH", "P1", f"{gate} requires downstream consumer {expected_consumer}.", field="downstream_handoff.consumer")

    acceptance = _validate_acceptance(design.get("package_acceptance"), item_by_id, design_path, add)
    quality_review = _validate_quality_review(design.get("quality_review"), gate, design_path, add)
    _validate_admission(design.get("admission"), design_path, design, add)

    reviewed_at = _parse_timestamp(quality_review.get("reviewed_at"))
    accepted_at = _parse_timestamp(acceptance.get("accepted_at"))
    if reviewed_at is not None and authority_currentness_times and reviewed_at < max(authority_currentness_times):
        add("QUALITY_REVIEW_PRECEDES_AUTHORITY_CHECK", "P1", "Quality review cannot predate the latest authority currentness check.")
    if reviewed_at is not None and accepted_at is not None and accepted_at < reviewed_at:
        add("PACKAGE_ACCEPTANCE_PRECEDES_REVIEW", "P1", "Package acceptance cannot predate the passing quality review.")

    covered_by_level = _validate_contract_tests(design, item_by_id, collection_by_id, gate, design_path, add)

    selected_adapters = [
        adapter for adapter in _items(design.get("physical_adapters"))
        if isinstance(adapter, dict) and adapter.get("selected") is True
    ]
    if len(selected_adapters) > 1:
        add("MULTIPLE_PHYSICAL_ADAPTERS_SELECTED", "P2", "At most one physical adapter may be selected in a bounded package.")
    for adapter in selected_adapters:
        adapter_kind = str(adapter.get("adapter_kind") or "").upper()
        if adapter_kind not in SUPPORTED_ADAPTER_KINDS:
            add("PHYSICAL_ADAPTER_KIND_UNSUPPORTED", "P1", f"Unsupported operational adapter: {adapter_kind or '<missing>'}.", item_id=adapter.get("stable_id"))
        if adapter_kind == "DBT":
            add("ANALYTICS_ADAPTER_AS_OPERATIONAL_STORE", "P1", "dbt is an analytical handoff, not an operational physical adapter.", item_id=adapter.get("stable_id"))
        if adapter_kind == "SUPABASE":
            if str(adapter.get("base_adapter_kind") or "").upper() != "POSTGRESQL":
                add("SUPABASE_POSTGRES_BASE_MISSING", "P1", "A Supabase adapter must declare PostgreSQL as its base adapter.", item_id=adapter.get("stable_id"))
            permission_refs = _string_list(adapter.get("permission_contract_refs"))
            if not permission_refs:
                add("SUPABASE_PERMISSION_CONTRACT_MISSING", "P1", "A Supabase adapter must reference approved product permission checks before mapping RLS.", item_id=adapter.get("stable_id"))
            for ref in permission_refs:
                if collection_by_id.get(ref) != "permission_checks":
                    add("SUPABASE_PERMISSION_CONTRACT_REF_INVALID", "P1", f"Supabase permission ref is not a known permission check: {ref}.", item_id=adapter.get("stable_id"))

    active_blockers = [item for item in _items(design.get("blocked_items")) if isinstance(item, dict)]
    if status == "BLOCKED" and not active_blockers:
        add("BLOCKED_STATUS_WITHOUT_BLOCKER", "P1", "A BLOCKED design must contain at least one explicit blocked item.", field="status")

    if status in GATES or required_gate is not None:
        _validate_readiness(
            design,
            status,
            gate,
            item_by_id,
            collection_by_id,
            acceptance,
            quality_review,
            covered_by_level,
            add,
        )

    return _result(design, gate, findings)


def _validate_material_shape(collection: str, item: dict[str, Any], item_id: str, add: Any) -> None:
    schema = MATERIAL_SCHEMAS[collection]
    for field in schema.get("strings", ()):
        if not _nonempty(item.get(field)):
            add("MATERIAL_FIELD_MISSING", "P1", f"{collection} requires non-empty {field}.", item_id=item_id, field=field)
    for field in schema.get("lists", ()):
        if not _valid_string_list(item.get(field)):
            add("MATERIAL_FIELD_MISSING", "P1", f"{collection} requires a non-empty string-only {field} array.", item_id=item_id, field=field)
    for field in schema.get("optional_lists", ()):
        if not _valid_string_list(item.get(field), allow_empty=True):
            add("MATERIAL_FIELD_TYPE_INVALID", "P1", f"{collection}.{field} must be a string-only array.", item_id=item_id, field=field)
    for field in schema.get("bools", ()):
        if not isinstance(item.get(field), bool):
            add("MATERIAL_FIELD_TYPE_INVALID", "P1", f"{collection}.{field} must be boolean.", item_id=item_id, field=field)
    for (enum_collection, field), allowed in MATERIAL_ENUMS.items():
        if enum_collection == collection and item.get(field) not in allowed:
            add("MATERIAL_ENUM_INVALID", "P1", f"{collection}.{field} must be one of {sorted(allowed)}.", item_id=item_id, field=field)
    if collection == "permission_checks" and item.get("execution_time_revalidation") is not True:
        add("EXECUTION_REVALIDATION_REQUIRED", "P1", "Material write permission checks must be revalidated at execution time.", item_id=item_id, field="execution_time_revalidation")


def _validate_typed_references(
    design: dict[str, Any],
    item_by_id: dict[str, dict[str, Any]],
    collection_by_id: dict[str, str],
    add: Any,
) -> None:
    def require(ref: str, expected: set[str], owner: str, field: str) -> None:
        if collection_by_id.get(ref) not in expected:
            add("TYPED_REFERENCE_INVALID", "P1", f"{field} must reference {sorted(expected)}; got {ref}.", item_id=owner, field=field)

    for collection, fields in {
        "objects": {"immutable_fact_refs": {"invariants"}},
        "relationships": {
            "invariant_refs": {"invariants"},
            "from_object_ref": {"objects"},
            "to_object_ref": {"objects"},
        },
        "state_transitions": {"trigger_ref": {"commands"}},
        "commands": {
            "target_object_refs": {"objects"},
            "authorization_check_refs": {"permission_checks"},
        },
        "transaction_boundaries": {"command_refs": {"commands"}},
        "permission_checks": {"target_refs": {"objects"}},
        "consistency_requirements": {"target_refs": {"objects", "commands"}},
        "idempotency_contracts": {"command_refs": {"commands"}},
        "unknown_outcome_contracts": {"command_refs": {"commands"}},
    }.items():
        for item in _items(design.get(collection)):
            if not isinstance(item, dict) or not _is_active(item) or not _valid_id(item.get("stable_id")):
                continue
            item_id = item["stable_id"]
            for field, expected in fields.items():
                value = item.get(field)
                refs = [value] if isinstance(value, str) else _string_list(value)
                for ref in refs:
                    require(ref, expected, item_id, field)


def _validate_acceptance(
    value: Any,
    item_by_id: dict[str, dict[str, Any]],
    design_path: Path | None,
    add: Any,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        add("PACKAGE_ACCEPTANCE_MISSING", "P2", "package_acceptance must be an object.", field="package_acceptance")
        return {}
    if value.get("status") not in {"PENDING", "ACCEPTED", "REJECTED"}:
        add("PACKAGE_ACCEPTANCE_STATUS_INVALID", "P1", "package_acceptance.status is invalid.", field="package_acceptance.status")
    accepted_ids = _string_list(value.get("accepted_architecture_ids"))
    if not _valid_string_list(value.get("accepted_architecture_ids"), allow_empty=True):
        add("PACKAGE_ACCEPTANCE_IDS_INVALID", "P1", "accepted_architecture_ids must be a string-only array.", field="package_acceptance.accepted_architecture_ids")
    proposed = {item_id for item_id, item in item_by_id.items() if item.get("classification") == "PROPOSED_ARCHITECTURE"}
    for item_id in accepted_ids:
        if item_id not in proposed:
            add("ACCEPTED_ARCHITECTURE_ID_UNKNOWN", "P1", f"Acceptance names an ID that is not proposed architecture: {item_id}.", item_id=item_id)
    if value.get("status") == "ACCEPTED":
        for field in ("accepted_by", "accepted_by_ref", "confirmation_ref"):
            if not _nonempty(value.get(field)):
                add("PACKAGE_ACCEPTANCE_DETAIL_MISSING", "P1", f"Accepted package requires {field}.", field=f"package_acceptance.{field}")
        if not _valid_timestamp(value.get("accepted_at")):
            add("PACKAGE_ACCEPTANCE_TIME_INVALID", "P1", "accepted_at must be timezone-aware ISO-8601.", field="package_acceptance.accepted_at")
        elif _is_future_timestamp(value.get("accepted_at")):
            add("PACKAGE_ACCEPTANCE_TIME_FUTURE", "P1", "accepted_at cannot be in the future.", field="package_acceptance.accepted_at")
        _validate_local_evidence(
            value,
            ref_field="confirmation_ref",
            digest_field="confirmation_sha256",
            prefix="PACKAGE_ACCEPTANCE",
            design_path=design_path,
            add=add,
        )
    return value


def _validate_quality_review(value: Any, gate: str | None, design_path: Path | None, add: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        add("QUALITY_REVIEW_MISSING", "P1", "quality_review must be an object.", field="quality_review")
        return {}
    if value.get("status") not in {"PENDING", "PASSED", "FAILED"}:
        add("QUALITY_REVIEW_STATUS_INVALID", "P1", "quality_review.status is invalid.", field="quality_review.status")
    findings = value.get("findings")
    if not isinstance(findings, list):
        add("QUALITY_FINDINGS_INVALID", "P1", "quality_review.findings must be an array.", field="quality_review.findings")
        findings = []
    for finding in findings:
        if not isinstance(finding, dict):
            add("QUALITY_FINDING_INVALID", "P1", "Every quality finding must be an object.")
            continue
        for field in ("finding_id", "severity", "status", "affects_gate", "message"):
            if not _nonempty(finding.get(field)):
                add("QUALITY_FINDING_FIELD_MISSING", "P1", f"Quality finding requires {field}.", field=field)
        if finding.get("severity") not in {"P1", "P2", "P3"}:
            add("QUALITY_FINDING_SEVERITY_INVALID", "P1", "Quality finding severity is invalid.")
        if finding.get("status") not in {"OPEN", "RESOLVED", "ACCEPTED_RISK"}:
            add("QUALITY_FINDING_STATUS_INVALID", "P1", "Quality finding status is invalid.")
        if finding.get("affects_gate") not in {*GATES, "BOTH"}:
            add("QUALITY_FINDING_GATE_INVALID", "P1", "Quality finding affects_gate must name READY_FOR_SPEC, READY_FOR_TICKETS, or BOTH.")
        if finding.get("severity") == "P1" and finding.get("status") != "RESOLVED":
            add("P1_QUALITY_FINDING_PRESENT", "P1", "A P1 finding must be resolved; it cannot be accepted as risk for readiness.", item_id=finding.get("finding_id"))
        if finding.get("status") == "OPEN" and finding.get("severity") in {"P1", "P2"} and finding.get("affects_gate") in {gate, "BOTH"}:
            add("UNRESOLVED_QUALITY_FINDING", "P1", "Open P1/P2 quality finding blocks the requested gate.", item_id=finding.get("finding_id"))
    if value.get("status") == "PASSED":
        for field in ("reviewed_by", "reviewed_by_ref", "review_ref"):
            if not _nonempty(value.get(field)):
                add("QUALITY_REVIEW_DETAIL_MISSING", "P1", f"Passed review requires {field}.", field=f"quality_review.{field}")
        if not _valid_timestamp(value.get("reviewed_at")):
            add("QUALITY_REVIEW_TIME_INVALID", "P1", "reviewed_at must be timezone-aware ISO-8601.", field="quality_review.reviewed_at")
        elif _is_future_timestamp(value.get("reviewed_at")):
            add("QUALITY_REVIEW_TIME_FUTURE", "P1", "reviewed_at cannot be in the future.", field="quality_review.reviewed_at")
        _validate_local_evidence(
            value,
            ref_field="review_ref",
            digest_field="review_sha256",
            prefix="QUALITY_REVIEW",
            design_path=design_path,
            add=add,
        )
    return value


def _validate_admission(value: Any, design_path: Path | None, design: dict[str, Any], add: Any) -> None:
    if not isinstance(value, dict):
        add("ADMISSION_EVIDENCE_MISSING", "P1", "admission must identify the Product Readiness or project-declared gate.", field="admission")
        return
    if value.get("gate_kind") not in {"PRODUCT_READINESS_RECEIPT", "PROJECT_DECLARED_GATE"}:
        add("ADMISSION_GATE_KIND_INVALID", "P1", "admission.gate_kind is invalid.", field="admission.gate_kind")
    for field in ("ref", "version", "verifier"):
        if not _nonempty(value.get(field)):
            add("ADMISSION_FIELD_MISSING", "P1", f"admission requires {field}.", field=f"admission.{field}")
    if not isinstance(value.get("content_sha256"), str) or not SHA256_PATTERN.fullmatch(value["content_sha256"]):
        add("ADMISSION_DIGEST_INVALID", "P1", "admission.content_sha256 must be 64 hexadecimal characters.", field="admission.content_sha256")
    if value.get("verdict") != "PASS":
        add("ADMISSION_NOT_PASSED", "P1", "The upstream admission gate must have verdict PASS.", field="admission.verdict")
    ref = value.get("ref")
    digest = value.get("content_sha256")
    if design_path is None or not _nonempty(ref):
        return
    if not _is_local_ref(ref):
        add("ADMISSION_NOT_LOCALLY_VERIFIABLE", "P1", "Admission must reference a locally verifiable immutable receipt.", field="admission.ref")
        return
    resolved = _resolve_local_ref(ref, design_path)
    if resolved is None:
        add("ADMISSION_REF_NOT_FOUND", "P1", f"Local admission evidence does not exist: {ref}.", field="admission.ref")
        return
    if isinstance(digest, str) and SHA256_PATTERN.fullmatch(digest):
        try:
            actual = hashlib.sha256(resolved.read_bytes()).hexdigest()
        except OSError as error:
            add("ADMISSION_REF_UNREADABLE", "P1", f"Admission bytes cannot be read: {error}.", field="admission.ref")
            return
        if actual.lower() != digest.lower():
            add("ADMISSION_DIGEST_MISMATCH", "P1", "Local admission evidence bytes do not match content_sha256.", field="admission.content_sha256")
            return
    if value.get("gate_kind") != "PRODUCT_READINESS_RECEIPT":
        add("ADMISSION_VERIFIER_UNSUPPORTED", "P1", "Project-declared admission requires a registered verifier extension; the core validator cannot self-attest it.", field="admission.verifier")
        return
    if value.get("version") != SUPPORTED_ADMISSION_VERIFIER or value.get("verifier") != SUPPORTED_ADMISSION_VERIFIER:
        add("ADMISSION_VERIFIER_UNSUPPORTED", "P1", f"Product Readiness admission requires {SUPPORTED_ADMISSION_VERIFIER}.", field="admission.verifier")
        return
    valid, summary = _run_product_readiness_verifier(resolved)
    if not valid:
        add("ADMISSION_VERIFICATION_FAILED", "P1", f"Product Readiness receipt verifier rejected the evidence: {summary}.", field="admission.ref")
    elif isinstance(summary, dict) and summary.get("target") != design.get("target"):
        add("ADMISSION_TARGET_MISMATCH", "P1", "Product Readiness receipt target does not match this data design target.", field="admission.ref")
    elif isinstance(summary, dict):
        receipt_sources = {
            (resolved.parent / source["path"]).resolve()
            for source in summary.get("checkedSources", [])
            if isinstance(source, dict) and _nonempty(source.get("path")) and source.get("status") == "CURRENT"
        }
        design_sources = {
            source_path.resolve()
            for authority in _items(design.get("source_authorities"))
            if isinstance(authority, dict)
            and authority.get("authority_status") in CONFIRMED_AUTHORITY_STATUSES
            and _nonempty(authority.get("ref"))
            and _is_local_ref(authority["ref"])
            and (source_path := _resolve_local_ref(authority["ref"], design_path)) is not None
        }
        if design_sources != receipt_sources:
            add("ADMISSION_AUTHORITY_SET_MISMATCH", "P1", "Data-design authorities must equal the current canonical source set verified by Product Readiness.", field="source_authorities")


def _validate_local_evidence(
    value: dict[str, Any],
    *,
    ref_field: str,
    digest_field: str,
    prefix: str,
    design_path: Path | None,
    add: Any,
) -> None:
    digest = value.get(digest_field)
    if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(digest):
        add(f"{prefix}_DIGEST_INVALID", "P1", f"{digest_field} must be 64 hexadecimal characters.", field=digest_field)
        return
    if design_path is None:
        return
    ref = value.get(ref_field)
    if not _nonempty(ref) or not _is_local_ref(ref):
        add(f"{prefix}_NOT_LOCALLY_VERIFIABLE", "P1", f"{ref_field} must resolve to locally verifiable immutable bytes.", field=ref_field)
        return
    resolved = _resolve_local_ref(ref, design_path)
    if resolved is None:
        add(f"{prefix}_REF_NOT_FOUND", "P1", f"Evidence does not exist: {ref}.", field=ref_field)
        return
    try:
        actual = hashlib.sha256(resolved.read_bytes()).hexdigest()
    except OSError as error:
        add(f"{prefix}_REF_UNREADABLE", "P1", f"Evidence bytes cannot be read: {error}.", field=ref_field)
        return
    if actual.lower() != digest.lower():
        add(f"{prefix}_DIGEST_MISMATCH", "P1", f"Evidence bytes do not match {digest_field}.", field=digest_field)


def _run_product_readiness_verifier(receipt_path: Path) -> tuple[bool, dict[str, Any] | str]:
    verifier_path = Path(__file__).resolve().parents[2] / "product-readiness" / "scripts" / "readiness-receipt.mjs"
    if not verifier_path.is_file():
        return False, f"registered verifier is missing: {verifier_path}"
    try:
        completed = subprocess.run(
            ["node", str(verifier_path), "verify", str(receipt_path), "--json"],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return False, str(error)
    try:
        summary = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return False, (completed.stderr or completed.stdout or f"exit {completed.returncode}").strip()
    return completed.returncode == 0 and summary.get("valid") is True, summary


def _validate_contract_tests(
    design: dict[str, Any],
    item_by_id: dict[str, dict[str, Any]],
    collection_by_id: dict[str, str],
    gate: str | None,
    design_path: Path | None,
    add: Any,
) -> dict[str, set[str]]:
    covered = {"LOGICAL": set(), "PHYSICAL": set(), "END_TO_END": set()}
    for test in _items(design.get("contract_tests")):
        if not isinstance(test, dict) or not _valid_id(test.get("stable_id")) or not _is_active(test):
            continue
        level = test.get("test_level")
        if level not in covered:
            add("CONTRACT_TEST_LEVEL_INVALID", "P1", "Contract test requires LOGICAL, PHYSICAL, or END_TO_END test_level.", item_id=test["stable_id"])
            continue
        if gate == "READY_FOR_TICKETS" and level in {"PHYSICAL", "END_TO_END"}:
            required_evidence = ("evidence_ref", "evidence_sha256", "runner", "run_at", "result")
            if any(not _nonempty(test.get(field)) for field in required_evidence):
                add("PHYSICAL_TEST_EVIDENCE_MISSING", "P1", "Physical readiness requires immutable executed-test evidence, runner, time, and result.", item_id=test["stable_id"])
            else:
                if test.get("result") != "PASS":
                    add("PHYSICAL_TEST_RESULT_NOT_PASS", "P1", "Physical test evidence must record result PASS.", item_id=test["stable_id"])
                if not _valid_timestamp(test.get("run_at")) or _is_future_timestamp(test.get("run_at")):
                    add("PHYSICAL_TEST_TIME_INVALID", "P1", "Physical test run_at must be a non-future timezone-aware timestamp.", item_id=test["stable_id"])
                _validate_local_evidence(
                    test,
                    ref_field="evidence_ref",
                    digest_field="evidence_sha256",
                    prefix="PHYSICAL_TEST",
                    design_path=design_path,
                    add=add,
                )
        for target in _string_list(test.get("covers")):
            if target not in item_by_id:
                add("CONTRACT_TEST_TARGET_UNKNOWN", "P1", f"Contract test covers unknown item: {target}.", item_id=test["stable_id"])
            elif collection_by_id.get(target) == "contract_tests":
                add("CONTRACT_TEST_COVERS_TEST", "P2", "Contract tests must cover behavior, not other tests.", item_id=test["stable_id"])
            else:
                covered[level].add(target)
    logical_covered = covered["LOGICAL"] | covered["END_TO_END"]
    for collection in LOGICAL_BEHAVIOR_COLLECTIONS:
        for item in _items(design.get(collection)):
            if isinstance(item, dict) and _is_active(item) and _valid_id(item.get("stable_id")) and item["stable_id"] not in logical_covered:
                add("MATERIAL_ITEM_UNTESTED", "P2", f"{collection} item lacks logical contract-test coverage.", item_id=item["stable_id"])
    return covered


def _validate_source_graph(item_by_id: dict[str, dict[str, Any]], authority_status_by_id: dict[str, str], add: Any) -> None:
    state: dict[str, int] = {}

    def visit(item_id: str, path: list[str]) -> None:
        state[item_id] = 1
        for ref in _string_list(item_by_id[item_id].get("source_refs")):
            if ref not in item_by_id:
                continue
            if state.get(ref) == 1:
                start = path.index(ref) if ref in path else 0
                add("SOURCE_REFERENCE_CYCLE", "P1", f"Material source references contain a cycle: {' -> '.join([*path[start:], ref])}.", item_id=item_id)
            elif state.get(ref, 0) == 0:
                visit(ref, [*path, ref])
        state[item_id] = 2

    for item_id in item_by_id:
        if state.get(item_id, 0) == 0:
            visit(item_id, [item_id])

    def reaches_confirmed(item_id: str, active: set[str] | None = None) -> bool:
        active = set() if active is None else set(active)
        if item_id in active:
            return False
        active.add(item_id)
        for ref in _string_list(item_by_id[item_id].get("source_refs")):
            if authority_status_by_id.get(ref) in CONFIRMED_AUTHORITY_STATUSES:
                return True
            if ref in item_by_id and reaches_confirmed(ref, active):
                return True
        return False

    for item_id, item in item_by_id.items():
        if item.get("classification") == "DERIVED_FROM_AUTHORITY" and not reaches_confirmed(item_id):
            add("DERIVATION_LACKS_CONFIRMED_AUTHORITY", "P1", "DERIVED_FROM_AUTHORITY must trace to confirmed canonical authority.", item_id=item_id)


def _validate_readiness(
    design: dict[str, Any],
    status: Any,
    gate: str | None,
    item_by_id: dict[str, dict[str, Any]],
    collection_by_id: dict[str, str],
    acceptance: dict[str, Any],
    quality_review: dict[str, Any],
    covered_by_level: dict[str, set[str]],
    add: Any,
) -> None:
    if gate == "READY_FOR_SPEC" and status not in {"READY_FOR_SPEC", "READY_FOR_TICKETS"}:
        add("LOGICAL_GATE_STATUS_MISMATCH", "P1", "The design status does not satisfy READY_FOR_SPEC.")
    if gate == "READY_FOR_TICKETS" and status != "READY_FOR_TICKETS":
        add("PHYSICAL_GATE_STATUS_MISMATCH", "P1", "The design status does not satisfy READY_FOR_TICKETS.")
    logical_model = design.get("logical_model")
    if not isinstance(logical_model, dict) or logical_model.get("status") != "COMPLETE":
        add("LOGICAL_MODEL_NOT_COMPLETE", "P1", "A readiness gate requires logical_model.status COMPLETE.")
    for collection in CRITICAL_LOGICAL_COLLECTIONS:
        active = [item for item in _items(design.get(collection)) if isinstance(item, dict) and _is_active(item)]
        if not active:
            add("CRITICAL_LOGICAL_AREA_NOT_ACTIVE", "P1", f"Readiness requires active, validated {collection} material.", field=collection)
    active_objects = [item for item in _items(design.get("objects")) if isinstance(item, dict) and _is_active(item)]
    active_relationships = [item for item in _items(design.get("relationships")) if isinstance(item, dict) and _is_active(item)]
    if len(active_objects) > 1 and not active_relationships:
        add("RELATIONSHIP_MODEL_INCOMPLETE", "P1", "A design with multiple active business objects must explicitly model their relationships.", field="relationships")
    if acceptance.get("status") != "ACCEPTED":
        add("PACKAGE_NOT_ACCEPTED", "P1", "A readiness gate requires package-level user acceptance.")
    if quality_review.get("status") != "PASSED":
        add("QUALITY_REVIEW_NOT_PASSED", "P1", "A readiness gate requires a passed quality review.")

    proposed = {item_id for item_id, item in item_by_id.items() if item.get("classification") == "PROPOSED_ARCHITECTURE"}
    accepted = set(_string_list(acceptance.get("accepted_architecture_ids")))
    if proposed != accepted:
        missing = sorted(proposed - accepted)
        extra = sorted(accepted - proposed)
        if missing:
            add("ARCHITECTURE_NOT_ACCEPTED", "P1", f"Proposed architecture lacks acceptance: {', '.join(missing)}.")
        if extra:
            add("ACCEPTED_ARCHITECTURE_ID_UNKNOWN", "P1", f"Acceptance contains non-proposed IDs: {', '.join(extra)}.")

    for item_id, raw in item_by_id.items():
        collection = collection_by_id[item_id]
        if collection in {"blocked_items", "out_of_scope", "physical_adapters", "migration_requirements"}:
            continue
        if _is_active(raw) and raw.get("validation_status") in {"PROPOSED", "BLOCKED"}:
            add("LOGICAL_ITEM_NOT_VALIDATED", "P1", "Logical readiness cannot include proposed or blocked active material.", item_id=item_id)

    for blocker in _items(design.get("blocked_items")):
        if not isinstance(blocker, dict):
            continue
        if gate == "READY_FOR_SPEC" and blocker.get("blocks") in {"LOGICAL", "BOTH"}:
            add("LOGICAL_BLOCKER_PRESENT", "P1", "A logical blocker prevents READY_FOR_SPEC.", item_id=blocker.get("stable_id"))
        if gate == "READY_FOR_TICKETS":
            add("PHYSICAL_BLOCKER_PRESENT", "P1", "Any blocker prevents READY_FOR_TICKETS.", item_id=blocker.get("stable_id"))

    if gate != "READY_FOR_TICKETS":
        return

    selected = [item for item in _items(design.get("physical_adapters")) if isinstance(item, dict) and item.get("selected") is True]
    if len(selected) != 1:
        add("PHYSICAL_ADAPTER_SELECTION_COUNT", "P1", f"READY_FOR_TICKETS requires exactly one selected adapter; found {len(selected)}.")
    for adapter in selected:
        if adapter.get("validation_status") != "VALIDATED":
            add("PHYSICAL_ADAPTER_NOT_VALIDATED", "P1", "Selected physical adapter must be validated.", item_id=adapter.get("stable_id"))
    migrations = [item for item in _items(design.get("migration_requirements")) if isinstance(item, dict) and _is_active(item)]
    if not migrations:
        add("MIGRATION_REQUIREMENTS_MISSING", "P1", "READY_FOR_TICKETS requires active migration requirements.")
    for migration in migrations:
        if migration.get("validation_status") != "VALIDATED":
            add("MIGRATION_REQUIREMENT_NOT_VALIDATED", "P1", "Migration requirements must be validated.", item_id=migration.get("stable_id"))

    physical_tests = [
        test for test in _items(design.get("contract_tests"))
        if isinstance(test, dict) and _is_active(test) and test.get("test_level") in {"PHYSICAL", "END_TO_END"}
    ]
    if not physical_tests:
        add("PHYSICAL_TESTS_MISSING", "P1", "READY_FOR_TICKETS requires physical or end-to-end contract tests.")
    categories = {
        category
        for test in physical_tests
        for category in _string_list(test.get("coverage_categories"))
    }
    for category in sorted(PHYSICAL_TEST_CATEGORIES - categories):
        add("PHYSICAL_TEST_CATEGORY_MISSING", "P1", f"Physical readiness lacks {category} test coverage.", field="contract_tests.coverage_categories")
    for test in physical_tests:
        target_collections = {
            collection_by_id[target]
            for target in _string_list(test.get("covers"))
            if target in collection_by_id
        }
        for category in _string_list(test.get("coverage_categories")):
            expected = PHYSICAL_CATEGORY_TARGETS.get(category)
            if expected is not None and target_collections.isdisjoint(expected):
                add(
                    "PHYSICAL_TEST_CATEGORY_TARGET_MISMATCH",
                    "P1",
                    f"{category} evidence must cover at least one {sorted(expected)} contract.",
                    item_id=test.get("stable_id"),
                    field="coverage_categories",
                )
    physical_covered = covered_by_level["PHYSICAL"] | covered_by_level["END_TO_END"]
    for item in [*selected, *migrations]:
        if _valid_id(item.get("stable_id")) and item["stable_id"] not in physical_covered:
            add("PHYSICAL_ITEM_UNTESTED", "P1", "Selected adapter or migration lacks physical test coverage.", item_id=item["stable_id"])


def _valid_id(value: Any) -> bool:
    return isinstance(value, str) and bool(STABLE_ID_PATTERN.fullmatch(value.strip()))


def _result(design: Any, required_gate: str | None, findings: list[Finding]) -> dict[str, Any]:
    ordered = sorted(findings, key=lambda finding: ({"P1": 0, "P2": 1, "P3": 2}.get(finding.severity, 9), finding.code, finding.item_id or ""))
    counts = Counter(finding.severity for finding in ordered)
    verdict = "PASS" if counts["P1"] == 0 and counts["P2"] == 0 else "FAIL"
    return {
        "schema_version": SCHEMA_VERSION,
        "validator_version": VALIDATOR_VERSION,
        "design_id": design.get("design_id") if isinstance(design, dict) else None,
        "required_gate": required_gate,
        "verdict": verdict,
        "counts": {severity: counts[severity] for severity in ("P1", "P2", "P3")},
        "findings": [asdict(finding) for finding in ordered],
    }


def _format_text(result: dict[str, Any]) -> str:
    lines = [
        f"Operational data design: {result.get('design_id') or '<unknown>'}",
        f"Validator: {result['validator_version']}",
        f"Gate: {result.get('required_gate') or 'STRUCTURAL'}",
        f"Verdict: {result['verdict']}",
        f"Findings: P1={result['counts']['P1']} P2={result['counts']['P2']} P3={result['counts']['P3']}",
    ]
    for finding in result["findings"]:
        location = finding.get("item_id") or finding.get("field") or "design"
        lines.append(f"[{finding['severity']}] {finding['code']} ({location}): {finding['message']}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("design", type=Path, help="Path to operational-data-design.json")
    gate_group = parser.add_mutually_exclusive_group()
    gate_group.add_argument("--require-logical-ready", action="store_true")
    gate_group.add_argument("--require-physical-ready", action="store_true")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    args = parser.parse_args(argv)
    try:
        design = json.loads(args.design.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"Design file not found: {args.design}", file=sys.stderr)
        return 2
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        print(f"Unable to read design JSON: {error}", file=sys.stderr)
        return 2
    gate = "READY_FOR_SPEC" if args.require_logical_ready else "READY_FOR_TICKETS" if args.require_physical_ready else None
    result = validate_design(design, gate, args.design)
    print(json.dumps(result, ensure_ascii=False, indent=2) if args.format == "json" else _format_text(result))
    return 0 if result["verdict"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
