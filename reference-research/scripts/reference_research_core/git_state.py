from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path
from typing import Any, Iterable


def _run_git(root: Path, *args: str) -> tuple[int, bytes, str]:
    completed = subprocess.run(
        ["git", *args],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return (
        completed.returncode,
        completed.stdout,
        completed.stderr.decode("utf-8", errors="replace").strip(),
    )


def _git_text(root: Path, *args: str) -> str | None:
    code, output, _ = _run_git(root, *args)
    if code != 0:
        return None
    return output.decode("utf-8", errors="replace").strip() or None


def _file_identity(path: Path) -> str | None:
    if not path.exists() and not path.is_symlink():
        return None
    if path.is_symlink():
        return f"symlink:{os.readlink(path)}"
    if path.is_dir():
        return "directory"
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _parse_status(output: bytes) -> list[dict[str, Any]]:
    chunks = output.split(b"\0")
    entries: list[dict[str, Any]] = []
    index = 0
    while index < len(chunks):
        raw = chunks[index]
        index += 1
        if not raw:
            continue
        text = raw.decode("utf-8", errors="surrogateescape")
        if len(text) < 3:
            continue
        xy = text[:2]
        path = text[3:].replace("\\", "/")
        original_path = None
        if (xy[0] in "RC" or xy[1] in "RC") and index < len(chunks):
            original_path = chunks[index].decode(
                "utf-8", errors="surrogateescape"
            ).replace("\\", "/")
            index += 1
        entries.append(
            {
                "xy": xy,
                "path": path,
                "originalPath": original_path,
                "staged": xy[0] not in {" ", "?", "!"},
                "unstaged": xy[1] not in {" ", "?", "!"},
                "untracked": xy == "??",
            }
        )
    return entries


def collect_git_snapshot(location: str | Path) -> dict[str, Any]:
    root = Path(location).resolve()
    snapshot: dict[str, Any] = {
        "path": str(root),
        "exists": root.exists(),
        "isGit": False,
        "head": None,
        "branch": None,
        "upstream": None,
        "upstreamHead": None,
        "remote": None,
        "status": [],
        "fingerprints": {},
        "indexFingerprints": {},
        "error": None,
    }
    if not root.exists():
        snapshot["error"] = "Path does not exist"
        return snapshot

    code, output, error = _run_git(root, "rev-parse", "--is-inside-work-tree")
    if code != 0 or output.strip() != b"true":
        snapshot["error"] = error or "Not a Git worktree"
        return snapshot

    snapshot["isGit"] = True
    snapshot["head"] = _git_text(root, "rev-parse", "HEAD")
    snapshot["branch"] = _git_text(root, "branch", "--show-current")
    snapshot["upstream"] = _git_text(
        root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"
    )
    snapshot["upstreamHead"] = _git_text(root, "rev-parse", "@{u}")
    snapshot["remote"] = _git_text(root, "remote", "get-url", "origin")

    status_code, status_output, status_error = _run_git(
        root, "status", "--porcelain=v1", "-z", "--untracked-files=all"
    )
    if status_code != 0:
        snapshot["error"] = status_error or "Unable to read Git status"
        return snapshot

    status = _parse_status(status_output)
    snapshot["status"] = status
    paths: set[str] = set()
    for entry in status:
        paths.add(entry["path"])
        if entry.get("originalPath"):
            paths.add(entry["originalPath"])
    snapshot["fingerprints"] = {
        path: _file_identity(root / Path(path)) for path in sorted(paths)
    }
    snapshot["indexFingerprints"] = {
        entry["path"]: _git_text(root, "rev-parse", f":{entry['path']}")
        for entry in status
        if entry.get("staged")
    }
    return snapshot


def resolve_revision(location: str | Path, revision: str | None) -> str | None:
    root = Path(location).resolve()
    if not root.exists():
        return None
    expression = f"{revision}^{{commit}}" if revision else "HEAD"
    return _git_text(root, "rev-parse", expression)


def read_file_at_revision(
    location: str | Path, revision: str, relative_path: str
) -> bytes:
    root = Path(location).resolve()
    code, output, error = _run_git(root, "show", f"{revision}:{relative_path}")
    if code != 0:
        raise ValueError(error or f"Unable to read {relative_path} at {revision}")
    return output


def _status_by_path(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {entry["path"]: entry for entry in snapshot.get("status", [])}


def _normalize_allowed(root: Path, allowed_paths: Iterable[str | Path]) -> set[str]:
    normalized: set[str] = set()
    for value in allowed_paths:
        path = Path(value)
        absolute = path.resolve() if path.is_absolute() else (root / path).resolve()
        try:
            relative = absolute.relative_to(root)
        except ValueError:
            continue
        normalized.add(relative.as_posix())
    return normalized


def compare_git_snapshots(
    before: dict[str, Any],
    after: dict[str, Any],
    allowed_paths: Iterable[str | Path] = (),
) -> dict[str, Any]:
    root = Path(before["path"]).resolve()
    allowed = _normalize_allowed(root, allowed_paths)
    before_status = _status_by_path(before)
    after_status = _status_by_path(after)
    before_fingerprints = before.get("fingerprints", {})
    after_fingerprints = after.get("fingerprints", {})
    before_index = before.get("indexFingerprints", {})
    after_index = after.get("indexFingerprints", {})

    changed_paths: set[str] = set()
    for path in set(before_status) | set(after_status):
        if before_status.get(path) != after_status.get(path):
            changed_paths.add(path)
        if before_fingerprints.get(path) != after_fingerprints.get(path):
            changed_paths.add(path)
    changed_staged = {
        path
        for path in set(before_index) | set(after_index)
        if before_index.get(path) != after_index.get(path)
    }
    changed_paths.update(changed_staged)

    created = sorted(
        path
        for path in changed_paths
        if before_fingerprints.get(path) is None
        and after_fingerprints.get(path) is not None
    )
    deleted = sorted(
        path
        for path in changed_paths
        if before_fingerprints.get(path) is not None
        and after_fingerprints.get(path) is None
    )
    modified = sorted(set(changed_paths) - set(created) - set(deleted))

    before_staged = {
        path for path, entry in before_status.items() if entry.get("staged")
    }
    after_staged = {
        path for path, entry in after_status.items() if entry.get("staged")
    }
    new_staged = sorted(after_staged - before_staged)

    return {
        "path": str(root),
        "headChanged": before.get("head") != after.get("head"),
        "branchChanged": before.get("branch") != after.get("branch"),
        "upstreamRefChanged": before.get("upstreamHead")
        != after.get("upstreamHead"),
        "created": created,
        "modified": modified,
        "deleted": deleted,
        "newStaged": new_staged,
        "changedStaged": sorted(changed_staged),
        "unexpected": sorted(path for path in changed_paths if path not in allowed),
        "allowed": sorted(path for path in changed_paths if path in allowed),
    }
