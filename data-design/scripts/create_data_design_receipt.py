#!/usr/bin/env python3
"""Create an immutable receipt for a validated operational data design."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from validate_operational_data_design import VALIDATOR_VERSION, validate_design


RECEIPT_SCHEMA_VERSION = "1.2"
BEGIN_MARKER = "<!-- OPERATIONAL_DATA_DESIGN_RECEIPT_V2_BEGIN"
END_MARKER = "OPERATIONAL_DATA_DESIGN_RECEIPT_V2_END -->"


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _relative_or_absolute(target: Path, base: Path) -> str:
    try:
        return os.path.relpath(target.resolve(), base.resolve()).replace("\\", "/")
    except ValueError:
        return str(target.resolve())


def build_receipt_id(record: dict[str, Any]) -> str:
    identity = {key: value for key, value in record.items() if key != "receipt_id"}
    digest = _sha256(json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    return f"{record.get('design_id')}:{record.get('gate')}:{digest[:24]}"


def render_receipt(record: dict[str, Any]) -> str:
    machine = json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True)
    return (
        f"# Operational data design receipt: {record.get('design_id')}\n\n"
        f"- Receipt: `{record.get('receipt_id')}`\n"
        f"- Gate: `{record.get('gate')}`\n"
        f"- Target: {record.get('target')}\n"
        f"- Created: `{record.get('created_at')}`\n"
        f"- Design SHA-256: `{record.get('design_sha256')}`\n\n"
        f"- Human design SHA-256: `{record.get('human_design_sha256')}`\n\n"
        "This receipt binds the exact machine contract and human companion bytes present when the machine contract passed the named validator gate. "
        "It is workflow evidence, not product authority, and must not be edited in place.\n\n"
        f"{BEGIN_MARKER}\n{machine}\n{END_MARKER}\n"
    )


def _validate_human_companion(human_raw: bytes, design: dict[str, Any]) -> None:
    try:
        text = human_raw.decode("utf-8")
    except UnicodeError as error:
        raise ValueError(f"The human design companion must be UTF-8: {error}") from error
    if re.search(r"\b(?:TBD|TODO|FIXME|PLACEHOLDER)\b", text, flags=re.IGNORECASE):
        raise ValueError("The human design companion contains unresolved placeholder text.")
    required_tokens = {str(design.get("design_id") or ""), str(design.get("target") or "")}
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
        required_tokens.update(
            str(item["stable_id"])
            for item in design.get(collection, [])
            if isinstance(item, dict)
            and isinstance(item.get("stable_id"), str)
            and item.get("validation_status") != "NOT_APPLICABLE"
        )
    missing = sorted(token for token in required_tokens if token and token not in text)
    if missing:
        raise ValueError(f"The human design companion is missing machine-contract identities: {', '.join(missing)}")


def build_receipt(
    design_path: Path,
    output_path: Path,
    gate: str,
    *,
    human_design_path: Path | None = None,
) -> tuple[dict[str, Any], str]:
    raw = design_path.read_bytes()
    design = json.loads(raw.decode("utf-8"))
    validation = validate_design(design, gate, design_path)
    if validation["verdict"] != "PASS":
        raise ValueError(json.dumps(validation, ensure_ascii=False, indent=2))

    if human_design_path is None or not human_design_path.is_file():
        raise ValueError("A readable human design companion is required to create a receipt.")
    human_raw = human_design_path.read_bytes()
    if not human_raw.strip():
        raise ValueError("The human design companion must not be empty.")
    _validate_human_companion(human_raw, design)

    source_authority_ids = sorted(
        item["stable_id"]
        for item in design.get("source_authorities", [])
        if isinstance(item, dict) and isinstance(item.get("stable_id"), str)
    )
    source_authority_digests = {
        item["stable_id"]: item["content_sha256"].lower()
        for item in design.get("source_authorities", [])
        if isinstance(item, dict)
        and isinstance(item.get("stable_id"), str)
        and isinstance(item.get("content_sha256"), str)
    }
    digest = _sha256(raw)
    human_digest = _sha256(human_raw)
    record = {
        "receipt_schema_version": RECEIPT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "gate": gate,
        "validator_version": VALIDATOR_VERSION,
        "design_path": _relative_or_absolute(design_path, output_path.parent),
        "design_sha256": digest,
        "human_design_path": _relative_or_absolute(human_design_path, output_path.parent),
        "human_design_sha256": human_digest,
        "design_id": design["design_id"],
        "target": design["target"],
        "boundary": design["boundary"],
        "source_authority_ids": source_authority_ids,
        "source_authority_digests": source_authority_digests,
        "admission": design.get("admission"),
        "quality_review": design.get("quality_review"),
        "package_acceptance": design.get("package_acceptance"),
    }
    record["receipt_id"] = build_receipt_id(record)
    markdown = render_receipt(record)
    return record, markdown


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("design", type=Path)
    parser.add_argument("--human-design", required=True, type=Path)
    parser.add_argument("--gate", required=True, choices=("READY_FOR_SPEC", "READY_FOR_TICKETS"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)

    if args.output.exists():
        print(f"Refusing to overwrite existing receipt: {args.output}", file=sys.stderr)
        return 2
    try:
        _, markdown = build_receipt(
            args.design,
            args.output,
            args.gate,
            human_design_path=args.human_design,
        )
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
