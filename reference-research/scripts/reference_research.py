#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from reference_research_core import create_citation, prepare_request, validate_report
from reference_research_core.models import load_json, write_json


def _emit(value: Any, output: str | None = None) -> None:
    if output:
        write_json(output, value)
    else:
        json.dump(value, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deterministic guardrails for the reference-research skill"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare", help="Create a read-only research session")
    prepare.add_argument("request", help="ReferenceResearchRequest JSON")
    prepare.add_argument("--output", help="Optional session JSON output path")

    cite = subparsers.add_parser("cite", help="Create a fixed source citation")
    cite.add_argument("--session", required=True, help="Prepared session JSON")
    cite.add_argument("--target", required=True, help="Reference target name")
    cite.add_argument("--path", required=True, help="Repository-relative source path")
    cite.add_argument("--lines", required=True, help="Line or inclusive start:end range")
    cite.add_argument("--output", help="Optional citation JSON output path")

    check = subparsers.add_parser("check", help="Validate a report and workspace delta")
    check.add_argument("--session", required=True, help="Prepared session JSON")
    check.add_argument("--report", required=True, help="Research report Markdown")
    check.add_argument("--output", help="Optional validation JSON output path")
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        if args.command == "prepare":
            value = prepare_request(load_json(args.request))
        elif args.command == "cite":
            value = create_citation(
                load_json(args.session), args.target, args.path, args.lines
            )
        else:
            value = validate_report(load_json(args.session), Path(args.report))
        _emit(value, args.output)
        if value.get("phase") == "BLOCKED":
            return 1
        return 0 if value.get("valid", True) else 1
    except (OSError, ValueError, json.JSONDecodeError) as error:
        json.dump(
            {"error": type(error).__name__, "message": str(error)},
            sys.stderr,
            ensure_ascii=False,
        )
        sys.stderr.write("\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
