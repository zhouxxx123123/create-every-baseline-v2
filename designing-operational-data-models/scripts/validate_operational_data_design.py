#!/usr/bin/env python3
"""Validate a database-neutral operational data design contract."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable


VALIDATOR_VERSION = "1.0.0"
SCHEMA_VERSION = "1.0"

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
LOGICAL_COVERAGE_COLLECTIONS = (
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
STABLE_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9._:-]{2,127}$")


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


def _duplicates(values: Iterable[str]) -> list[str]:
    return sorted(value for value, count in Counter(values).items() if value and count > 1)


def validate_design(design: Any, required_gate: str | None = None) -> dict[str, Any]:
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
        add(
            "SCHEMA_VERSION_INVALID",
            "P1",
            f"schema_version must be {SCHEMA_VERSION}.",
            field="schema_version",
        )

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
    for raw in _items(design.get("source_authorities")):
        if not isinstance(raw, dict):
            add("AUTHORITY_NOT_OBJECT", "P1", "Every source authority must be an object.")
            continue
        item_id = raw.get("stable_id")
        if not _valid_id(item_id):
            add("AUTHORITY_ID_INVALID", "P1", "Authority stable_id is missing or invalid.", item_id=str(item_id))
            continue
        authority_ids.append(item_id)
        authority_status_by_id[item_id] = str(raw.get("authority_status") or "")
        for field in ("ref", "authority_kind", "authority_status"):
            if not _nonempty(raw.get(field)):
                add(
                    "AUTHORITY_FIELD_MISSING",
                    "P1",
                    f"Authority requires {field}.",
                    item_id=item_id,
                    field=field,
                )

    if not authority_ids:
        add("NO_SOURCE_AUTHORITY", "P1", "At least one precise source authority is required.")

    prototype_ids: list[str] = []
    for raw in _items(design.get("prototype_evidence")):
        if not isinstance(raw, dict):
            add("PROTOTYPE_NOT_OBJECT", "P1", "Every prototype evidence entry must be an object.")
            continue
        item_id = raw.get("stable_id")
        if not _valid_id(item_id):
            add("PROTOTYPE_ID_INVALID", "P1", "Prototype stable_id is missing or invalid.", item_id=str(item_id))
            continue
        prototype_ids.append(item_id)
        for field in ("ref", "review_status"):
            if not _nonempty(raw.get(field)):
                add(
                    "PROTOTYPE_FIELD_MISSING",
                    "P1",
                    f"Prototype evidence requires {field}.",
                    item_id=item_id,
                    field=field,
                )
        if not _string_list(raw.get("source_refs")):
            add("PROTOTYPE_SOURCE_REFS_MISSING", "P1", "Prototype evidence requires source_refs.", item_id=item_id)
        if not _string_list(raw.get("admitted_ids")):
            add("PROTOTYPE_ADMITTED_IDS_MISSING", "P2", "Prototype evidence requires exact admitted_ids.", item_id=item_id)

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
            if not _string_list(raw.get("source_refs")):
                add("SOURCE_REFS_MISSING", "P1", "Material item requires non-empty source_refs.", item_id=item_id)
            classification = raw.get("classification")
            if classification not in CLASSIFICATIONS:
                add("CLASSIFICATION_INVALID", "P1", f"Unsupported classification: {classification!r}.", item_id=item_id)
            if not _nonempty(raw.get("rationale")):
                add("RATIONALE_MISSING", "P2", "Material item requires rationale.", item_id=item_id)
            validation_status = raw.get("validation_status")
            if validation_status not in VALIDATION_STATUSES:
                add("VALIDATION_STATUS_INVALID", "P1", f"Unsupported validation_status: {validation_status!r}.", item_id=item_id)
            if collection == "blocked_items":
                if classification not in BLOCKED_CLASSIFICATIONS:
                    add("BLOCKER_CLASSIFICATION_INVALID", "P1", "blocked_items must use a BLOCKED_* classification.", item_id=item_id)
                if raw.get("blocks") not in BLOCK_LEVELS:
                    add("BLOCK_LEVEL_INVALID", "P1", "A blocker must declare LOGICAL, PHYSICAL, or BOTH.", item_id=item_id)
                if validation_status != "BLOCKED":
                    add("BLOCKER_STATUS_INVALID", "P1", "A blocker must use validation_status BLOCKED.", item_id=item_id)
            elif classification in BLOCKED_CLASSIFICATIONS:
                add("BLOCKER_IN_WRONG_COLLECTION", "P1", "BLOCKED_* items belong in blocked_items.", item_id=item_id)

    for duplicate in _duplicates([*authority_ids, *prototype_ids, *material_ids]):
        add("DUPLICATE_STABLE_ID", "P1", f"Stable ID is not globally unique: {duplicate}.", item_id=duplicate)

    known_ids = set(authority_ids) | set(prototype_ids) | set(material_ids)
    for item_id, raw in item_by_id.items():
        for ref in _items(raw.get("source_refs")):
            if isinstance(ref, str) and ref not in known_ids:
                add("UNKNOWN_SOURCE_REF", "P1", f"Unknown source reference: {ref}.", item_id=item_id)
            if ref == item_id:
                add("SELF_SOURCE_REF", "P1", "A material item cannot cite itself as a source.", item_id=item_id)

    for raw in _items(design.get("prototype_evidence")):
        if not isinstance(raw, dict):
            continue
        item_id = raw.get("stable_id")
        for ref in _items(raw.get("source_refs")):
            if isinstance(ref, str) and ref not in set(authority_ids):
                add("PROTOTYPE_AUTHORITY_REF_INVALID", "P1", f"Prototype source ref is not an authority: {ref}.", item_id=str(item_id))

    _validate_source_graph(item_by_id, authority_status_by_id, add)

    for collection in LOGICAL_COVERAGE_COLLECTIONS:
        if not _items(design.get(collection)):
            add("LOGICAL_AREA_UNCOVERED", "P2", f"Declare at least one {collection} item, including explicit NOT_APPLICABLE coverage.", field=collection)

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

    acceptance = design.get("package_acceptance")
    if not isinstance(acceptance, dict):
        add("PACKAGE_ACCEPTANCE_MISSING", "P2", "package_acceptance must be an object.", field="package_acceptance")
        acceptance = {}
    elif acceptance.get("status") not in {"PENDING", "ACCEPTED", "REJECTED"}:
        add("PACKAGE_ACCEPTANCE_STATUS_INVALID", "P1", "package_acceptance.status is invalid.", field="package_acceptance.status")

    contract_test_ids = set()
    covered_ids: set[str] = set()
    for test in _items(design.get("contract_tests")):
        if not isinstance(test, dict) or not _valid_id(test.get("stable_id")):
            continue
        contract_test_ids.add(test["stable_id"])
        covers = _string_list(test.get("covers"))
        if not covers:
            add("CONTRACT_TEST_COVERS_MISSING", "P1", "Contract test must list covered design IDs.", item_id=test["stable_id"])
        for covered in covers:
            if covered not in item_by_id:
                add("CONTRACT_TEST_TARGET_UNKNOWN", "P1", f"Contract test covers unknown item: {covered}.", item_id=test["stable_id"])
            elif collection_by_id.get(covered) == "contract_tests":
                add("CONTRACT_TEST_COVERS_TEST", "P2", "Contract tests should cover behavior, not other tests.", item_id=test["stable_id"])
            else:
                covered_ids.add(covered)
        if test.get("test_level") not in {"LOGICAL", "PHYSICAL", "END_TO_END"}:
            add("CONTRACT_TEST_LEVEL_INVALID", "P2", "Contract test requires LOGICAL, PHYSICAL, or END_TO_END test_level.", item_id=test["stable_id"])

    for collection in ("invariants", "commands"):
        for raw in _items(design.get(collection)):
            if isinstance(raw, dict) and _valid_id(raw.get("stable_id")) and raw.get("validation_status") != "NOT_APPLICABLE":
                if raw["stable_id"] not in covered_ids:
                    add("MATERIAL_ITEM_UNTESTED", "P2", f"{collection} item lacks contract-test coverage.", item_id=raw["stable_id"])

    selected_adapters = [
        adapter
        for adapter in _items(design.get("physical_adapters"))
        if isinstance(adapter, dict) and adapter.get("selected") is True
    ]
    if len(selected_adapters) > 1:
        add("MULTIPLE_PHYSICAL_ADAPTERS_SELECTED", "P2", "At most one physical adapter may be selected in a bounded package.")
    for adapter in selected_adapters:
        adapter_kind = str(adapter.get("adapter_kind") or "").upper()
        if adapter_kind == "DBT":
            add("ANALYTICS_ADAPTER_AS_OPERATIONAL_STORE", "P1", "dbt is an analytical handoff, not an operational physical adapter.", item_id=adapter.get("stable_id"))
        if adapter_kind == "SUPABASE":
            if str(adapter.get("base_adapter_kind") or "").upper() != "POSTGRESQL":
                add("SUPABASE_POSTGRES_BASE_MISSING", "P1", "A Supabase adapter must declare PostgreSQL as its base adapter.", item_id=adapter.get("stable_id"))
            if not _string_list(adapter.get("permission_contract_refs")):
                add("SUPABASE_PERMISSION_CONTRACT_MISSING", "P1", "A Supabase adapter must reference the approved product permission contract before mapping RLS.", item_id=adapter.get("stable_id"))

    gate = required_gate
    if gate is None and isinstance(handoff, dict) and handoff.get("requested_gate") in GATES:
        gate = handoff["requested_gate"]

    if status in GATES or required_gate is not None:
        _validate_readiness(
            design,
            status,
            gate,
            item_by_id,
            acceptance,
            add,
        )

    return _result(design, required_gate, findings)


def _validate_source_graph(
    item_by_id: dict[str, dict[str, Any]],
    authority_status_by_id: dict[str, str],
    add: Any,
) -> None:
    state: dict[str, int] = {}
    confirmed_statuses = {"CONFIRMED", "CONFIRMED_AND_VALIDATED"}

    def visit(item_id: str, path: list[str]) -> None:
        state[item_id] = 1
        item = item_by_id[item_id]
        for ref in _string_list(item.get("source_refs")):
            if ref not in item_by_id:
                continue
            if state.get(ref) == 1:
                start = path.index(ref) if ref in path else 0
                cycle = [*path[start:], ref]
                add(
                    "SOURCE_REFERENCE_CYCLE",
                    "P1",
                    f"Material source references contain a cycle: {' -> '.join(cycle)}.",
                    item_id=item_id,
                )
            elif state.get(ref, 0) == 0:
                visit(ref, [*path, ref])
        state[item_id] = 2

    for item_id in item_by_id:
        if state.get(item_id, 0) == 0:
            visit(item_id, [item_id])

    def reaches_confirmed_authority(item_id: str, active: set[str] | None = None) -> bool:
        active = set() if active is None else set(active)
        if item_id in active:
            return False
        active.add(item_id)
        for ref in _string_list(item_by_id[item_id].get("source_refs")):
            if authority_status_by_id.get(ref) in confirmed_statuses:
                return True
            if ref in item_by_id and reaches_confirmed_authority(ref, active):
                return True
        return False

    for item_id, item in item_by_id.items():
        if item.get("classification") == "DERIVED_FROM_AUTHORITY" and not reaches_confirmed_authority(item_id):
            add(
                "DERIVATION_LACKS_CONFIRMED_AUTHORITY",
                "P1",
                "DERIVED_FROM_AUTHORITY must trace to a confirmed canonical authority, not research or implementation evidence alone.",
                item_id=item_id,
            )


def _validate_readiness(
    design: dict[str, Any],
    status: Any,
    gate: str | None,
    item_by_id: dict[str, dict[str, Any]],
    acceptance: dict[str, Any],
    add: Any,
) -> None:
    if gate == "READY_FOR_SPEC" and status not in {"READY_FOR_SPEC", "READY_FOR_TICKETS"}:
        add("LOGICAL_GATE_STATUS_MISMATCH", "P1", "The design status does not satisfy READY_FOR_SPEC.")
    if gate == "READY_FOR_TICKETS" and status != "READY_FOR_TICKETS":
        add("PHYSICAL_GATE_STATUS_MISMATCH", "P1", "The design status does not satisfy READY_FOR_TICKETS.")

    logical_model = design.get("logical_model")
    if not isinstance(logical_model, dict) or logical_model.get("status") != "COMPLETE":
        add("LOGICAL_MODEL_NOT_COMPLETE", "P1", "A readiness gate requires logical_model.status COMPLETE.")

    if acceptance.get("status") != "ACCEPTED":
        add("PACKAGE_NOT_ACCEPTED", "P1", "A readiness gate requires package-level user acceptance.")
    for field in ("accepted_by", "accepted_at"):
        if not _nonempty(acceptance.get(field)):
            add("PACKAGE_ACCEPTANCE_DETAIL_MISSING", "P1", f"Accepted package requires {field}.", field=f"package_acceptance.{field}")

    accepted_architecture_ids = set(_string_list(acceptance.get("accepted_architecture_ids")))
    for item_id, raw in item_by_id.items():
        collection = next(
            (name for name in MATERIAL_COLLECTIONS if raw in _items(design.get(name))),
            None,
        )
        if collection in {"blocked_items", "out_of_scope", "physical_adapters", "migration_requirements"}:
            continue
        if raw.get("validation_status") in {"PROPOSED", "BLOCKED"}:
            add("LOGICAL_ITEM_NOT_VALIDATED", "P1", "Logical readiness cannot include proposed or blocked material.", item_id=item_id)
        if raw.get("classification") == "PROPOSED_ARCHITECTURE" and item_id not in accepted_architecture_ids:
            add("ARCHITECTURE_NOT_ACCEPTED", "P1", "Proposed architecture lacks explicit package acceptance.", item_id=item_id)

    for blocker in _items(design.get("blocked_items")):
        if not isinstance(blocker, dict):
            continue
        block_level = blocker.get("blocks")
        if gate == "READY_FOR_SPEC" and block_level in {"LOGICAL", "BOTH"}:
            add("LOGICAL_BLOCKER_PRESENT", "P1", "A logical blocker prevents READY_FOR_SPEC.", item_id=blocker.get("stable_id"))
        if gate == "READY_FOR_TICKETS":
            add("PHYSICAL_BLOCKER_PRESENT", "P1", "Any blocker prevents READY_FOR_TICKETS.", item_id=blocker.get("stable_id"))

    if gate != "READY_FOR_TICKETS":
        return

    selected = [
        adapter
        for adapter in _items(design.get("physical_adapters"))
        if isinstance(adapter, dict) and adapter.get("selected") is True
    ]
    if len(selected) != 1:
        add("PHYSICAL_ADAPTER_SELECTION_COUNT", "P1", f"READY_FOR_TICKETS requires exactly one selected adapter; found {len(selected)}.")
    for adapter in selected:
        if adapter.get("validation_status") != "VALIDATED":
            add("PHYSICAL_ADAPTER_NOT_VALIDATED", "P1", "Selected physical adapter must be validated.", item_id=adapter.get("stable_id"))
        if not _nonempty(adapter.get("adapter_kind")):
            add("PHYSICAL_ADAPTER_KIND_MISSING", "P1", "Selected physical adapter requires adapter_kind.", item_id=adapter.get("stable_id"))

    migrations = [item for item in _items(design.get("migration_requirements")) if isinstance(item, dict)]
    if not migrations:
        add("MIGRATION_REQUIREMENTS_MISSING", "P1", "READY_FOR_TICKETS requires migration requirements, including explicit NOT_APPLICABLE coverage.")
    for migration in migrations:
        if migration.get("validation_status") not in {"VALIDATED", "NOT_APPLICABLE"}:
            add("MIGRATION_REQUIREMENT_NOT_VALIDATED", "P1", "Migration requirements must be validated or explicitly not applicable.", item_id=migration.get("stable_id"))

    physical_tests = [
        test
        for test in _items(design.get("contract_tests"))
        if isinstance(test, dict) and test.get("test_level") in {"PHYSICAL", "END_TO_END"}
    ]
    if not physical_tests:
        add("PHYSICAL_TESTS_MISSING", "P1", "READY_FOR_TICKETS requires physical or end-to-end contract tests.")


def _valid_id(value: Any) -> bool:
    return isinstance(value, str) and bool(STABLE_ID_PATTERN.fullmatch(value.strip()))


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


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

    required_gate = None
    if args.require_logical_ready:
        required_gate = "READY_FOR_SPEC"
    elif args.require_physical_ready:
        required_gate = "READY_FOR_TICKETS"

    result = validate_design(design, required_gate)
    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(_format_text(result))
    return 0 if result["verdict"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
