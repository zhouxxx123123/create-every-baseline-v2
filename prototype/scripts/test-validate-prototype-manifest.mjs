#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.join(scriptDir, "validate-prototype-manifest.mjs");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prototype-validator-"));

const validManifest = `# Combined workflow prototype

## Origin
Standalone composition regression fixture.

## Prototype unit
- Prototype ID: PT-batch
- Type: WORKFLOW
- Bounded target: Combine chat and search modules.
- Natural entry: http://localhost:4173/review
- Terminal outcome: Both modules complete.
- Return path or handoff: Return to workspace.

## Product areas and linkage
- Areas: Chat and search
- Handoff: Chat -> Search via query
- Source of truth: Prototype memory
- Result/writeback: Visible terminal state

## Question
Do both selected modules work together exactly once?

## Decision sources
[Decision](https://example.com/decision)

## In scope
Chat and search modules.

## Not validated
Production persistence.

## States and routes
Run \`pnpm prototype\`, then open http://localhost:4173/review.

## Prototype versions
| Version ID | Full prototype reference | Display name | Legacy aliases | Derived from | Composed from | Status | Review route | Immutable artifact ref | Fixture ref | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V001 | PT-batch@V001 | Combined workspace flow | None | None | M-CHAT, M-SEARCH | CURRENT_CANONICAL | http://localhost:4173/review | commit:abc123 | fixture:base | Integrated candidate |

## Selection history
| Selected at | Full prototype reference | Selected by | Superseded selection |
| --- | --- | --- | --- |
| 2026-08-14 | PT-batch@V001 | Product owner | None |

## Journey coverage
| Full prototype reference | Step ID | From | User action | Expected visible result | Reachability | Mechanical check | Product review | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PT-batch@V001 | PT-batch@V001:J1 | Review entry | Open chat then search | Both complete | NATURAL | PASS | CONFIRMED | Browser trace |

## Branch coverage
Not applicable

## Composition contract
- Requested module count: 2
- Integrated project: prototypes/combined-workspace
- Start command: pnpm prototype
- Formal integration URL: http://localhost:4173/review

| Full prototype reference | Module ID | Requested capability | Source manifest | Source version | Artifact ref | Fixture ref | Integrated surface | Integrated count | Runtime check | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PT-batch@V001 | M-CHAT | Open chat | chat/PROTOTYPE.md | PT-chat@V002 | commit:chat | fixture:chat | /review#chat | 1 | PASS | observed chat |
| PT-batch@V001 | M-SEARCH | Search messages | search/PROTOTYPE.md | PT-search@V003 | commit:search | fixture:search | /review#search | 1 | PASS | observed search |

## Composition coverage
| Full prototype reference | Module ID | Integrated ID | Source manifest | Source version | Source IDs | Integration responsibility | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PT-batch@V001 | M-CHAT | PT-batch@V001:I1 | chat/PROTOTYPE.md | PT-chat@V002 | PT-chat@V002:J1 | Entry and handoff | Browser trace chat |
| PT-batch@V001 | M-SEARCH | PT-batch@V001:I2 | search/PROTOTYPE.md | PT-search@V003 | PT-search@V003:J1 | Search and return | Browser trace search |

## External boundaries
Not applicable

## Review
- Version reviewed: PT-batch@V001
- Immutable artifact reviewed: commit:abc123
- Fixture reviewed: fixture:base
- Mechanically verified: 2026-08-14, local browser, mouse and keyboard
- Reviewed by: Product owner
- Status: CONFIRMED
- Exact reviewed scope: PT-batch@V001:J1, PT-batch@V001:I1, PT-batch@V001:I2

## Conclusion
Both modules are integrated exactly once.

## Resume at
[Caller](https://example.com/caller)

## Downstream consumption
- Current canonical prototype version: PT-batch@V001
- Immutable artifact and fixture refs: commit:abc123 and fixture:base
- Composed source versions: M-CHAT and M-SEARCH source identities above
- Consumable integration journey and branch IDs for that version: PT-batch@V001:J1
- Consumable source IDs admitted through the composition: PT-chat@V002:J1 and PT-search@V003:J1
- Other versions and excluded evidence that downstream work must not consume: None
- Remaining assumptions: None
- Stop conditions: Source behaviour changes

## Supersession
None
`;

function validate(name, manifest, expectedStatus, expectedFragments = []) {
  const manifestPath = path.join(tempDir, `${name}.md`);
  fs.writeFileSync(manifestPath, manifest, "utf8");
  const result = spawnSync(
    process.execPath,
    [validatorPath, manifestPath, "--require-canonical", "--require-confirmed"],
    { encoding: "utf8" },
  );
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(
    result.status,
    expectedStatus,
    `${name}: unexpected exit ${result.status}\n${output}`,
  );
  for (const fragment of expectedFragments) {
    assert.match(output, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

try {
  validate("valid", validManifest, 0, ["Prototype manifest is valid."]);
  validate(
    "legacy-noncomposed",
    validManifest
      .replace("M-CHAT, M-SEARCH", "None")
      .replace(/## Composition contract[\s\S]*?(?=## Composition coverage)/, "")
      .replace(
        /## Composition coverage[\s\S]*?(?=## External boundaries)/,
        "## Composition coverage\nNot applicable\n\n",
      ),
    0,
    ["Prototype manifest is valid."],
  );
  validate(
    "missing-module",
    validManifest.replace(
      /^\| PT-batch@V001 \| M-SEARCH \| Search messages.*\r?\n/m,
      "",
    ),
    1,
    ["inventory has 1 modules; expected 2", "declares missing inventory Module ID 'M-SEARCH'"],
  );
  validate(
    "duplicate-module",
    validManifest.replace("M-CHAT, M-SEARCH", "M-CHAT, M-CHAT"),
    1,
    ["repeats Module ID 'M-CHAT' in Composed from"],
  );
  validate(
    "duplicate-output",
    validManifest.replace("/review#search | 1 | PASS", "/review#search | 2 | PASS"),
    1,
    ["Module ID 'M-SEARCH' must have Integrated count 1"],
  );
  validate(
    "runtime-not-run",
    validManifest.replace("/review#search | 1 | PASS", "/review#search | 1 | NOT_RUN"),
    1,
    ["Module ID 'M-SEARCH' is not runtime PASS"],
  );
  validate(
    "orphan-coverage",
    validManifest.replace(
      "| PT-batch@V001 | M-SEARCH | PT-batch@V001:I2",
      "| PT-batch@V001 | M-OTHER | PT-batch@V001:I2",
    ),
    1,
    ["lacks coverage for Module ID 'M-SEARCH'", "orphan coverage Module ID 'M-OTHER'"],
  );
  validate(
    "missing-single-command",
    validManifest.replace("- Start command: pnpm prototype", "- Start command: Not applicable"),
    1,
    ["requires one concrete 'Start command'"],
  );
  console.log("Prototype manifest validator composition tests passed (8 cases). ");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
