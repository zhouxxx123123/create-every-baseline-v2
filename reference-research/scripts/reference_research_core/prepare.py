from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .git_state import collect_git_snapshot, resolve_revision
from .models import canonical_json, content_identity


FULL_SHA = re.compile(r"^[0-9a-fA-F]{40}$")


def _slugify(value: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]+", value.lower())
    stem = "-".join(words)[:72].strip("-") or "reference-research"
    suffix = content_identity(value).split(":", 1)[1][:8]
    return f"{stem}-{suffix}"


def _resolve_path(value: str, workspace: Path) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (workspace / path).resolve()


def _default_report_path(workspace: Path, question: str) -> Path:
    if (workspace / "docs" / "research").exists():
        directory = workspace / "docs" / "research"
    elif (workspace / "docs" / "references").exists():
        directory = workspace / "docs" / "references"
    else:
        directory = workspace / "docs" / "research"
    return directory / f"{_slugify(question)}.md"


def _search_terms(request: dict[str, Any]) -> list[str]:
    values = [request.get("question", "")]
    for target in request.get("referenceTargets", []):
        values.append(str(target.get("name", "")))
        values.extend(str(item) for item in target.get("focus", []))
    terms: set[str] = set()
    for value in values:
        for term in re.findall(r"[A-Za-z0-9_-]{3,}|[\u4e00-\u9fff]{2,}", value):
            terms.add(term.lower())
    return sorted(terms)


