from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from create_data_design_receipt import BEGIN_MARKER, END_MARKER, build_receipt, main as create_receipt_main  # noqa: E402
from validate_operational_data_design import validate_design  # noqa: E402
from verify_data_design_receipt import verify_receipt  # noqa: E402


def material(stable_id: str, **extra: object) -> dict[str, object]:
    return {
        "stable_id": stable_id,
        "source_refs": ["AUTH-001"],
        "classification": "DERIVED_FROM_AUTHORITY",
        "rationale": "Required by confirmed product authority.",
        "validation_status": "VALIDATED",
        **extra,
    }


def logical_ready_design() -> dict[str, object]:
    return {
        "schema_version": "1.0",
        "design_id": "DATA-DESIGN-001",
        "target": "Bounded work update",
        "boundary": "Persist one accepted update and exclude analytics.",
        "status": "READY_FOR_SPEC",
        "source_authorities": [
            {
                "stable_id": "AUTH-001",
                "ref": "docs/product/decision.md#confirmed-update",
                "authority_kind": "CANONICAL_PRODUCT_DECISION",
                "authority_status": "CONFIRMED",
            }
        ],
        "prototype_evidence": [],
        "objects": [material("OBJ-001", name="Work")],
        "relationships": [],
        "invariants": [material("INV-001", statement="One operation identity creates at most one update fact.")],
        "state_transitions": [material("STATE-001", transition="Pending to accepted")],
        "commands": [material("CMD-001", command="Accept update")],
        "transaction_boundaries": [material("TX-001", boundary="Work state and update fact commit together")],
        "permission_checks": [material("PERM-001", check="Revalidate Data Scope and write permission")],
        "consistency_requirements": [material("CONS-001", guarantee="Expected revision compare-and-swap")],
        "idempotency_contracts": [material("IDEM-001", key_scope="Account plus operation")],
        "unknown_outcome_contracts": [material("UNKNOWN-001", recovery="Query authoritative state before retry")],
        "logical_model": {"status": "COMPLETE", "notes": "Database-neutral."},
        "physical_adapters": [],
        "migration_requirements": [],
        "contract_tests": [
            material(
                "TEST-001",
                test_level="LOGICAL",
                covers=["INV-001", "CMD-001", "TX-001", "PERM-001", "CONS-001", "IDEM-001", "UNKNOWN-001"],
            )
        ],
        "blocked_items": [],
        "out_of_scope": [material("OUT-001", classification="OUT_OF_SCOPE", validation_status="NOT_APPLICABLE", scope="Analytics")],
        "package_acceptance": {
            "status": "ACCEPTED",
            "accepted_by": "Product authority",
            "accepted_at": "2026-08-15T00:00:00Z",
            "accepted_architecture_ids": [],
        },
        "downstream_handoff": {
            "requested_gate": "READY_FOR_SPEC",
            "consumer": "to-spec",
            "notes": "Physical database remains undecided.",
        },
    }


def physical_ready_design() -> dict[str, object]:
    design = logical_ready_design()
    design["status"] = "READY_FOR_TICKETS"
    design["downstream_handoff"]["requested_gate"] = "READY_FOR_TICKETS"  # type: ignore[index]
    design["downstream_handoff"]["consumer"] = "to-tickets"  # type: ignore[index]
    design["physical_adapters"] = [
        material("ADAPTER-001", selected=True, adapter_kind="POSTGRESQL")
    ]
    design["migration_requirements"] = [
        material("MIGRATION-001", strategy="Expand, backfill, validate, contract")
    ]
    design["contract_tests"].append(  # type: ignore[union-attr]
        material("TEST-002", test_level="PHYSICAL", covers=["ADAPTER-001", "MIGRATION-001"])
    )
    return design


