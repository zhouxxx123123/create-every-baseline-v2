from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
SKILL_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from validate_ticket_plan import validate_plan  # noqa: E402


DIGEST_A = "sha256:" + "a" * 64
DIGEST_B = "sha256:" + "b" * 64


def identity(name: str) -> dict[str, str]:
    return {
        "manifest": f"evidence/{name}-manifest.md",
        "reference": f"{name}@version-001",
        "artifact_ref": f"evidence/{name}.zip",
        "artifact_digest": DIGEST_A,
        "fixture_ref": f"evidence/{name}.fixture.json",
        "fixture_digest": DIGEST_B,
    }


def base_plan() -> dict:
    return {
        "plan_id": "fictional-catalog-plan",
        "tracker": {"kind": "local", "ready_semantics": "repository configured"},
        "evidence_policy": "AVAILABLE",
        "source_stories": [
            {"id": "STORY-001", "source_anchor": "approved-plan#browse"},
            {"id": "STORY-002", "source_anchor": "approved-plan#save"},
        ],
        "requirements": [
            {
                "id": "REQ-001",
                "source_anchor": "approved-plan#browse-results",
                "source_story_ids": ["STORY-001"],
                "product_area": "catalog",
                "handoff": "query to visible results",
                "required_capability_ids": ["CAP-SHELL"],
                "required_evidence_ids": ["EVIDENCE-LIST"],
                "required_delivery_ticket_ids": [],
                "validation_status": "CONFIRMED_AND_VALIDATED",
                "assumptions": [],
                "stop_conditions": [],
                "crosses_subflows": False,
                "requires_final_integration": False,
            },
            {
                "id": "REQ-002",
                "source_anchor": "approved-plan#save-item",
                "source_story_ids": ["STORY-002"],
                "product_area": "catalog",
                "handoff": "result to durable saved item",
                "required_capability_ids": ["CAP-SHELL", "CAP-SAVE"],
                "required_evidence_ids": ["EVIDENCE-DETAIL"],
                "required_delivery_ticket_ids": [],
                "validation_status": "CONFIRMED_AND_VALIDATED",
                "assumptions": [],
                "stop_conditions": [],
                "crosses_subflows": False,
                "requires_final_integration": False,
            },
        ],
        "tickets": [
            {
                "id": "T01",
                "title": "Browse a fictional catalog",
                "blocked_by": [],
                "primary_requirement_ids": ["REQ-001"],
                "supporting_requirement_ids": [],
                "exact_source_story_ids": ["STORY-001"],
                "supporting_story_ids": [],
                "capabilities_owned": ["CAP-SHELL"],
                "capabilities_consumed": [],
                "evidence_ids_owned": ["EVIDENCE-LIST"],
                "evidence_ids_consumed": [],
                "downstream_integration_evidence_ids": [],
                "user_visible": True,
                "delivery_ticket": True,
                "final_integration": False,
                "bounded_validation_ticket": False,
                "composition_ticket": False,
                "evidence": identity("catalog-list"),
                "composition": None,
                "out_of_scope": [],
                "tracker_payload": {},
            },
            {
                "id": "T02",
                "title": "Save a fictional catalog item",
                "blocked_by": ["T01"],
                "primary_requirement_ids": ["REQ-002"],
                "supporting_requirement_ids": [],
                "exact_source_story_ids": ["STORY-002"],
                "supporting_story_ids": [],
                "capabilities_owned": ["CAP-SAVE"],
                "capabilities_consumed": ["CAP-SHELL"],
                "evidence_ids_owned": ["EVIDENCE-DETAIL"],
                "evidence_ids_consumed": [],
                "downstream_integration_evidence_ids": [],
                "user_visible": True,
                "delivery_ticket": True,
                "final_integration": False,
                "bounded_validation_ticket": False,
                "composition_ticket": False,
                "evidence": identity("catalog-detail"),
                "composition": None,
                "out_of_scope": [],
                "tracker_payload": {},
            },
            {
                "id": "T03",
                "title": "Accept the complete fictional workflow",
                "blocked_by": ["T01", "T02"],
                "primary_requirement_ids": [],
                "supporting_requirement_ids": [],
                "exact_source_story_ids": [],
                "supporting_story_ids": [],
                "capabilities_owned": [],
                "capabilities_consumed": [],
                "evidence_ids_owned": ["EVIDENCE-COMPOSED"],
                "evidence_ids_consumed": [],
                "downstream_integration_evidence_ids": ["EVIDENCE-COMPOSED"],
                "user_visible": False,
                "delivery_ticket": False,
                "final_integration": True,
                "bounded_validation_ticket": False,
                "composition_ticket": False,
                "evidence": None,
                "composition": None,
                "out_of_scope": [],
                "tracker_payload": {},
            },
        ],
        "capabilities": [
            {
                "id": "CAP-SHELL",
                "implementation_owner": "T01",
                "consumers": ["T02"],
                "source_of_truth_owner": "catalog",
                "result_writeback": "visible result set",
                "availability_point": "T01 complete",
                "validation_status": "CONFIRMED_AND_VALIDATED",
                "external": False,
                "evidence_ref": "approved-plan#shell",
            },
            {
                "id": "CAP-SAVE",
                "implementation_owner": "T02",
                "consumers": [],
                "source_of_truth_owner": "saved items",
                "result_writeback": "saved item record",
                "availability_point": "T02 complete",
                "validation_status": "CONFIRMED_AND_VALIDATED",
                "external": False,
                "evidence_ref": "approved-plan#save",
            },
        ],
        "external_validated_capabilities": [],
        "evidence_units": [
            {
                "id": "EVIDENCE-LIST",
                "delivery_owner": "T01",
                "kind": "source",
                "production_required": True,
                "downstream_integration": False,
                **identity("catalog-list"),
            },
            {
                "id": "EVIDENCE-DETAIL",
                "delivery_owner": "T02",
                "kind": "source",
                "production_required": True,
                "downstream_integration": False,
                **identity("catalog-detail"),
            },
            {
                "id": "EVIDENCE-COMPOSED",
                "delivery_owner": "T03",
                "kind": "integration",
                "production_required": False,
                "downstream_integration": True,
                **identity("catalog-composed"),
            },
        ],
        "existing_ticket_reconciliation": [],
        "completed_ticket_ids": [],
        "primary_requirement_owners": {"REQ-001": "T01", "REQ-002": "T02"},
        "final_integration_ticket_id": "T03",
        "composition_required_source_refs": [],
        "composition_integration_evidence_ids": [],
    }


