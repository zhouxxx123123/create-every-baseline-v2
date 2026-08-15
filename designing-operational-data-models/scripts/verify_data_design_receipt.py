#!/usr/bin/env python3
"""Verify an operational data design receipt against its current design file."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from create_data_design_receipt import BEGIN_MARKER, END_MARKER, RECEIPT_SCHEMA_VERSION
from validate_operational_data_design import VALIDATOR_VERSION, validate_design


def parse_receipt(text: str) -> dict[str, Any]:
    if BEGIN_MARKER not in text or END_MARKER not in text:
        raise ValueError("Receipt machine identity markers are missing.")
    payload = text.split(BEGIN_MARKER, 1)[1].split(END_MARKER, 1)[0].strip()
    record = json.loads(payload)
    if not isinstance(record, dict):
        raise ValueError("Receipt machine identity must be a JSON object.")
    return record


def verify_receipt(receipt_path: Path) -> dict[str, Any]:
    record = parse_receipt(receipt_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    if record.get("receipt_schema_version") != RECEIPT_SCHEMA_VERSION:
        errors.append("Unsupported receipt schema version.")
    if record.get("validator_version") != VALIDATOR_VERSION:
        errors.append("Receipt validator version is stale.")
    gate = record.get("gate")
    if gate not in {"READY_FOR_SPEC", "READY_FOR_TICKETS"}:
        errors.append("Receipt gate is invalid.")

    design_ref = record.get("design_path")
    if not isinstance(design_ref, str) or not design_ref.strip():
        errors.append("Receipt design_path is missing.")
        design_path = receipt_path.parent
    else:
        candidate = Path(design_ref)
        design_path = candidate if candidate.is_absolute() else receipt_path.parent / candidate

    design: Any = None
    if not design_path.is_file():
        errors.append(f"Design file is missing: {design_path}")
    else:
        raw = design_path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != record.get("design_sha256"):
            errors.append("Design SHA-256 does not match the immutable receipt.")
        expected_receipt_id = f"{record.get('design_id')}:{gate}:{digest[:16]}"
        if record.get("receipt_id") != expected_receipt_id:
            errors.append("Receipt ID does not match its design, gate, and digest.")
        try:
            design = json.loads(raw.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError) as error:
            errors.append(f"Design JSON cannot be read: {error}")

    validation: dict[str, Any] | None = None
    if isinstance(design, dict) and gate in {"READY_FOR_SPEC", "READY_FOR_TICKETS"}:
        validation = validate_design(design, gate)
        if validation["verdict"] != "PASS":
            errors.append("Current design no longer passes the receipt gate.")
        for field in ("design_id", "target", "boundary"):
            if design.get(field) != record.get(field):
                errors.append(f"Receipt {field} does not match the design.")
        source_ids = sorted(
            item["stable_id"]
            for item in design.get("source_authorities", [])
            if isinstance(item, dict) and isinstance(item.get("stable_id"), str)
        )
        if source_ids != record.get("source_authority_ids"):
            errors.append("Receipt source authority IDs do not match the design.")
        if design.get("package_acceptance") != record.get("package_acceptance"):
            errors.append("Receipt package acceptance does not match the design.")

    return {
        "verdict": "PASS" if not errors else "FAIL",
        "receipt_id": record.get("receipt_id"),
        "gate": gate,
        "design_path": str(design_path.resolve()),
        "validator_version": VALIDATOR_VERSION,
        "errors": errors,
        "validation": validation,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--format", choices=("text", "json"), default="text")
    args = parser.parse_args(argv)

    try:
        result = verify_receipt(args.receipt)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        print(f"Unable to verify receipt: {error}", file=sys.stderr)
        return 2

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"Receipt: {result.get('receipt_id') or '<unknown>'}")
        print(f"Gate: {result.get('gate') or '<unknown>'}")
        print(f"Verdict: {result['verdict']}")
        for error in result["errors"]:
            print(f"ERROR: {error}")
    return 0 if result["verdict"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