class OperationalDataDesignTests(unittest.TestCase):
    def assert_passes(self, design: dict[str, object], gate: str | None = None) -> None:
        result = validate_design(design, gate)
        self.assertEqual("PASS", result["verdict"], result["findings"])

    def assert_fails_with(self, design: dict[str, object], code: str, gate: str | None = None) -> None:
        result = validate_design(design, gate)
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn(code, {finding["code"] for finding in result["findings"]})

    def test_01_logical_ready_package_passes(self) -> None:
        self.assert_passes(logical_ready_design(), "READY_FOR_SPEC")

    def test_02_physical_ready_package_passes(self) -> None:
        self.assert_passes(physical_ready_design(), "READY_FOR_TICKETS")

    def test_03_open_product_question_blocks_logical_gate(self) -> None:
        design = logical_ready_design()
        design["blocked_items"] = [
            material(
                "BLOCK-001",
                classification="BLOCKED_PRODUCT_DECISION",
                validation_status="BLOCKED",
                blocks="LOGICAL",
            )
        ]
        self.assert_fails_with(design, "LOGICAL_BLOCKER_PRESENT", "READY_FOR_SPEC")

    def test_04_physical_only_blocker_allows_spec_but_not_tickets(self) -> None:
        design = logical_ready_design()
        design["blocked_items"] = [
            material(
                "BLOCK-001",
                classification="BLOCKED_TECHNICAL_VALIDATION",
                validation_status="BLOCKED",
                blocks="PHYSICAL",
            )
        ]
        self.assert_passes(design, "READY_FOR_SPEC")
        physical = physical_ready_design()
        physical["blocked_items"] = copy.deepcopy(design["blocked_items"])
        self.assert_fails_with(physical, "PHYSICAL_BLOCKER_PRESENT", "READY_FOR_TICKETS")

    def test_05_database_undecided_cannot_reach_ticket_gate(self) -> None:
        design = logical_ready_design()
        design["status"] = "READY_FOR_TICKETS"
        self.assert_fails_with(design, "PHYSICAL_ADAPTER_SELECTION_COUNT", "READY_FOR_TICKETS")

    def test_06_proposed_architecture_requires_explicit_acceptance(self) -> None:
        design = logical_ready_design()
        design["transaction_boundaries"][0]["classification"] = "PROPOSED_ARCHITECTURE"  # type: ignore[index]
        self.assert_fails_with(design, "ARCHITECTURE_NOT_ACCEPTED", "READY_FOR_SPEC")
        design["package_acceptance"]["accepted_architecture_ids"] = ["TX-001"]  # type: ignore[index]
        self.assert_passes(design, "READY_FOR_SPEC")

    def test_07_unknown_source_reference_fails(self) -> None:
        design = logical_ready_design()
        design["objects"][0]["source_refs"] = ["MISSING"]  # type: ignore[index]
        self.assert_fails_with(design, "UNKNOWN_SOURCE_REF", "READY_FOR_SPEC")

    def test_08_command_requires_contract_test(self) -> None:
        design = logical_ready_design()
        design["contract_tests"][0]["covers"].remove("CMD-001")  # type: ignore[index]
        self.assert_fails_with(design, "MATERIAL_ITEM_UNTESTED", "READY_FOR_SPEC")

    def test_09_unaccepted_package_cannot_be_ready(self) -> None:
        design = logical_ready_design()
        design["package_acceptance"]["status"] = "PENDING"  # type: ignore[index]
        self.assert_fails_with(design, "PACKAGE_NOT_ACCEPTED", "READY_FOR_SPEC")

    def test_10_receipt_round_trip_and_stale_hash_detection(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "operational-data-design.json"
            receipt_path = root / "data-design-receipt.md"
            design_path.write_text(json.dumps(design, ensure_ascii=False, indent=2), encoding="utf-8")
            _, markdown = build_receipt(design_path, receipt_path, "READY_FOR_SPEC")
            receipt_path.write_text(markdown, encoding="utf-8")
            self.assertEqual("PASS", verify_receipt(receipt_path)["verdict"])
            design["boundary"] = "Changed after receipt creation."
            design_path.write_text(json.dumps(design, ensure_ascii=False, indent=2), encoding="utf-8")
            result = verify_receipt(receipt_path)
            self.assertEqual("FAIL", result["verdict"])
            self.assertIn("Design SHA-256 does not match the immutable receipt.", result["errors"])

    def test_11_receipt_creator_refuses_invalid_design(self) -> None:
        design = logical_ready_design()
        design["blocked_items"] = [
            material(
                "BLOCK-001",
                classification="BLOCKED_PRODUCT_DECISION",
                validation_status="BLOCKED",
                blocks="LOGICAL",
            )
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "design.json"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            with self.assertRaises(ValueError):
                build_receipt(design_path, root / "receipt.md", "READY_FOR_SPEC")

    def test_12_cli_runs_from_arbitrary_working_directory(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "design.json"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    str(SCRIPT_DIR / "validate_operational_data_design.py"),
                    str(design_path),
                    "--require-logical-ready",
                    "--format",
                    "json",
                ],
                cwd=root,
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertEqual(0, completed.returncode, completed.stderr or completed.stdout)
        self.assertEqual("PASS", json.loads(completed.stdout)["verdict"])

    def test_13_research_only_authority_cannot_confirm_business_structure(self) -> None:
        design = logical_ready_design()
        design["source_authorities"][0]["authority_status"] = "RESEARCH_ONLY"  # type: ignore[index]
        self.assert_fails_with(design, "DERIVATION_LACKS_CONFIRMED_AUTHORITY", "READY_FOR_SPEC")

    def test_14_source_reference_cycle_fails(self) -> None:
        design = logical_ready_design()
        design["objects"][0]["source_refs"] = ["INV-001"]  # type: ignore[index]
        design["invariants"][0]["source_refs"] = ["OBJ-001"]  # type: ignore[index]
        self.assert_fails_with(design, "SOURCE_REFERENCE_CYCLE", "READY_FOR_SPEC")

    def test_15_dbt_cannot_be_selected_as_operational_adapter(self) -> None:
        design = physical_ready_design()
        design["physical_adapters"][0]["adapter_kind"] = "DBT"  # type: ignore[index]
        self.assert_fails_with(design, "ANALYTICS_ADAPTER_AS_OPERATIONAL_STORE", "READY_FOR_TICKETS")

    def test_16_supabase_requires_postgres_base_and_permission_contract(self) -> None:
        design = physical_ready_design()
        design["physical_adapters"][0]["adapter_kind"] = "SUPABASE"  # type: ignore[index]
        self.assert_fails_with(design, "SUPABASE_POSTGRES_BASE_MISSING", "READY_FOR_TICKETS")
        design["physical_adapters"][0]["base_adapter_kind"] = "POSTGRESQL"  # type: ignore[index]
        design["physical_adapters"][0]["permission_contract_refs"] = ["PERM-001"]  # type: ignore[index]
        self.assert_passes(design, "READY_FOR_TICKETS")

    def test_17_receipt_cli_refuses_overwrite(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "design.json"
            receipt_path = root / "receipt.md"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            self.assertEqual(
                0,
                create_receipt_main(
                    [str(design_path), "--gate", "READY_FOR_SPEC", "--output", str(receipt_path)]
                ),
            )
            original = receipt_path.read_bytes()
            self.assertEqual(
                2,
                create_receipt_main(
                    [str(design_path), "--gate", "READY_FOR_SPEC", "--output", str(receipt_path)]
                ),
            )
            self.assertEqual(original, receipt_path.read_bytes())

    def test_18_receipt_id_tampering_is_detected(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "design.json"
            receipt_path = root / "receipt.md"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            _, markdown = build_receipt(design_path, receipt_path, "READY_FOR_SPEC")
            payload = markdown.split(BEGIN_MARKER, 1)[1].split(END_MARKER, 1)[0].strip()
            record = json.loads(payload)
            record["receipt_id"] = "tampered"
            tampered_payload = json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True)
            receipt_path.write_text(
                markdown.replace(payload, tampered_payload),
                encoding="utf-8",
            )
            result = verify_receipt(receipt_path)
            self.assertEqual("FAIL", result["verdict"])
            self.assertIn("Receipt ID does not match its design, gate, and digest.", result["errors"])


if __name__ == "__main__":
    unittest.main()
