from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
PRODUCT_READINESS_SCRIPT = SCRIPT_DIR.parents[1] / "product-readiness" / "scripts" / "readiness-receipt.mjs"
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
        "schema_version": "1.2",
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
                "currentness_checked_at": "2025-01-01T00:00:00Z",
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
                atomicity_mode="ATOMIC",
                atomicity="All database writes commit or none commit.",
                partial_success_mode="NONE",
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
                consistency_model="OPTIMISTIC_CAS",
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
                retry_mode="VERIFY_THEN_RETRY",
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
            "reviewed_by_ref": "reviewer:independent-001",
            "reviewed_at": "2025-01-01T00:10:00Z",
            "review_ref": "review://DATA-DESIGN-001/review-1",
            "review_sha256": "c" * 64,
            "findings": [],
        },
        "package_acceptance": {
            "status": "ACCEPTED",
            "accepted_by": "Account owner",
            "accepted_by_ref": "user:account-001",
            "accepted_at": "2025-01-01T00:20:00Z",
            "accepted_architecture_ids": [],
            "confirmation_ref": "conversation://confirmation/123",
            "confirmation_sha256": "d" * 64,
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
            evidence_ref="evidence://physical/test-run-1",
            evidence_sha256="e" * 64,
            runner="ci:physical-contracts",
            run_at="2025-01-01T00:15:00Z",
            result="PASS",
        )
    )
    design["contract_tests"][1]["covers"] = [  # type: ignore[index]
        "ADAPTER-001",
        "MIGRATION-001",
        "INV-001",
        "CMD-001",
        "PERM-001",
        "CONS-001",
        "IDEM-001",
        "UNKNOWN-001",
    ]
    return design


def human_design_text(design: dict[str, object]) -> str:
    ids: list[str] = []
    for collection in (
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
    ):
        for item in design.get(collection, []):  # type: ignore[union-attr]
            if isinstance(item, dict) and item.get("validation_status") != "NOT_APPLICABLE":
                ids.append(str(item["stable_id"]))
    return (
        f"# Operational data design: {design['design_id']}\n\n"
        f"Target: {design['target']}\n\n"
        "## Contract identities\n\n"
        + "\n".join(f"- `{item_id}`" for item_id in ids)
        + "\n"
    )