def codes(plan: dict) -> set[str]:
    return {finding["code"] for finding in validate_plan(plan)["findings"]}


class TicketPlanValidatorTests(unittest.TestCase):
    def assert_passes(self, plan: dict) -> None:
        result = validate_plan(plan)
        self.assertEqual("PASS", result["verdict"], result["findings"])

    def assert_fails_with(self, plan: dict, code: str) -> None:
        result = validate_plan(plan)
        self.assertEqual("FAIL", result["verdict"])
        self.assertIn(code, {finding["code"] for finding in result["findings"]})

    def assert_fails_with_severity(self, plan: dict, code: str, severity: str) -> None:
        result = validate_plan(plan)
        self.assertEqual("FAIL", result["verdict"])
        matches = [finding for finding in result["findings"] if finding["code"] == code]
        self.assertTrue(matches, result["findings"])
        self.assertTrue(all(finding["severity"] == severity for finding in matches), matches)

    def test_01_normal_vertical_plan_passes(self) -> None:
        self.assert_passes(base_plan())

    def test_02_requirement_owner_without_closure_fails(self) -> None:
        plan = base_plan()
        plan["requirements"][0]["required_delivery_ticket_ids"] = ["T02"]
        self.assert_fails_with(plan, "REQUIREMENT_DELIVERY_OUTSIDE_CLOSURE")

    def test_03_shared_capability_consumer_without_blocker_fails(self) -> None:
        plan = base_plan()
        plan["tickets"][1]["blocked_by"] = []
        self.assert_fails_with(plan, "CAPABILITY_OWNER_OUTSIDE_BLOCKER_CLOSURE")

    def test_04_exact_story_omission_fails(self) -> None:
        plan = base_plan()
        plan["tickets"][1]["exact_source_story_ids"] = []
        self.assert_fails_with(plan, "EXACT_STORY_SET_MISMATCH")

    def test_05_supporting_story_cannot_masquerade_as_exact(self) -> None:
        plan = base_plan()
        plan["tickets"][1]["supporting_story_ids"] = ["STORY-002"]
        self.assert_fails_with(plan, "SUPPORTING_STORY_AS_EXACT")

    def test_06_evidence_cannot_have_two_delivery_owners(self) -> None:
        plan = base_plan()
        plan["tickets"][1]["evidence_ids_owned"].append("EVIDENCE-LIST")
        self.assert_fails_with(plan, "EVIDENCE_OWNER_COUNT")

    def test_07_requirement_owner_must_list_evidence_dependency(self) -> None:
        plan = base_plan()
        plan["requirements"][1]["required_evidence_ids"].append("EVIDENCE-LIST")
        self.assert_fails_with(plan, "REQUIREMENT_EVIDENCE_UNLISTED")

    def test_08_user_visible_ticket_rejects_indirect_evidence(self) -> None:
        plan = base_plan()
        plan["tickets"][0]["evidence"]["artifact_ref"] = "same as another ticket"
        self.assert_fails_with(plan, "INDIRECT_EVIDENCE_REFERENCE")

    def test_09_composition_requires_complete_source_identity(self) -> None:
        plan = base_plan()
        final = plan["tickets"][2]
        final["composition_ticket"] = True
        source = {
            **identity("catalog-list"),
            "source_ids": ["EVIDENCE-LIST"],
            "delivery_owners": {"EVIDENCE-LIST": "T01"},
        }
        source.pop("fixture_digest")
        final["composition"] = {
            "identity": "catalog-workflow@version-001",
            "manifest": "evidence/catalog-workflow-manifest.md",
            "artifact_ref": "evidence/catalog-workflow.zip",
            "artifact_digest": DIGEST_A,
            "fixture_ref": "evidence/catalog-workflow.fixture.json",
            "fixture_digest": DIGEST_B,
            "integration_ids": ["EVIDENCE-COMPOSED"],
            "sources": [source],
        }
        plan["composition_required_source_refs"] = ["catalog-list@version-001"]
        plan["composition_integration_evidence_ids"] = ["EVIDENCE-COMPOSED"]
        self.assert_fails_with(plan, "COMPOSITION_SOURCE_INCOMPLETE")

    def test_10_legal_final_integration_ticket_passes(self) -> None:
        plan = base_plan()
        self.assertEqual({"T01", "T02"}, set(plan["tickets"][2]["blocked_by"]))
        self.assert_passes(plan)

    def test_11_blocker_cycle_fails(self) -> None:
        plan = base_plan()
        plan["tickets"][0]["blocked_by"] = ["T02"]
        plan["tickets"][1]["blocked_by"] = ["T01"]
        self.assert_fails_with(plan, "DEPENDENCY_CYCLE")

    def test_12_unresolved_existing_conflict_cannot_enter_frontier(self) -> None:
        plan = base_plan()
        plan["existing_ticket_reconciliation"] = [
            {
                "ticket_ref": "existing-item",
                "classification": "CONFLICT",
                "resolution_status": "UNRESOLVED",
                "affected_ticket_ids": ["T01"],
                "planned_action": "await approval",
            }
        ]
        self.assert_fails_with(plan, "UNRESOLVED_CONFLICT_IN_FRONTIER")

    def test_13_external_validated_capability_with_evidence_passes(self) -> None:
        plan = base_plan()
        plan["external_validated_capabilities"] = [
            {
                "id": "CAP-EXTERNAL-NOTIFY",
                "validation_status": "VALIDATED",
                "evidence_ref": "external-acceptance#notify",
            }
        ]
        plan["requirements"][0]["required_capability_ids"].append("CAP-EXTERNAL-NOTIFY")
        plan["tickets"][0]["capabilities_consumed"].append("CAP-EXTERNAL-NOTIFY")
        self.assert_passes(plan)

    def test_14_wide_refactor_expand_contract_passes(self) -> None:
        plan = {
            "plan_id": "fictional-expand-contract",
            "tracker": {"kind": "real", "ready_semantics": "repository configured"},
            "evidence_policy": "NONE",
            "source_stories": [{"id": "STORY-WIDE", "source_anchor": "plan#rename"}],
            "requirements": [],
            "tickets": [],
            "capabilities": [],
            "external_validated_capabilities": [],
            "evidence_units": [],
            "existing_ticket_reconciliation": [],
            "completed_ticket_ids": [],
            "primary_requirement_owners": {},
            "final_integration_ticket_id": None,
            "composition_required_source_refs": [],
            "composition_integration_evidence_ids": [],
            "wide_refactor": {
                "expand_ticket_id": "W01",
                "migrate_ticket_ids": ["W02"],
                "contract_ticket_id": "W03",
            },
        }
        for index, ticket_id in enumerate(("W01", "W02", "W03"), start=1):
            requirement_id = f"REQ-W{index}"
            plan["requirements"].append(
                {
                    "id": requirement_id,
                    "source_anchor": f"plan#step-{index}",
                    "source_story_ids": ["STORY-WIDE"],
                    "product_area": "shared contract",
                    "handoff": "expanded form to migrated callers",
                    "required_capability_ids": ["CAP-EXPANDED-FORM"],
                    "required_evidence_ids": [],
                    "required_delivery_ticket_ids": ["W02"] if ticket_id == "W03" else [],
                    "validation_status": "CONFIRMED_AND_VALIDATED",
                    "assumptions": [],
                    "stop_conditions": [],
                    "crosses_subflows": False,
                    "requires_final_integration": False,
                }
            )
            plan["primary_requirement_owners"][requirement_id] = ticket_id
            plan["tickets"].append(
                {
                    "id": ticket_id,
                    "title": f"Expand-contract step {index}",
                    "blocked_by": [] if ticket_id == "W01" else (["W01"] if ticket_id == "W02" else ["W01", "W02"]),
                    "primary_requirement_ids": [requirement_id],
                    "supporting_requirement_ids": [],
                    "exact_source_story_ids": ["STORY-WIDE"],
                    "supporting_story_ids": [],
                    "capabilities_owned": ["CAP-EXPANDED-FORM"] if ticket_id == "W01" else [],
                    "capabilities_consumed": [] if ticket_id == "W01" else ["CAP-EXPANDED-FORM"],
                    "evidence_ids_owned": [],
                    "evidence_ids_consumed": [],
                    "downstream_integration_evidence_ids": [],
                    "user_visible": False,
                    "delivery_ticket": True,
                    "final_integration": False,
                    "bounded_validation_ticket": False,
                    "composition_ticket": False,
                    "evidence": None,
                    "composition": None,
                }
            )
        plan["capabilities"] = [
            {
                "id": "CAP-EXPANDED-FORM",
                "implementation_owner": "W01",
                "consumers": ["W02", "W03"],
                "source_of_truth_owner": "shared contract",
                "result_writeback": "compatible call sites",
                "availability_point": "W01 complete",
                "validation_status": "CONFIRMED_AND_VALIDATED",
                "external": False,
                "evidence_ref": "plan#expand-contract",
            }
        ]
        self.assert_passes(plan)

    def test_15_local_tracker_template_remains_supported(self) -> None:
        plan = base_plan()
        plan["tracker"]["kind"] = "local"
        skill_text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("<local-ticket-template>", skill_text)
        self.assert_passes(plan)

    def test_16_real_tracker_template_remains_supported(self) -> None:
        plan = base_plan()
        plan["tracker"]["kind"] = "real"
        skill_text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("<issue-template>", skill_text)
        self.assert_passes(plan)

    def test_17_cross_subflow_requirement_with_complete_closure_passes(self) -> None:
        plan = base_plan()
        plan["requirements"][1]["crosses_subflows"] = True
        plan["requirements"][1]["requires_final_integration"] = False
        self.assert_passes(plan)

    def test_18_final_only_requirement_owned_by_non_final_fails_p1(self) -> None:
        plan = base_plan()
        plan["requirements"][1]["requires_final_integration"] = True
        self.assert_fails_with_severity(plan, "FINAL_REQUIREMENT_OWNER_MISMATCH", "P1")

    def test_19_evidence_id_bound_to_wrong_identity_fails_p1(self) -> None:
        plan = base_plan()
        plan["tickets"][0]["evidence"] = identity("unrelated-evidence")
        self.assert_fails_with_severity(plan, "EVIDENCE_IDENTITY_MISMATCH", "P1")

    def test_20_multiple_evidence_identities_with_one_identity_fails_p1(self) -> None:
        plan = base_plan()
        plan["evidence_units"].append(
            {
                "id": "EVIDENCE-SECOND-LIST",
                "delivery_owner": "T01",
                "kind": "source",
                "production_required": True,
                "downstream_integration": False,
                **identity("catalog-list-secondary"),
            }
        )
        plan["tickets"][0]["evidence_ids_owned"].append("EVIDENCE-SECOND-LIST")
        self.assert_fails_with_severity(plan, "EVIDENCE_IDENTITY_MISMATCH", "P1")

    def test_21_composition_source_id_bound_to_wrong_identity_fails_p1(self) -> None:
        plan = base_plan()
        final = plan["tickets"][2]
        final["composition_ticket"] = True
        final["composition"] = {
            "identity": "catalog-workflow@version-001",
            "manifest": "evidence/catalog-workflow-manifest.md",
            "artifact_ref": "evidence/catalog-workflow.zip",
            "artifact_digest": DIGEST_A,
            "fixture_ref": "evidence/catalog-workflow.fixture.json",
            "fixture_digest": DIGEST_B,
            "integration_ids": ["EVIDENCE-COMPOSED"],
            "sources": [
                {
                    **identity("catalog-list"),
                    "source_ids": ["EVIDENCE-DETAIL"],
                    "delivery_owners": {"EVIDENCE-DETAIL": "T02"},
                }
            ],
        }
        plan["composition_required_source_refs"] = ["catalog-list@version-001"]
        plan["composition_integration_evidence_ids"] = ["EVIDENCE-COMPOSED"]
        self.assert_fails_with_severity(plan, "COMPOSITION_SOURCE_IDENTITY_MISMATCH", "P1")

    def test_22_correct_legacy_single_identity_passes(self) -> None:
        self.assert_passes(base_plan())

    def test_23_correct_grouped_multiple_identities_passes(self) -> None:
        plan = base_plan()
        plan["evidence_units"].append(
            {
                "id": "EVIDENCE-SECOND-LIST",
                "delivery_owner": "T01",
                "kind": "source",
                "production_required": True,
                "downstream_integration": False,
                **identity("catalog-list-secondary"),
            }
        )
        ticket = plan["tickets"][0]
        ticket["evidence_ids_owned"].append("EVIDENCE-SECOND-LIST")
        ticket["evidence_bindings"] = [
            {**identity("catalog-list"), "evidence_ids": ["EVIDENCE-LIST"]},
            {
                **identity("catalog-list-secondary"),
                "evidence_ids": ["EVIDENCE-SECOND-LIST"],
            },
        ]
        self.assert_passes(plan)

    def test_24_multiple_delivery_tickets_without_final_fails_p1(self) -> None:
        plan = base_plan()
        plan["tickets"] = plan["tickets"][:2]
        plan["evidence_units"] = plan["evidence_units"][:2]
        plan["final_integration_ticket_id"] = None
        self.assert_fails_with_severity(plan, "FINAL_TICKET_REQUIRED", "P1")

    def test_25_delivery_false_cannot_hide_real_delivery_fails_p1(self) -> None:
        plan = base_plan()
        plan["tickets"][1]["delivery_ticket"] = False
        self.assert_fails_with_severity(plan, "DELIVERY_TICKET_FALSE_NEGATIVE", "P1")

    def test_26_final_ticket_missing_derived_delivery_blocker_fails_p1(self) -> None:
        plan = base_plan()
        plan["tickets"][2]["blocked_by"] = ["T01"]
        self.assert_fails_with_severity(plan, "FINAL_TICKET_MISSING_DELIVERY_BLOCKERS", "P1")

    def test_27_single_delivery_ticket_without_final_passes(self) -> None:
        plan = base_plan()
        plan["source_stories"] = plan["source_stories"][:1]
        plan["requirements"] = plan["requirements"][:1]
        plan["tickets"] = plan["tickets"][:1]
        plan["capabilities"] = plan["capabilities"][:1]
        plan["capabilities"][0]["consumers"] = []
        plan["evidence_units"] = plan["evidence_units"][:1]
        plan["primary_requirement_owners"] = {"REQ-001": "T01"}
        plan["final_integration_ticket_id"] = None
        self.assert_passes(plan)

    def test_28_multiple_delivery_tickets_with_final_passes(self) -> None:
        self.assert_passes(base_plan())

    def test_29_source_story_without_anchor_fails_p2(self) -> None:
        plan = base_plan()
        plan["source_stories"][0]["source_anchor"] = ""
        self.assert_fails_with_severity(plan, "SOURCE_STORY_ANCHOR_MISSING", "P2")

    def test_30_incomplete_reconciliation_fields_fail_p2(self) -> None:
        plan = base_plan()
        plan["existing_ticket_reconciliation"] = [{}]
        for code in (
            "RECONCILIATION_TICKET_REF_MISSING",
            "RECONCILIATION_CLASS_INVALID",
            "RECONCILIATION_AFFECTED_TICKETS_MISSING",
            "RECONCILIATION_ACTION_MISSING",
            "RECONCILIATION_STATUS_MISSING",
        ):
            self.assert_fails_with_severity(plan, code, "P2")

    def test_31_reconciliation_unknown_affected_ticket_fails_p2(self) -> None:
        plan = base_plan()
        plan["existing_ticket_reconciliation"] = [
            {
                "ticket_ref": "tracker-item-reference",
                "classification": "REUSE",
                "affected_ticket_ids": ["UNKNOWN"],
                "planned_action": "reuse validated behavior",
                "resolution_status": "RESOLVED",
            }
        ]
        self.assert_fails_with_severity(plan, "RECONCILIATION_AFFECTED_TICKET_UNKNOWN", "P2")

    def test_32_complete_reconciliation_passes(self) -> None:
        plan = base_plan()
        plan["existing_ticket_reconciliation"] = [
            {
                "ticket_ref": "tracker-item-reference",
                "classification": "HISTORICAL ONLY",
                "affected_ticket_ids": ["T01"],
                "planned_action": "retain history without entering the frontier",
                "resolution_status": "RESOLVED",
            }
        ]
        self.assert_passes(plan)

    def test_33_cli_works_from_arbitrary_cwd_with_resolved_script_path(self) -> None:
        script = SCRIPT_DIR / "validate_ticket_plan.py"
        with tempfile.TemporaryDirectory() as temporary_directory:
            plan_path = Path(temporary_directory) / "plan.json"
            plan_path.write_text(json.dumps(base_plan()), encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, "-B", str(script), str(plan_path), "--format", "json"],
                cwd=temporary_directory,
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertEqual(0, completed.returncode, completed.stderr or completed.stdout)
        self.assertEqual("PASS", json.loads(completed.stdout)["verdict"])


if __name__ == "__main__":
    unittest.main()
