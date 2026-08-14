from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .git_state import collect_git_snapshot, compare_git_snapshots
from .models import EVIDENCE_TYPES, NEXT_VALIDATIONS, content_identity


REQUIRED_HEADINGS = [
    "研究范围",
    "直接回答",
    "来源清单",
    "证据台账",
    "横向比较",
    "可迁移性判断",
    "优化候选",
    "未验证项",
    "返回原流程",
    "工作树变化",
]

FLOATING_GITHUB = re.compile(
    r"https://(?:raw\.)?github(?:usercontent)?\.com/[^\s)]+/(?:blob/|tree/)?(?:main|master|HEAD)(?:/|\b)",
    re.IGNORECASE,
)
FIXED_GITHUB_CODE = re.compile(
    r"https://github\.com/[^\s)]+/blob/[0-9a-fA-F]{40}/[^\s)#]+#L\d+(?:-L\d+)?"
)


def _blocks(text: str, prefix: str) -> list[tuple[str, str]]:
    pattern = re.compile(rf"(?m)^###\s+({re.escape(prefix)}\d{{3,}})\b")
    matches = list(pattern.finditer(text))
    result: list[tuple[str, str]] = []
    for match in matches:
        next_heading = re.search(r"(?m)^#{1,3}\s+", text[match.end() :])
        end = (
            match.end() + next_heading.start()
            if next_heading
            else len(text)
        )
        result.append((match.group(1), text[match.start() : end]))
    return result


def _declared_status(text: str) -> str | None:
    match = re.search(
        r"(?mi)^(?:research_status\s*:|[-*]\s*研究状态\s*[：:])\s*`?(COMPLETE|PARTIAL|BLOCKED)`?",
        text,
    )
    return match.group(1).upper() if match else None


