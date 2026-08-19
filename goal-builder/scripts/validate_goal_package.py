#!/usr/bin/env python3
"""Validate structure, local links, and authority markers in a Goal package."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


FORMAL_MARKERS = (
    re.compile(r"^Status:\s*(open|claimed|resolved)\s*$", re.MULTILINE),
    re.compile(r"^#{2,6}\s+(Product question|Answer)\b", re.MULTILINE),
)


def markdown_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.md") if path.is_file())


def validate_file(path: Path, strict: bool) -> list[str]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not text.endswith("\n"):
        errors.append(f"{path}: missing final newline")
    for number, line in enumerate(lines, start=1):
        if line.rstrip(" \t") != line:
            errors.append(f"{path}:{number}: trailing whitespace")

    headings: list[tuple[int, int]] = []
    for number, line in enumerate(lines, start=1):
        match = re.match(r"^(#{1,6})\s+", line)
        if match:
            headings.append((len(match.group(1)), number))
    if sum(level == 1 for level, _ in headings) != 1:
        errors.append(f"{path}: expected exactly one H1")
    for previous, current in zip(headings, headings[1:]):
        if current[0] > previous[0] + 1:
            errors.append(f"{path}:{current[1]}: heading jump H{previous[0]} -> H{current[0]}")

    for marker in FORMAL_MARKERS:
        if marker.search(text):
            errors.append(f"{path}: contains tracker-like formal authority marker")

    for match in re.finditer(r"\[[^\]]*\]\(([^)]+)\)", text):
        target = match.group(1).split("#", 1)[0]
        if not target or re.match(r"^(https?|mailto|app):", target):
            continue
        linked = Path(target) if Path(target).is_absolute() else path.parent / target
        if not linked.resolve().exists():
            errors.append(f"{path}: broken local link {match.group(1)}")

    if strict and ("TODO" in text or re.search(r"\{\{[A-Z0-9_]+\}\}", text)):
        errors.append(f"{path}: unresolved TODO or template variable")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    root = args.package.expanduser().resolve()
    required = {"README.md", "GOAL-PROMPT.md", "00-goal-contract.md", "progress.md"}
    errors: list[str] = []
    if not root.is_dir():
        parser.error(f"package directory does not exist: {root}")
    missing = sorted(name for name in required if not (root / name).is_file())
    if missing:
        errors.append(f"{root}: missing required files: {', '.join(missing)}")

    files = markdown_files(root)
    for path in files:
        errors.extend(validate_file(path, args.strict))

    stage_files = sorted(root.glob("[0-9][0-9]-*.md"))
    actual = [int(path.name[:2]) for path in stage_files]
    expected = list(range(0, len(stage_files)))
    if actual != expected:
        errors.append(f"{root}: stage numbering is not continuous from 00: {actual}")

    if errors:
        print(f"Goal package validation failed with {len(errors)} error(s):")
        for error in errors:
            print(f"- {error}")
        return 1
    print(
        f"Goal package valid: {len(files)} Markdown file(s), "
        f"{max(len(stage_files) - 1, 0)} execution stage(s), strict={args.strict}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
