#!/usr/bin/env python3
"""Create an immutable receipt for a validated operational data design."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from validate_operational_data_design import VALIDATOR_VERSION, validate_design


RECEIPT_SCHEMA_VERSION = "1.0"
BEGIN_MARKER = "<!-- OPERATIONAL_DATA_DESIGN_RECEIPT_V1_BEGIN"
END_MARKER = "OPERATIONAL_DATA_DESIGN_RECEIPT_V1_END -->"


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _relative_or_absolute(target: Path, base: Path) -> str:
    try:
        return os.path.relpath(target.resolve(), base.resolve()).replace("\\", "/")
    except ValueError:
        return str(target.resolve())


def build_receipt(design_path: Path, output_path: Path, gate: str) -> tuple[dict[str, Any], str]:
    raw = design_path.read_bytes()
    design = json.loads(raw.decode("utf-8"))
    validation = validate_design(design, gate)
    if validation["verdict"] != "PASS":
        raise ValueError(json.dumps(validation, ensure_ascii=False, indent=2))

    source_authority_ids = sorted(
        item["stable_id"]
        for item in design.get("source_authorities", [])
        if isinstance(item, dict) and isinstance(item.get("stable_id"), str)
    )
    digest = _sha256(raw)
    receipt_id = f"{design['design_id']}:{gate}:{digest[:16]}"
    record = {
        "receipt_schema_version": RECEIPT_SCHEMA_VERSION,
        "receipt_id": receipt_id,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "gate": gate,
        "validator_version": VALIDATOR_VERSION,
        "design_path": _relative_or_absolute(design_path, output_path.parent),
        "design_sha256": digest,
        "design_id": design["design_id"],
        "target": design["target"],
        "boundary": design["boundary"],
        "source_authority_ids": source_authority_ids,
        "package_acceptance": design.get("package_acceptance"),
    }
    machine = json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True)
    markdown = (
        f"# Operational data design receipt: {record['design_id']}\n\n"
        f"- Receipt: `{record['receipt_id']}`\n"
        f"- Gate: `{gate}`\n"
        f"- Target: {record['target']}\n"
        f"- Created: `{record['created_at']}`\n"
        f"- Design SHA-256: `{digest}`\n\n"
        "This receipt proves that the exact referenced design bytes passed the named validator gate. "
        "It is workflow evidence, not product authority, and must not be edited in place.\n\n"
        f"{BEGIN_MARKER}\n{machine}\n{END_MARKER}\n"
    )
    return record, markdown


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("design", type=Path)
    parser.add_argument("--gate", required=True, choices=("READY_FOR_SPEC", "READY_FOR_TICKETS"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)

    if args.output.exists():
        print(f"Refusing to overwrite existing receipt: {args.output}", file=sys.stderr)
        return 2
    try:
        _, markdown = build_receipt(args.design, args.output, args.gate)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(markdown)
    except FileExistsError:
        print(f"Refusing to overwrite existing receipt: {args.output}", file=sys.stderr)
        return 2
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        print(f"Unable to create receipt: {error}", file=sys.stderr)
        return 1
    print(f"Created immutable receipt: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
