from __future__ import annotations

import re
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote, urlparse

from .git_state import read_file_at_revision
from .models import content_identity


MAX_EXCERPT_LINES = 25
LINE_RANGE = re.compile(r"^(\d+)(?::(\d+))?$")


def _parse_lines(value: str) -> tuple[int, int]:
    match = LINE_RANGE.fullmatch(value.strip())
    if not match:
        raise ValueError("Lines must use <start> or <start>:<end>")
    start = int(match.group(1))
    end = int(match.group(2) or start)
    if start < 1 or end < start:
        raise ValueError("Line range must be positive and ordered")
    if end - start + 1 > MAX_EXCERPT_LINES:
        raise ValueError(f"Excerpt cannot exceed {MAX_EXCERPT_LINES} lines")
    return start, end


def _safe_relative_path(value: str) -> str:
    path = PurePosixPath(value.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("Citation path must be repository-relative")
    return path.as_posix()


def _github_slug(remote: str | None) -> str | None:
    if not remote:
        return None
    scp_match = re.fullmatch(r"git@github\.com:([^/]+/[^/]+?)(?:\.git)?", remote)
    if scp_match:
        return scp_match.group(1)
    parsed = urlparse(remote)
    if parsed.hostname != "github.com":
        return None
    slug = parsed.path.strip("/")
    return slug[:-4] if slug.endswith(".git") else slug


def _fixed_url(remote: str | None, revision: str, path: str, start: int, end: int) -> str | None:
    slug = _github_slug(remote)
    if not slug or not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
        return None
    anchor = f"#L{start}" if start == end else f"#L{start}-L{end}"
    return f"https://github.com/{slug}/blob/{revision}/{quote(path, safe='/')}{anchor}"


def create_citation(
    session: dict[str, Any], target_name: str, path_value: str, lines_value: str
) -> dict[str, Any]:
    relative_path = _safe_relative_path(path_value)
    start, end = _parse_lines(lines_value)
    targets = {
        target.get("name"): target for target in session.get("referenceTargets", [])
    }
    if target_name not in targets:
        raise ValueError(f"Unknown reference target: {target_name}")
    target = targets[target_name]
    revision = str(target.get("revision") or "")
    if not revision:
        raise ValueError(f"Reference target has no stable revision: {target_name}")

    excerpt = None
    total_lines = None
    local_path = target.get("localPath")
    if local_path:
        if target.get("kind") == "source-repository":
            payload = read_file_at_revision(local_path, revision, relative_path)
        else:
            payload = (Path(local_path) / Path(relative_path)).read_bytes()
        text = payload.decode("utf-8", errors="replace")
        source_lines = text.splitlines()
        total_lines = len(source_lines)
        if start > total_lines or end > total_lines:
            raise ValueError(
                f"Requested lines {start}:{end} exceed file length {total_lines}"
            )
        excerpt = "\n".join(source_lines[start - 1 : end])

    return {
        "target": target_name,
        "revision": revision,
        "path": relative_path,
        "lines": f"{start}:{end}",
        "fixedUrl": _fixed_url(
            target.get("sourceUrl"), revision, relative_path, start, end
        ),
        "excerpt": excerpt,
        "excerptIdentity": content_identity(excerpt) if excerpt is not None else None,
        "fileLineCount": total_lines,
    }