def write_local_design_package(root: Path, design: dict[str, object]) -> tuple[Path, Path]:
    authority_path = root / "authority.md"
    authority_path.write_text("# Confirmed update\n\nThe bounded update behavior is confirmed.\n", encoding="utf-8")
    design["source_authorities"][0].update(  # type: ignore[index]
        {
            "ref": "authority.md#confirmed-update",
            "content_sha256": hashlib.sha256(authority_path.read_bytes()).hexdigest(),
        }
    )

    review_path = root / "quality-review.md"
    review_path.write_text("# Quality review\n\nAll four review axes passed.\n", encoding="utf-8")
    design["quality_review"].update(  # type: ignore[union-attr]
        {
            "review_ref": "quality-review.md",
            "review_sha256": hashlib.sha256(review_path.read_bytes()).hexdigest(),
        }
    )
    confirmation_path = root / "package-acceptance.md"
    confirmation_path.write_text("# Package acceptance\n\nThe bounded package was accepted.\n", encoding="utf-8")
    design["package_acceptance"].update(  # type: ignore[union-attr]
        {
            "confirmation_ref": "package-acceptance.md",
            "confirmation_sha256": hashlib.sha256(confirmation_path.read_bytes()).hexdigest(),
        }
    )

    for test in design.get("contract_tests", []):  # type: ignore[union-attr]
        if isinstance(test, dict) and test.get("test_level") in {"PHYSICAL", "END_TO_END"}:
            evidence_path = root / f"{test['stable_id']}-result.json"
            evidence_path.write_text('{"result":"PASS"}\n', encoding="utf-8")
            test["evidence_ref"] = evidence_path.name
            test["evidence_sha256"] = hashlib.sha256(evidence_path.read_bytes()).hexdigest()

    config_path = root / "readiness-config.json"
    receipt_path = root / "product-readiness-receipt.md"
    config_path.write_text(
        json.dumps(
            {
                "id": "PRODUCT-PR-001",
                "target": design["target"],
                "specificationBoundary": design["boundary"],
                "verdict": "READY_FOR_TO_SPEC",
                "assessedAt": "2025-01-01T00:05:00Z",
                "sources": [{"path": "authority.md", "label": "Canonical product decision"}],
            }
        ),
        encoding="utf-8",
    )
    completed = subprocess.run(
        ["node", str(PRODUCT_READINESS_SCRIPT), "create", "--config", str(config_path), "--output", str(receipt_path)],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise AssertionError(completed.stderr or completed.stdout)
    design["admission"].update(  # type: ignore[union-attr]
        {
            "ref": "product-readiness-receipt.md",
            "version": "product-readiness-receipt/v1",
            "verifier": "product-readiness-receipt/v1",
            "content_sha256": hashlib.sha256(receipt_path.read_bytes()).hexdigest(),
        }
    )

    design_path = root / "design.json"
    human_path = root / "design.md"
    design_path.write_text(json.dumps(design, ensure_ascii=False, indent=2), encoding="utf-8")
    human_path.write_text(human_design_text(design), encoding="utf-8")
    return design_path, human_path


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
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "data-design-receipt.md"
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
            design_path, _ = write_local_design_package(root, design)
            with self.assertRaises(ValueError):
                build_receipt(design_path, root / "receipt.md", "READY_FOR_SPEC")

    def test_12_cli_runs_from_arbitrary_working_directory(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path, _ = write_local_design_package(root, design)
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
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "receipt.md"
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
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "receipt.md"
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
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "receipt.md"
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
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "data-design-receipt.md"
            human_path.write_text(human_design_text(design) + "\nExact human companion.\n", encoding="utf-8")
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
            human_path.write_text(human_design_text(design) + "\nChanged after acceptance.\n", encoding="utf-8")
            result = verify_receipt(receipt_path)
            self.assertEqual("FAIL", result["verdict"])
            self.assertIn("Human design SHA-256 does not match the immutable receipt.", result["errors"])

    def test_27_receipt_requires_human_companion(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path, _ = write_local_design_package(root, design)
            with self.assertRaises(ValueError):
                build_receipt(design_path, root / "receipt.md", "READY_FOR_SPEC")

    def test_28_receipt_requires_source_authority_digests(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "receipt.md"
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

    def test_39_blocker_rejects_unknown_gate_level(self) -> None:
        design = logical_ready_design()
        design["blocked_items"] = [
            material(
                "BLOCK-001",
                classification="BLOCKED_PRODUCT_DECISION",
                validation_status="BLOCKED",
                blocks="NEITHER",
            )
        ]
        self.assert_fails_with(design, "BLOCK_LEVEL_INVALID", "READY_FOR_SPEC")

    def test_40_domain_enums_reject_arbitrary_strings(self) -> None:
        design = logical_ready_design()
        design["objects"][0]["content_mode"] = "BANANA"  # type: ignore[index]
        self.assert_fails_with(design, "MATERIAL_ENUM_INVALID", "READY_FOR_SPEC")

        design = logical_ready_design()
        design["relationships"] = [
            material(
                "REL-001",
                name="Work parent",
                from_object_ref="OBJ-001",
                to_object_ref="OBJ-001",
                cardinality="BANANA",
                ownership="Aggregate owned",
                retention_behavior="Retain with Work",
                invariant_refs=["INV-001"],
                optional=True,
            )
        ]
        self.assert_fails_with(design, "MATERIAL_ENUM_INVALID", "READY_FOR_SPEC")

        design = logical_ready_design()
        design["consistency_requirements"][0]["consistency_model"] = "BANANA"  # type: ignore[index]
        self.assert_fails_with(design, "MATERIAL_ENUM_INVALID", "READY_FOR_SPEC")

    def test_41_material_write_requires_execution_time_permission_revalidation(self) -> None:
        design = logical_ready_design()
        design["permission_checks"][0]["execution_time_revalidation"] = False  # type: ignore[index]
        self.assert_fails_with(design, "EXECUTION_REVALIDATION_REQUIRED", "READY_FOR_SPEC")

    def test_42_blocked_status_requires_a_real_blocker(self) -> None:
        design = logical_ready_design()
        design["status"] = "BLOCKED"
        design["downstream_handoff"]["requested_gate"] = "READY_FOR_SPEC"  # type: ignore[index]
        self.assert_fails_with(design, "BLOCKED_STATUS_WITHOUT_BLOCKER")

    def test_43_inferred_gate_still_applies_quality_findings(self) -> None:
        design = logical_ready_design()
        design["quality_review"]["findings"] = [  # type: ignore[index]
            {
                "finding_id": "QUALITY-001",
                "severity": "P2",
                "status": "OPEN",
                "affects_gate": "READY_FOR_SPEC",
                "message": "The logical permission contract is incomplete.",
            }
        ]
        self.assert_fails_with(design, "UNRESOLVED_QUALITY_FINDING")

    def test_44_explicit_gate_must_match_handoff_gate_and_consumer(self) -> None:
        design = logical_ready_design()
        design["downstream_handoff"]["requested_gate"] = "READY_FOR_TICKETS"  # type: ignore[index]
        self.assert_fails_with(design, "HANDOFF_GATE_MISMATCH", "READY_FOR_SPEC")

        design = logical_ready_design()
        design["downstream_handoff"]["consumer"] = "to-tickets"  # type: ignore[index]
        self.assert_fails_with(design, "HANDOFF_CONSUMER_GATE_MISMATCH", "READY_FOR_SPEC")

    def test_45_multiple_objects_require_an_explicit_relationship_model(self) -> None:
        design = logical_ready_design()
        second = copy.deepcopy(design["objects"][0])  # type: ignore[index]
        second["stable_id"] = "OBJ-002"
        second["name"] = "Update"
        design["objects"].append(second)  # type: ignore[union-attr]
        self.assert_fails_with(design, "RELATIONSHIP_MODEL_INCOMPLETE", "READY_FOR_SPEC")

    def test_46_rejected_prototype_cannot_admit_design_items(self) -> None:
        design = logical_ready_design()
        design["prototype_evidence"] = [
            {
                "stable_id": "PROTO-001",
                "ref": "prototype://feature/run-1",
                "source_refs": ["AUTH-001"],
                "admitted_ids": ["CMD-001"],
                "review_status": "REJECTED",
                "version": "run-1",
                "manifest_ref": "prototype://manifest/run-1",
                "manifest_sha256": "c" * 64,
                "artifact_ref": "prototype://artifact/run-1",
                "artifact_sha256": "d" * 64,
                "fixture_ref": "prototype://fixture/run-1",
                "fixture_sha256": "e" * 64,
            }
        ]
        design["commands"][0]["source_refs"] = ["PROTO-001"]  # type: ignore[index]
        self.assert_fails_with(design, "PROTOTYPE_NOT_ADMITTED", "READY_FOR_SPEC")

    def test_47_unknown_physical_adapter_is_rejected(self) -> None:
        design = physical_ready_design()
        design["physical_adapters"][0]["adapter_kind"] = "MONGODB"  # type: ignore[index]
        self.assert_fails_with(design, "PHYSICAL_ADAPTER_KIND_UNSUPPORTED", "READY_FOR_TICKETS")

    def test_48_local_authority_anchor_must_exist(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            authority_path = root / "decision.md"
            authority_path.write_text("# Confirmed decision\n", encoding="utf-8")
            design["source_authorities"][0]["ref"] = "decision.md#missing-heading"  # type: ignore[index]
            design["source_authorities"][0]["content_sha256"] = __import__("hashlib").sha256(  # type: ignore[index]
                authority_path.read_bytes()
            ).hexdigest()
            result = validate_design(design, "READY_FOR_SPEC", root / "design.json")
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("AUTHORITY_ANCHOR_NOT_FOUND", {finding["code"] for finding in result["findings"]})

    def test_49_arbitrary_local_file_is_not_an_admission_receipt(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            admission_path = root / "README.md"
            admission_path.write_text("# Not a Product Readiness receipt\n", encoding="utf-8")
            design["admission"].update(  # type: ignore[union-attr]
                {
                    "ref": "README.md",
                    "content_sha256": __import__("hashlib").sha256(admission_path.read_bytes()).hexdigest(),
                    "version": "product-readiness-receipt/v1",
                    "verifier": "product-readiness-receipt/v1",
                }
            )
            result = validate_design(design, "READY_FOR_SPEC", root / "design.json")
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("ADMISSION_VERIFICATION_FAILED", {finding["code"] for finding in result["findings"]})

    def test_50_visible_receipt_tampering_is_detected(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "receipt.md"
            _, markdown = build_receipt(
                design_path,
                receipt_path,
                "READY_FOR_SPEC",
                human_design_path=human_path,
            )
            receipt_path.write_text(markdown.replace("- Gate: `READY_FOR_SPEC`", "- Gate: `READY_FOR_TICKETS`"), encoding="utf-8")
            result = verify_receipt(receipt_path)
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("Receipt visible content does not match its machine identity.", result["errors"])

    def test_51_future_receipt_timestamp_is_rejected(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "receipt.md"
            _, markdown = build_receipt(
                design_path,
                receipt_path,
                "READY_FOR_SPEC",
                human_design_path=human_path,
            )
            payload = markdown.split(BEGIN_MARKER, 1)[1].split(END_MARKER, 1)[0].strip()
            record = json.loads(payload)
            record["created_at"] = "2999-01-01T00:00:00Z"
            tampered_payload = json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True)
            receipt_path.write_text(
                markdown.replace(payload, tampered_payload).replace(
                    record.get("created_at", ""), "2999-01-01T00:00:00Z"
                ),
                encoding="utf-8",
            )
            result = verify_receipt(receipt_path)
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("Receipt created_at is in the future.", result["errors"])

    def test_52_physical_gate_requires_executed_test_evidence(self) -> None:
        design = physical_ready_design()
        for field in ("evidence_ref", "evidence_sha256", "runner", "run_at", "result"):
            del design["contract_tests"][1][field]  # type: ignore[index]
        self.assert_fails_with(design, "PHYSICAL_TEST_EVIDENCE_MISSING", "READY_FOR_TICKETS")

    def test_53_core_write_safety_contracts_cannot_be_waived(self) -> None:
        for collection in ("state_transitions", "idempotency_contracts", "unknown_outcome_contracts"):
            design = logical_ready_design()
            design[collection][0]["validation_status"] = "NOT_APPLICABLE"  # type: ignore[index]
            self.assert_fails_with(design, "CRITICAL_LOGICAL_AREA_NOT_ACTIVE", "READY_FOR_SPEC")

    def test_54_transaction_and_retry_modes_use_closed_safety_enums(self) -> None:
        design = logical_ready_design()
        design["transaction_boundaries"][0]["atomicity_mode"] = "BEST_EFFORT"  # type: ignore[index]
        self.assert_fails_with(design, "MATERIAL_ENUM_INVALID", "READY_FOR_SPEC")

        design = logical_ready_design()
        design["unknown_outcome_contracts"][0]["retry_mode"] = "BLIND_AUTOMATIC_RETRY"  # type: ignore[index]
        self.assert_fails_with(design, "MATERIAL_ENUM_INVALID", "READY_FOR_SPEC")

    def test_55_physical_category_must_cover_its_specific_contract(self) -> None:
        design = physical_ready_design()
        design["contract_tests"][1]["covers"].remove("PERM-001")  # type: ignore[index]
        self.assert_fails_with(design, "PHYSICAL_TEST_CATEGORY_TARGET_MISMATCH", "READY_FOR_TICKETS")

    def test_56_admission_and_data_design_use_the_same_authority_set(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path, _ = write_local_design_package(root, design)
            replacement = root / "replacement-authority.md"
            replacement.write_text("# Replacement authority\n", encoding="utf-8")
            design["source_authorities"][0].update(  # type: ignore[index]
                {
                    "ref": replacement.name,
                    "content_sha256": hashlib.sha256(replacement.read_bytes()).hexdigest(),
                }
            )
            result = validate_design(design, "READY_FOR_SPEC", design_path)
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("ADMISSION_AUTHORITY_SET_MISMATCH", {finding["code"] for finding in result["findings"]})

    def test_57_ready_status_cannot_claim_a_weaker_handoff_gate(self) -> None:
        design = physical_ready_design()
        design["downstream_handoff"].update(  # type: ignore[union-attr]
            {"requested_gate": "READY_FOR_SPEC", "consumer": "to-spec"}
        )
        self.assert_fails_with(design, "DESIGN_STATUS_HANDOFF_MISMATCH")

    def test_58_malformed_receipt_reports_missing_identity_without_crashing(self) -> None:
        design = logical_ready_design()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            design_path, human_path = write_local_design_package(root, design)
            receipt_path = root / "receipt.md"
            _, markdown = build_receipt(
                design_path,
                receipt_path,
                "READY_FOR_SPEC",
                human_design_path=human_path,
            )
            payload = markdown.split(BEGIN_MARKER, 1)[1].split(END_MARKER, 1)[0].strip()
            record = json.loads(payload)
            del record["design_id"]
            receipt_path.write_text(
                markdown.replace(payload, json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True)),
                encoding="utf-8",
            )
            result = verify_receipt(receipt_path)
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn("Receipt required field is missing: design_id.", result["errors"])


if __name__ == "__main__":
    unittest.main()