def _find_related_research(
    workspace: Path, roots: list[str], terms: list[str]
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for root_value in roots:
        root = _resolve_path(root_value, workspace)
        if not root.exists() or not root.is_dir():
            continue
        for path in root.rglob("*.md"):
            try:
                text = path.read_text(encoding="utf-8", errors="replace").lower()
            except OSError:
                continue
            haystack = f"{path.name.lower()}\n{text}"
            matched = [term for term in terms if term in haystack]
            if matched:
                matches.append(
                    {
                        "path": str(path.resolve()),
                        "score": len(matched),
                        "matchedTerms": matched,
                    }
                )
    matches.sort(key=lambda item: (-item["score"], item["path"]))
    return matches[:20]


def _target_identity(
    target: dict[str, Any], workspace: Path
) -> tuple[dict[str, Any], list[dict[str, str]], dict[str, Any] | None]:
    issues: list[dict[str, str]] = []
    location_value = str(target.get("location", "")).strip()
    requested_revision = str(target.get("revision", "")).strip() or None
    local_path: Path | None = None
    snapshot: dict[str, Any] | None = None

    if location_value:
        candidate = _resolve_path(location_value, workspace)
        if candidate.exists():
            local_path = candidate
            snapshot = collect_git_snapshot(candidate)

    kind = str(target.get("kind", "source-repository"))
    pinned_revision = requested_revision
    source_url = location_value

    if local_path and snapshot and snapshot.get("isGit"):
        resolved = resolve_revision(local_path, requested_revision)
        if not resolved:
            issues.append(
                {
                    "severity": "BLOCKING",
                    "message": f"Unable to resolve revision for {target.get('name')}",
                }
            )
        else:
            pinned_revision = resolved
        source_url = snapshot.get("remote") or location_value
    elif kind == "source-repository":
        if local_path and snapshot and not snapshot.get("isGit"):
            issues.append(
                {
                    "severity": "BLOCKING",
                    "message": f"Local source repository is not a Git worktree: {local_path}",
                }
            )
        if not location_value:
            issues.append(
                {"severity": "BLOCKING", "message": "Reference location is missing"}
            )
        if not requested_revision or not FULL_SHA.fullmatch(requested_revision):
            issues.append(
                {
                    "severity": "BLOCKING",
                    "message": (
                        f"Remote source repository {target.get('name')} requires a full "
                        "40-character commit"
                    ),
                }
            )

    identity = {
        "name": str(target.get("name", "")).strip(),
        "kind": kind,
        "location": location_value,
        "localPath": str(local_path) if local_path else None,
        "sourceUrl": source_url,
        "requestedRevision": requested_revision,
        "revision": pinned_revision,
        "headMatchesRevision": bool(
            snapshot
            and snapshot.get("head")
            and pinned_revision
            and snapshot.get("head") == pinned_revision
        ),
        "focus": list(target.get("focus", [])),
        "mustInspect": list(target.get("mustInspect", [])),
    }
    return identity, issues, snapshot


def prepare_request(request: dict[str, Any]) -> dict[str, Any]:
    question = str(request.get("question", "")).strip()
    workspace = Path(request.get("workspace") or Path.cwd()).resolve()
    issues: list[dict[str, str]] = []

    if not question:
        issues.append({"severity": "BLOCKING", "message": "Question is required"})
    if not workspace.exists():
        issues.append(
            {
                "severity": "BLOCKING",
                "message": f"Workspace does not exist: {workspace}",
            }
        )

    origin = request.get("origin") or {}
    for field in ("workflow", "unresolvedQuestion", "resumeTarget"):
        if not str(origin.get(field, "")).strip():
            issues.append(
                {
                    "severity": "BLOCKING",
                    "message": f"Origin field is required: {field}",
                }
            )

    target_requests = request.get("referenceTargets") or []
    if not target_requests:
        issues.append(
            {"severity": "BLOCKING", "message": "At least one reference target is required"}
        )

    workspace_snapshot = collect_git_snapshot(workspace)
    if workspace.exists() and not workspace_snapshot.get("isGit"):
        issues.append(
            {
                "severity": "BLOCKING",
                "message": f"Workspace is not a Git worktree: {workspace}",
            }
        )
    targets: list[dict[str, Any]] = []
    reference_snapshots: list[dict[str, Any]] = []
    names: set[str] = set()
    for target_request in target_requests:
        target, target_issues, snapshot = _target_identity(target_request, workspace)
        if not target["name"]:
            target_issues.append(
                {"severity": "BLOCKING", "message": "Reference target name is required"}
            )
        elif target["name"] in names:
            target_issues.append(
                {
                    "severity": "BLOCKING",
                    "message": f"Duplicate reference target name: {target['name']}",
                }
            )
        names.add(target["name"])
        targets.append(target)
        issues.extend(target_issues)
        if snapshot:
            reference_snapshots.append(
                {"target": target["name"], "snapshot": snapshot}
            )

    report_value = request.get("reportPath")
    report_path = (
        _resolve_path(str(report_value), workspace)
        if report_value
        else _default_report_path(workspace, question)
    )
    if report_path.exists():
        issues.append(
            {
                "severity": "BLOCKING",
                "message": f"Report path already exists; choose a new report path: {report_path}",
            }
        )
    try:
        report_path.relative_to(workspace)
    except ValueError:
        issues.append(
            {
                "severity": "BLOCKING",
                "message": f"Report path must be inside the workspace: {report_path}",
            }
        )
    for protected_value in request.get("protectedPaths", []):
        protected = _resolve_path(str(protected_value), workspace)
        if report_path == protected or protected in report_path.parents:
            issues.append(
                {
                    "severity": "BLOCKING",
                    "message": f"Report path is protected: {report_path}",
                }
            )
    research_roots = list(
        request.get("researchRoots")
        or ["docs/research", "docs/references", ".research"]
    )
    terms = _search_terms(request)
    related = _find_related_research(workspace, research_roots, terms)

    session: dict[str, Any] = {
        "schemaVersion": 1,
        "phase": "BLOCKED"
        if any(issue["severity"] == "BLOCKING" for issue in issues)
        else "SCOPE_LOCKED",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "question": question,
        "origin": origin,
        "evidenceNeeded": list(request.get("evidenceNeeded", [])),
        "workspace": str(workspace),
        "workspaceSnapshot": workspace_snapshot,
        "referenceTargets": targets,
        "referenceSnapshots": reference_snapshots,
        "reportPath": str(report_path),
        "protectedPaths": list(request.get("protectedPaths", [])),
        "relatedResearch": related,
        "issues": issues,
    }
    identity_source = dict(session)
    identity_source.pop("createdAt", None)
    session["baselineIdentity"] = content_identity(canonical_json(identity_source))
    return session
