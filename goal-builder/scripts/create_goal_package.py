#!/usr/bin/env python3
"""Create a non-destructive scaffold for a staged Goal task package."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import tempfile
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_ROOT = SKILL_ROOT / "assets" / "task-package"


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value


def render(template_name: str, values: dict[str, str]) -> str:
    text = (TEMPLATE_ROOT / template_name).read_text(encoding="utf-8")
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    unresolved = sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", text)))
    if unresolved:
        raise ValueError(f"unresolved template variables in {template_name}: {unresolved}")
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="repository root")
    parser.add_argument("--slug", required=True, help="package directory name")
    parser.add_argument("--title", required=True, help="human-facing Goal title")
    parser.add_argument("--stage", action="append", required=True, help="stage title; repeat in order")
    parser.add_argument("--output", type=Path, help="exact package path; defaults to ROOT/.scratch/SLUG")
    args = parser.parse_args()

    root = args.root.expanduser().resolve()
    if not root.is_dir():
        parser.error(f"repository root does not exist: {root}")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", args.slug):
        parser.error("slug must contain only lowercase ASCII letters, digits, and hyphens")
    package = (args.output.expanduser().resolve() if args.output else root / ".scratch" / args.slug)
    if package.exists():
        parser.error(f"refusing to overwrite existing path: {package}")

    stages: list[tuple[int, str, str]] = []
    used: set[str] = set()
    for index, title in enumerate(args.stage, start=1):
        stage_slug = slugify(title) or f"stage-{index:02d}"
        if stage_slug in used:
            parser.error(f"duplicate normalized stage title: {title}")
        used.add(stage_slug)
        stages.append((index, title.strip(), f"{index:02d}-{stage_slug}.md"))

    package.parent.mkdir(parents=True, exist_ok=True)
    values = {
        "TITLE": args.title.strip(),
        "REPO_ROOT": str(root),
        "ABS_PACKAGE": str(package),
        "FIRST_STAGE_FILE": stages[0][2],
        "CREATED_AT": dt.datetime.now(dt.timezone.utc).isoformat(),
        "STAGE_LIST_RELATIVE": "\n".join(
            f"{i}. [{title}](./{filename})" for i, title, filename in stages
        ),
        "STAGE_LIST_ABSOLUTE": "\n".join(
            f"{i}. [{title}]({package}/{filename})" for i, title, filename in stages
        ),
        "STAGE_TABLE": "\n".join(
            f"| {i}. {title} | `NOT_STARTED` | - | - | - |" for i, title, _ in stages
        ),
    }

    with tempfile.TemporaryDirectory(dir=package.parent, prefix=f".{package.name}-") as temporary:
        staging = Path(temporary)
        (staging / "README.md").write_text(render("README.md.tmpl", values), encoding="utf-8")
        (staging / "GOAL-PROMPT.md").write_text(render("GOAL-PROMPT.md.tmpl", values), encoding="utf-8")
        (staging / "00-goal-contract.md").write_text(render("00-goal-contract.md.tmpl", values), encoding="utf-8")
        (staging / "progress.md").write_text(render("progress.md.tmpl", values), encoding="utf-8")

        for offset, (index, title, filename) in enumerate(stages):
            previous_link = ""
            if offset:
                previous_link = f" · [上一阶段](./{stages[offset - 1][2]})"
            next_link = ""
            next_handoff = "返回原始工作流，按照总契约汇报。"
            if offset + 1 < len(stages):
                next_file = stages[offset + 1][2]
                next_link = f" · [下一阶段](./{next_file})"
                next_handoff = f"完成后进入[阶段 {index + 1}](./{next_file})。"
            stage_values = values | {
                "STAGE_INDEX": str(index),
                "STAGE_TITLE": title,
                "PREVIOUS_LINK": previous_link,
                "NEXT_LINK": next_link,
                "NEXT_HANDOFF": next_handoff,
            }
            (staging / filename).write_text(render("stage.md.tmpl", stage_values), encoding="utf-8")
        staging.rename(package)

    print(f"Created Goal package scaffold: {package}")
    print("The scaffold contains TODO markers and must be customized before strict validation or execution.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
