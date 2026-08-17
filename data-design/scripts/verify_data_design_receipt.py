#!/usr/bin/env python3
"""Verify an operational data design receipt against its current design file."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from create_data_design_receipt import (
    BEGIN_MARKER,
    END_MARKER,
    RECEIPT_SCHEMA_VERSION,
    build_receipt_id,
    render_receipt,
)
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
    receipt_text = receipt_path.read_text(encoding="utf-8")
    record = parse_receipt(receipt_text)
    errors: list[str] = []

    if receipt_text != render_receipt(record):
        errors.append("Receipt visible content does not match its machine identity.")

    if record.get("receipt_schema_version") != RECEIPT_SCHEMA_VERSION:
        errors.append("Unsupported receipt schema version.")
    if record.get("validator_version") != VALIDATOR_VERSION:
        errors.append("Receipt validator version is stale.")
    created_at = record.get("created_at")
    parsed_created_at: datetime | None = None
    try:
        parsed_created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if parsed_created_at.tzinfo is None:
            raise ValueError
        if parsed_created_at > datetime.now(timezone.utc) + timedelta(minutes=5):
            errors.append("Receipt created_at is in the future.")
    except (AttributeError, TypeError, ValueError):
        errors.append("Receipt created_at is missing or invalid.")
    gate = record.get("gate")
    if gate not in {"READY_FOR_SPEC", "READY_FOR_TICKETS"}:
        errors.append("Receipt gate is invalid.")

    required_fields = {
        "receipt_schema_version",
        "receipt_id",
        "created_at",
        "gate",
        "validator_version",
        "design_path",
        "design_sha256",
        "human_design_path",
        "human_design_sha256",
        "design_id",
        "target",
        "boundary",
        "source_authority_ids",
        "source_authority_digests",
        "admission",
        "quality_review",
        "package_acceptance",
    }
    for field in sorted(required_fields - set(record)):
        errors.append(f"Receipt required field is missing: {field}.")
    authority_digests = record.get("source_authority_digests")
    if not isinstance(authority_digests, dict) or not authority_digests:
        errors.append("Receipt source authority digests are missing or invalid.")

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
        try:
            design = json.loads(raw.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError) as error:
            errors.append(f"Design JSON cannot be read: {error}")

    human_ref = record.get("human_design_path")
    if not isinstance(human_ref, str) or not human_ref.strip():
        errors.append("Receipt human_design_path is missing.")
        human_path = receipt_path.parent
        human_digest = ""
    else:
        candidate = Path(human_ref)
        human_path = candidate if candidate.is_absolute() else receipt_path.parent / candidate
        if not human_path.is_file():
            errors.append(f"Human design file is missing: {human_path}")
            human_digest = ""
        else:
            human_digest = hashlib.sha256(human_path.read_bytes()).hexdigest()
            if human_digest != record.get("human_design_sha256"):
                errors.append("Human design SHA-256 does not match the immutable receipt.")

    if design_path.is_file() and human_digest and gate in {"READY_FOR_SPEC", "READY_FOR_TICKETS"}:
        digest = hashlib.sha256(design_path.read_bytes()).hexdigest()
        expected_receipt_id = build_receipt_id(record)
        if record.get("receipt_id") != expected_receipt_id:
            errors.append("Receipt ID does not match its design, human companion, gate, and digests.")

    validation: dict[str, Any] | None = None
    if isinstance(design, dict) and gate in {"READY_FOR_SPEC", "READY_FOR_TICKETS"}:
        validation = validate_design(design, gate, design_path)
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
        source_digests = {
            item["stable_id"]: item["content_sha256"].lower()
            for item in design.get("source_authorities", [])
            if isinstance(item, dict)
            and isinstance(item.get("stable_id"), str)
            and isinstance(item.get("content_sha256"), str)
        }
        if source_digests != record.get("source_authority_digests"):
            errors.append("Receipt source authority digests do not match the design.")
        if design.get("admission") != record.get("admission"):
            errors.append("Receipt admission evidence does not match the design.")
        if design.get("quality_review") != record.get("quality_review"):
            errors.append("Receipt quality review does not match the design.")
        if design.get("package_acceptance") != record.get("package_acceptance"):
            errors.append("Receipt package acceptance does not match the design.")
        evidence_times = []
        for container, field in (
            (design.get("quality_review"), "reviewed_at"),
            (design.get("package_acceptance"), "accepted_at"),
        ):
            if isinstance(container, dict) and isinstance(container.get(field), str):
                try:
                    value = datetime.fromisoformat(container[field].replace("Z", "+00:00"))
                except ValueError:
                    continue
                if value.tzinfo is not None:
                    evidence_times.append(value)
        if parsed_created_at is not None and evidence_times and parsed_created_at < max(evidence_times):
            errors.append("Receipt creation predates its review or package acceptance evidence.")

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
