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
    item: dict[str, object] = {
        "stable_id": stable_id,
        "source_refs": ["AUTH-001"],
        "classification": "DERIVED_FROM_AUTHORITY",
        "rationale": "Required by confirmed product authority.",
        "validation_status": "VALIDATED",
        **extra,
    }
    if str(item.get("classification", "")).startswith("BLOCKED_"):
        item.setdefault("question", "Resolve the named blocking contract.")
        item.setdefault("owner", "Originating authority workflow")
        item.setdefault("return_target", "Wayfinder or the named evidence workflow")
    return item


def logical_ready_design() -> dict[str, object]:
    return {
        "schema_version": "1.1",
        "design_id": "DATA-DESIGN-001",
        "target": "Bounded work update",
        "boundary": "Persist one accepted update and exclude analytics.",
        "status": "READY_FOR_SPEC",
        "source_authorities": [
            {
                "stable_id": "AUTH-001",
                "ref": "authority://product/decision/confirmed-update",
                "authority_kind": "CANONICAL_PRODUCT_DECISION",
                "authority_status": "CONFIRMED",
                "version": "decision-revision-7",
                "content_sha256": "a" * 64,
                "currentness_status": "CURRENT",
                "currentness_checked_at": "2026-08-15T00:00:00Z",
            }
        ],
        "prototype_evidence": [],
        "objects": [
            material(
                "OBJ-001",
                name="Work",
                purpose="Hold the current accepted work state.",
                stable_identity="Work ID",
                source_of_truth_owner="WorkforceOS",
                current_state_fields=["status", "revision"],
                immutable_fact_refs=["INV-001"],
                lifecycle="Created, active, completed, retained.",
                retention_ref="RETENTION-WORK",
                content_mode="REFERENCED",
            )
        ],
        "relationships": [],
        "invariants": [
            material(
                "INV-001",
                statement="One operation identity creates at most one update fact.",
                enforcement_point="Command transaction and unique constraint.",
            )
        ],
        "state_transitions": [
            material(
                "STATE-001",
                name="Accept pending update",
                from_state="PENDING",
                to_state="ACCEPTED",
                trigger_ref="CMD-001",
                preconditions=["Work is active"],
                effects=["Accepted update fact exists"],
            )
        ],
        "commands": [
            material(
                "CMD-001",
                name="Accept update",
                target_object_refs=["OBJ-001"],
                actor_contract="Authorized account member",
                authorization_check_refs=["PERM-001"],
                observed_version="Expected Work revision",
                preconditions=["Update is pending"],
                atomic_effects=["Advance Work revision", "Append update fact"],
                success_outcome="Return accepted update identity and revision",
                failure_outcomes=["Permission denied", "Revision conflict"],
                audit_facts=["Actor", "operation identity", "result"],
            )
        ],
        "transaction_boundaries": [
            material(
                "TX-001",
                name="Accept update transaction",
                command_refs=["CMD-001"],
                writes=["Work current state", "immutable update fact"],
                external_effects=[],
                atomicity="All database writes commit or none commit.",
                partial_success_policy="No internal partial success; external delivery is separate.",
            )
        ],
        "permission_checks": [
            material(
                "PERM-001",
                name="Accept update authorization",
                target_refs=["OBJ-001"],
                actor_scope="Current Account member",
                data_scope="Current Enterprise and Work",
                execution_time_revalidation=True,
                denial_outcome="No write; return permission denial.",
            )
        ],
        "consistency_requirements": [
            material(
                "CONS-001",
                name="Work revision consistency",
                target_refs=["OBJ-001", "CMD-001"],
                consistency_model="Optimistic concurrency",
                enforcement="Compare-and-swap expected revision",
                conflict_outcome="No write and return current revision.",
            )
        ],
        "idempotency_contracts": [
            material(
                "IDEM-001",
                name="Accept update idempotency",
                command_refs=["CMD-001"],
                key_scope="Account plus operation",
                target_binding="Work ID",
                request_fingerprint="Command and normalized payload hash",
                retention_window="At least the retry and unknown-result window",
                replay_result="Return the first authoritative result",
                partial_success_behavior="Do not create a second fact",
                unknown_result_behavior="Verify before retry",
            )
        ],
        "unknown_outcome_contracts": [
            material(
                "UNKNOWN-001",
                name="Accept update unknown result",
                command_refs=["CMD-001"],
                unknown_state="RESULT_UNKNOWN",
                authoritative_source="Work current revision and update fact",
                verification_method="Query by operation identity",
                retry_policy="Retry only after authoritative absence is proven",
                resolution_fact="Append linked verification result",
            )
        ],
        "logical_model": {"status": "COMPLETE", "notes": "Database-neutral."},
        "physical_adapters": [],
        "migration_requirements": [],
        "contract_tests": [
            material(
                "TEST-001",
                name="Logical command contract",
                test_level="LOGICAL",
                covers=["INV-001", "STATE-001", "CMD-001", "TX-001", "PERM-001", "CONS-001", "IDEM-001", "UNKNOWN-001"],
                coverage_categories=["LOGICAL_BEHAVIOR"],
                expected_behavior="All logical outcomes match the declared contracts.",
            )
        ],
        "blocked_items": [],
        "out_of_scope": [
            material(
                "OUT-001",
                classification="OUT_OF_SCOPE",
                validation_status="NOT_APPLICABLE",
                scope="Analytics",
                reason="Analytical models are a downstream handoff.",
            )
        ],
        "admission": {
            "gate_kind": "PRODUCT_READINESS_RECEIPT",
            "ref": "receipt://product-readiness/feature-001",
            "version": "receipt-v1",
            "content_sha256": "b" * 64,
            "verifier": "product-readiness validator 1.0",
            "verdict": "PASS",
        },
        "quality_review": {
            "status": "PASSED",
            "reviewed_by": "Fresh-context reviewer",
            "reviewed_at": "2026-08-15T00:10:00Z",
            "review_ref": "review://DATA-DESIGN-001/review-1",
            "findings": [],
        },
        "package_acceptance": {
            "status": "ACCEPTED",
            "accepted_by": "Account owner",
            "accepted_by_ref": "user:account-001",
            "accepted_at": "2026-08-15T00:00:00Z",
            "accepted_architecture_ids": [],
            "confirmation_ref": "conversation://confirmation/123",
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
    design["physical_adapters"] = [material(
        "ADAPTER-001",
        selected=True,
        adapter_kind="POSTGRESQL",
        mapping_summary="Map Work identity and facts to PostgreSQL tables.",
        constraint_strategy="Unique operation identity and foreign keys.",
        transaction_strategy="One local transaction for the business result.",
        concurrency_strategy="Revision compare-and-swap.",
        permission_strategy="Application permission check inside the command boundary.",
        recovery_strategy="Verify by operation identity after unknown outcome.",
    )]
    design["migration_requirements"] = [
        material(
            "MIGRATION-001",
            strategy="Expand, backfill, validate, contract",
            compatibility_plan="Old and new readers coexist during rollout.",
            backfill_plan="Backfill operation identity in bounded batches.",
            validation_plan="Compare counts and invariant queries.",
            rollback_plan="Keep expanded columns until rollback window closes.",
            deployment_order=["Expand", "Deploy dual-compatible code", "Backfill", "Validate", "Contract"],
        )
    ]
    design["contract_tests"].append(  # type: ignore[union-attr]
        material(
            "TEST-002",
            name="Physical safety contract",
            test_level="PHYSICAL",
            covers=["ADAPTER-001", "MIGRATION-001"],
            coverage_categories=["CONSTRAINT", "CONCURRENCY", "PERMISSION", "RECOVERY", "MIGRATION", "ADAPTER"],
            expected_behavior="Constraints, conflicts, permissions, recovery, migration, and adapter mapping hold.",
        )
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
            human_path = root / "operational-data-design.md"
            receipt_path = root / "data-design-receipt.md"
            design_path.write_text(json.dumps(design, ensure_ascii=False, indent=2), encoding="utf-8")
            human_path.write_text("# Design\n", encoding="utf-8")
            _, markdown = build_receipt(
                design_path,
                receipt_path,
                "READY_FOR_SPEC",
                human_design_path=human_path,
            )
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
            human_path = root / "design.md"
            receipt_path = root / "receipt.md"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            human_path.write_text("# Design\n", encoding="utf-8")
            self.assertEqual(
                0,
                create_receipt_main(
                    [
                        str(design_path),
                        "--human-design",
                        str(human_path),
                        "--gate",
                        "READY_FOR_SPEC",
                        "--output",
                        str(receipt_path),
                    ]
                ),
            )
            original = receipt_path.read_bytes()
            self.assertEqual(
                2,
                create_receipt_main(
                    [
                        str(design_path),
                        "--human-design",
                        str(human_path),
                        "--gate",
                        "READY_FOR_SPEC",
                        "--output",
                        str(receipt_path),
                    ]
                ),
            )
            self.assertEqual(original, receipt_path.read_bytes())

    def test_18_receipt_id_tampering_is_detected(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "design.json"
            human_path = root / "design.md"
            receipt_path = root / "receipt.md"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            human_path.write_text("# Design\n", encoding="utf-8")
            _, markdown = build_receipt(
                design_path,
                receipt_path,
                "READY_FOR_SPEC",
                human_design_path=human_path,
            )
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
            self.assertIn(
                "Receipt ID does not match its design, human companion, gate, and digests.",
                result["errors"],
            )

    def test_19_hollow_logical_items_cannot_pass_readiness(self) -> None:
        design = logical_ready_design()
        for collection in (
            "objects",
            "invariants",
            "state_transitions",
            "commands",
            "transaction_boundaries",
            "permission_checks",
            "consistency_requirements",
            "idempotency_contracts",
            "unknown_outcome_contracts",
        ):
            for item in design[collection]:  # type: ignore[index]
                for key in list(item):
                    if key not in {
                        "stable_id",
                        "source_refs",
                        "classification",
                        "rationale",
                        "validation_status",
                    }:
                        del item[key]
        self.assert_fails_with(design, "MATERIAL_FIELD_MISSING", "READY_FOR_SPEC")

    def test_20_all_logical_areas_cannot_be_not_applicable(self) -> None:
        design = logical_ready_design()
        for collection in (
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
        ):
            for item in design[collection]:  # type: ignore[index]
                item["classification"] = "OUT_OF_SCOPE"
                item["validation_status"] = "NOT_APPLICABLE"
        self.assert_fails_with(design, "CRITICAL_LOGICAL_AREA_NOT_ACTIVE", "READY_FOR_SPEC")

    def test_21_physical_gate_requires_all_safety_test_categories(self) -> None:
        design = physical_ready_design()
        design["contract_tests"][1]["coverage_categories"] = ["ADAPTER", "MIGRATION"]  # type: ignore[index]
        self.assert_fails_with(design, "PHYSICAL_TEST_CATEGORY_MISSING", "READY_FOR_TICKETS")

    def test_22_supabase_permission_refs_must_resolve_to_permission_checks(self) -> None:
        design = physical_ready_design()
        design["physical_adapters"][0].update(  # type: ignore[index]
            {
                "adapter_kind": "SUPABASE",
                "base_adapter_kind": "POSTGRESQL",
                "permission_contract_refs": ["DOES-NOT-EXIST"],
            }
        )
        self.assert_fails_with(design, "SUPABASE_PERMISSION_CONTRACT_REF_INVALID", "READY_FOR_TICKETS")

    def test_23_confirmed_authority_requires_immutable_identity(self) -> None:
        design = logical_ready_design()
        design["source_authorities"][0]["ref"] = "does/not/exist.md#made-up"  # type: ignore[index]
        with tempfile.TemporaryDirectory() as directory:
            result = validate_design(design, "READY_FOR_SPEC", Path(directory) / "design.json")
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("AUTHORITY_REF_NOT_FOUND", {finding["code"] for finding in result["findings"]})

    def test_24_acceptance_rejects_unknown_architecture_ids(self) -> None:
        design = logical_ready_design()
        design["package_acceptance"]["accepted_architecture_ids"] = ["ARCH-DOES-NOT-EXIST"]  # type: ignore[index]
        self.assert_fails_with(design, "ACCEPTED_ARCHITECTURE_ID_UNKNOWN", "READY_FOR_SPEC")

    def test_25_receipt_requires_created_at(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "design.json"
            human_path = root / "design.md"
            receipt_path = root / "receipt.md"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            human_path.write_text("# Design\n", encoding="utf-8")
            _, markdown = build_receipt(
                design_path,
                receipt_path,
                "READY_FOR_SPEC",
                human_design_path=human_path,
            )
            payload = markdown.split(BEGIN_MARKER, 1)[1].split(END_MARKER, 1)[0].strip()
            record = json.loads(payload)
            del record["created_at"]
            receipt_path.write_text(
                markdown.replace(payload, json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True)),
                encoding="utf-8",
            )
            result = verify_receipt(receipt_path)
            self.assertEqual("FAIL", result["verdict"])
            self.assertIn("Receipt created_at is missing or invalid.", result["errors"])

    def test_26_receipt_binds_human_companion_and_detects_change(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "operational-data-design.json"
            human_path = root / "operational-data-design.md"
            receipt_path = root / "data-design-receipt.md"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            human_path.write_text("# Operational design\n\nExact human companion.\n", encoding="utf-8")
            record, markdown = build_receipt(
                design_path,
                receipt_path,
                "READY_FOR_SPEC",
                human_design_path=human_path,
            )
            self.assertIn("human_design_sha256", record)
            self.assertIn("source_authority_digests", record)
            receipt_path.write_text(markdown, encoding="utf-8")
            self.assertEqual("PASS", verify_receipt(receipt_path)["verdict"])
            human_path.write_text("# Operational design\n\nChanged after acceptance.\n", encoding="utf-8")
            result = verify_receipt(receipt_path)
            self.assertEqual("FAIL", result["verdict"])
            self.assertIn("Human design SHA-256 does not match the immutable receipt.", result["errors"])

    def test_27_receipt_requires_human_companion(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "design.json"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            with self.assertRaises(ValueError):
                build_receipt(design_path, root / "receipt.md", "READY_FOR_SPEC")

    def test_28_receipt_requires_source_authority_digests(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path = root / "design.json"
            human_path = root / "design.md"
            receipt_path = root / "receipt.md"
            design_path.write_text(json.dumps(design), encoding="utf-8")
            human_path.write_text("# Design\n", encoding="utf-8")
            _, markdown = build_receipt(
                design_path,
                receipt_path,
                "READY_FOR_SPEC",
                human_design_path=human_path,
            )
            payload = markdown.split(BEGIN_MARKER, 1)[1].split(END_MARKER, 1)[0].strip()
            record = json.loads(payload)
            del record["source_authority_digests"]
            receipt_path.write_text(
                markdown.replace(payload, json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True)),
                encoding="utf-8",
            )
            result = verify_receipt(receipt_path)
            self.assertEqual("FAIL", result["verdict"])
            self.assertIn("Receipt source authority digests are missing or invalid.", result["errors"])

    def test_29_mixed_type_reference_array_is_rejected(self) -> None:
        design = logical_ready_design()
        design["objects"][0]["source_refs"] = ["AUTH-001", 7]  # type: ignore[index]
        self.assert_fails_with(design, "SOURCE_REFS_MISSING", "READY_FOR_SPEC")

    def test_30_open_p2_quality_finding_blocks_affected_gate(self) -> None:
        design = logical_ready_design()
        design["quality_review"]["findings"] = [  # type: ignore[index]
            {
                "finding_id": "QUALITY-001",
                "severity": "P2",
                "status": "OPEN",
                "affects_gate": "READY_FOR_SPEC",
                "message": "Permission denial outcome is incomplete.",
            }
        ]
        self.assert_fails_with(design, "UNRESOLVED_QUALITY_FINDING", "READY_FOR_SPEC")

    def test_31_local_authority_digest_mismatch_is_rejected(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            authority_path = root / "decision.md"
            design_path = root / "design.json"
            authority_path.write_text("# Confirmed decision\n", encoding="utf-8")
            design["source_authorities"][0]["ref"] = "decision.md"  # type: ignore[index]
            result = validate_design(design, "READY_FOR_SPEC", design_path)
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("AUTHORITY_DIGEST_MISMATCH", {finding["code"] for finding in result["findings"]})

    def test_32_missing_upstream_admission_blocks_readiness(self) -> None:
        design = logical_ready_design()
        del design["admission"]
        self.assert_fails_with(design, "ADMISSION_EVIDENCE_MISSING", "READY_FOR_SPEC")

    def test_33_incomplete_prototype_identity_is_rejected(self) -> None:
        design = logical_ready_design()
        design["prototype_evidence"] = [
            {
                "stable_id": "PROTO-001",
                "ref": "prototype://feature/run-1",
                "source_refs": ["AUTH-001"],
                "admitted_ids": ["CMD-001"],
                "review_status": "ADMITTED",
                "version": "run-1",
            }
        ]
        self.assert_fails_with(design, "PROTOTYPE_DIGEST_INVALID", "READY_FOR_SPEC")

    def test_34_absolute_local_authority_digest_is_verified(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            authority_path = root / "decision.md"
            authority_path.write_text("# Different bytes\n", encoding="utf-8")
            design["source_authorities"][0]["ref"] = str(authority_path)  # type: ignore[index]
            result = validate_design(design, "READY_FOR_SPEC", root / "design.json")
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("AUTHORITY_DIGEST_MISMATCH", {finding["code"] for finding in result["findings"]})

    def test_35_local_prototype_evidence_bytes_are_verified(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("manifest.json", "artifact.zip", "fixture.json"):
                (root / name).write_text(name, encoding="utf-8")
            design["prototype_evidence"] = [
                {
                    "stable_id": "PROTO-001",
                    "ref": "prototype://feature/run-1",
                    "source_refs": ["AUTH-001"],
                    "admitted_ids": ["CMD-001"],
                    "review_status": "ADMITTED",
                    "version": "run-1",
                    "manifest_ref": "manifest.json",
                    "manifest_sha256": "c" * 64,
                    "artifact_ref": "artifact.zip",
                    "artifact_sha256": "d" * 64,
                    "fixture_ref": "fixture.json",
                    "fixture_sha256": "e" * 64,
                }
            ]
            result = validate_design(design, "READY_FOR_SPEC", root / "design.json")
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("PROTOTYPE_DIGEST_MISMATCH", {finding["code"] for finding in result["findings"]})

    def test_36_local_admission_bytes_are_verified(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            admission_path = root / "readiness-receipt.md"
            admission_path.write_text("# Readiness receipt\n", encoding="utf-8")
            design["admission"]["ref"] = "readiness-receipt.md"  # type: ignore[index]
            result = validate_design(design, "READY_FOR_SPEC", root / "design.json")
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("ADMISSION_DIGEST_MISMATCH", {finding["code"] for finding in result["findings"]})

    def test_37_p1_quality_finding_cannot_be_accepted_as_risk(self) -> None:
        design = logical_ready_design()
        design["quality_review"]["findings"] = [  # type: ignore[index]
            {
                "finding_id": "QUALITY-001",
                "severity": "P1",
                "status": "ACCEPTED_RISK",
                "affects_gate": "READY_FOR_SPEC",
                "message": "The write contract can corrupt identity.",
            }
        ]
        self.assert_fails_with(design, "P1_QUALITY_FINDING_PRESENT", "READY_FOR_SPEC")

    def test_38_acceptance_requires_stable_actor_identity(self) -> None:
        design = logical_ready_design()
        del design["package_acceptance"]["accepted_by_ref"]  # type: ignore[index]
        self.assert_fails_with(design, "PACKAGE_ACCEPTANCE_DETAIL_MISSING", "READY_FOR_SPEC")


if __name__ == "__main__":
    unittest.main()
