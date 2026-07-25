# Readiness receipt automation

Use the bundled script to create new machine-verifiable receipts and to reject stale receipts before `to-spec`.

## Create

Prepare a temporary JSON config:

```json
{
  "id": "PRODUCT-PR-001",
  "target": "One bounded product target",
  "specificationBoundary": "The exact behavior allowed into specification",
  "verdict": "READY_FOR_TO_SPEC",
  "supersedes": "None",
  "sources": [
    {
      "path": "../../docs/product/example.md",
      "label": "Canonical product decision",
      "heading": "## Confirmed behavior"
    }
  ],
  "prototypeIdentities": [],
  "compositionIdentity": "Not applicable.",
  "explicitBoundaries": [
    "Visual design remains outside this receipt."
  ],
  "remainingNonBlockingItems": [
    "Production validation remains required."
  ]
}
```

Source paths are resolved relative to the config file. Omit `heading` to hash the complete file. A heading hashes that heading and its body through the next heading of the same or higher level.

Run:

```bash
node "<resolved-product-readiness-skill-dir>/scripts/readiness-receipt.mjs" create \
  --config /tmp/readiness-receipt.json \
  --output .scratch/product-readiness/<target>/<receipt-id>.md
```

The command refuses to overwrite an existing receipt.

## Verify

```bash
node "<resolved-product-readiness-skill-dir>/scripts/readiness-receipt.mjs" verify \
  .scratch/product-readiness/<target>/<receipt-id>.md
```

Verification checks the machine identity block and recomputes every canonical source hash. A missing source, missing heading, changed hash, unsupported schema, or non-ready verdict fails verification.

Older receipts without the machine identity block remain historical evidence, but this script cannot prove them current. Re-run Product Readiness and create a new receipt rather than rewriting the old one.