def _validate_structure(text: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    for heading in REQUIRED_HEADINGS:
        if not re.search(rf"(?m)^##\s+{re.escape(heading)}\s*$", text):
            errors.append(
                {"code": "MISSING_SECTION", "message": f"Missing section: {heading}"}
            )

    if FLOATING_GITHUB.search(text):
        errors.append(
            {
                "code": "FLOATING_SOURCE_LINK",
                "message": "GitHub source links must use a full commit, not main/master/HEAD",
            }
        )

    evidence_blocks = _blocks(text, "RR-E")
    if not evidence_blocks:
        errors.append(
            {"code": "NO_EVIDENCE", "message": "At least one evidence finding is required"}
        )
    for evidence_id, block in evidence_blocks:
        present_types = [value for value in EVIDENCE_TYPES if value in block]
        if len(present_types) != 1:
            errors.append(
                {
                    "code": "EVIDENCE_TYPE",
                    "message": f"{evidence_id} must contain exactly one evidence type",
                }
            )
        for label, pattern in (
            ("source", r"(?m)^-\s*(?:来源|Source)\s*[：:]"),
            ("proves", r"(?m)^-\s*(?:证明|Proves)\s*[：:]"),
            ("does-not-prove", r"(?m)^-\s*(?:不能证明|Does not prove)\s*[：:]"),
        ):
            if not re.search(pattern, block, re.IGNORECASE):
                errors.append(
                    {
                        "code": "EVIDENCE_FIELD",
                        "message": f"{evidence_id} is missing {label}",
                    }
                )
        if present_types and present_types[0] in {"FACT_FROM_CODE", "FACT_FROM_TEST"}:
            github_links = re.findall(r"https://github\.com/[^\s)>]+", block)
            if github_links and not FIXED_GITHUB_CODE.search(block):
                errors.append(
                    {
                        "code": "UNSTABLE_CODE_CITATION",
                        "message": f"{evidence_id} GitHub code evidence needs a full commit and lines",
                    }
                )
        if present_types and present_types[0] == "INFERENCE":
            refs = set(re.findall(r"RR-E\d{3,}", block)) - {evidence_id}
            if not refs:
                errors.append(
                    {
                        "code": "UNSUPPORTED_INFERENCE",
                        "message": f"{evidence_id} inference must cite supporting evidence IDs",
                    }
                )
        if present_types and present_types[0] == "NOT_FOUND":
            if re.search(r"(?:绝对没有|确定不存在|does not exist|definitely absent)", block, re.I):
                errors.append(
                    {
                        "code": "OVERSTATED_NOT_FOUND",
                        "message": f"{evidence_id} overstates NOT_FOUND as absolute absence",
                    }
                )

    for comparison_id, block in _blocks(text, "RR-C"):
        if not re.search(r"RR-E\d{3,}", block):
            errors.append(
                {
                    "code": "COMPARISON_WITHOUT_EVIDENCE",
                    "message": f"{comparison_id} must cite evidence IDs",
                }
            )

    for candidate_id, block in _blocks(text, "RR-O"):
        if "PROPOSED_NOT_CONFIRMED" not in block:
            errors.append(
                {
                    "code": "CANDIDATE_STATUS",
                    "message": f"{candidate_id} must remain PROPOSED_NOT_CONFIRMED",
                }
            )
        if not re.search(r"RR-E\d{3,}", block):
            errors.append(
                {
                    "code": "CANDIDATE_WITHOUT_EVIDENCE",
                    "message": f"{candidate_id} must cite evidence IDs",
                }
            )
        present_next = [value for value in NEXT_VALIDATIONS if value in block]
        if len(present_next) != 1:
            errors.append(
                {
                    "code": "NEXT_VALIDATION",
                    "message": f"{candidate_id} must contain one next validation type",
                }
            )

    status = _declared_status(text)
    if not status:
        errors.append(
            {"code": "MISSING_STATUS", "message": "Report must declare research_status"}
        )
    return errors, warnings


def _validate_workspace(
    session: dict[str, Any], report: Path
) -> tuple[list[dict[str, str]], list[dict[str, str]], dict[str, Any]]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    workspace_before = session.get("workspaceSnapshot", {})
    workspace_after = collect_git_snapshot(session["workspace"])
    workspace_change = compare_git_snapshots(
        workspace_before, workspace_after, allowed_paths=[report]
    )

    if workspace_change["headChanged"]:
        errors.append(
            {"code": "COMMIT_DETECTED", "message": "Workspace HEAD changed during research"}
        )
    if workspace_change["branchChanged"]:
        errors.append(
            {"code": "BRANCH_CHANGE_DETECTED", "message": "Workspace branch changed during research"}
        )
    if workspace_change["newStaged"] or workspace_change["changedStaged"]:
        staged_paths = sorted(
            set(workspace_change["newStaged"]) | set(workspace_change["changedStaged"])
        )
        errors.append(
            {
                "code": "STAGING_DETECTED",
                "message": "New or changed staged paths: " + ", ".join(staged_paths),
            }
        )
    if workspace_change["unexpected"]:
        errors.append(
            {
                "code": "UNEXPECTED_WORKSPACE_CHANGE",
                "message": "Unexpected changed paths: "
                + ", ".join(workspace_change["unexpected"]),
            }
        )
    if workspace_change["upstreamRefChanged"]:
        warnings.append(
            {
                "code": "UPSTREAM_REF_CHANGED",
                "message": "The locally observed upstream ref changed; local checks cannot prove whether a push occurred",
            }
        )

    reference_changes: list[dict[str, Any]] = []
    for reference in session.get("referenceSnapshots", []):
        before = reference["snapshot"]
        after = collect_git_snapshot(before["path"])
        change = compare_git_snapshots(before, after)
        change["target"] = reference["target"]
        reference_changes.append(change)
        if (
            change["headChanged"]
            or change["branchChanged"]
            or change["newStaged"]
            or change["changedStaged"]
            or change["unexpected"]
            or change["created"]
            or change["modified"]
            or change["deleted"]
        ):
            errors.append(
                {
                    "code": "REFERENCE_CHANGED",
                    "message": f"Reference worktree changed: {reference['target']}",
                }
            )

    summary = {
        "created": workspace_change["created"],
        "modified": workspace_change["modified"],
        "deleted": workspace_change["deleted"],
        "staged": bool(workspace_change["newStaged"]),
        "committed": workspace_change["headChanged"],
        "branchChanged": workspace_change["branchChanged"],
        "pushDetected": workspace_change["upstreamRefChanged"],
        "pushVerification": "LOCAL_OBSERVATION_ONLY",
        "unexpected": workspace_change["unexpected"],
        "referenceChanges": reference_changes,
    }
    return errors, warnings, summary


def validate_report(session: dict[str, Any], report_path: str | Path) -> dict[str, Any]:
    report = Path(report_path).resolve()
    if not report.exists():
        return {
            "valid": False,
            "researchStatus": "BLOCKED",
            "errors": [{"code": "REPORT_MISSING", "message": str(report)}],
            "warnings": [],
            "workspaceChange": None,
            "reportIdentity": None,
        }

    text = report.read_text(encoding="utf-8", errors="replace")
    structure_errors, structure_warnings = _validate_structure(text)
    workspace_errors, workspace_warnings, workspace_change = _validate_workspace(
        session, report
    )
    errors = structure_errors + workspace_errors
    warnings = structure_warnings + workspace_warnings
    declared = _declared_status(text)
    if errors:
        blocking_codes = {
            "REPORT_MISSING",
            "COMMIT_DETECTED",
            "STAGING_DETECTED",
            "UNEXPECTED_WORKSPACE_CHANGE",
            "REFERENCE_CHANGED",
        }
        status = (
            "BLOCKED"
            if any(error["code"] in blocking_codes for error in errors)
            else "PARTIAL"
        )
    else:
        status = declared or "COMPLETE"

    return {
        "valid": not errors,
        "researchStatus": status,
        "errors": errors,
        "warnings": warnings,
        "workspaceChange": workspace_change,
        "reportIdentity": content_identity(text),
    }
