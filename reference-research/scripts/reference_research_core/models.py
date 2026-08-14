from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


EVIDENCE_TYPES = {
    "FACT_FROM_CODE",
    "FACT_FROM_TEST",
    "PROJECT_DOCUMENTATION_CLAIM",
    "INFERENCE",
    "NOT_FOUND",
}

TRANSFER_TYPES = {
    "PRINCIPLE_CAN_TRANSFER",
    "ADAPTER_REQUIRED",
    "INTERACTION_REFERENCE_ONLY",
    "NOT_TRANSFERABLE",
}

NEXT_VALIDATIONS = {
    "PRODUCT_QUESTION",
    "TECHNICAL_SPIKE",
    "PROTOTYPE",
    "MORE_RESEARCH",
    "NONE",
}

RESEARCH_STATUSES = {"COMPLETE", "PARTIAL", "BLOCKED"}


def load_json(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def content_identity(value: str | bytes) -> str:
    payload = value.encode("utf-8") if isinstance(value, str) else value
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def write_json(path: str | Path, value: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
