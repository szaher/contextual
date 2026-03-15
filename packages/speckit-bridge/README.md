# @ctxkit/speckit-bridge

Bidirectional bridge between [spec-kit](https://github.com/szaher/contextual) design artifacts and ctxl `.ctx` files.

Converts spec-kit constitutions and component specifications into structured `.ctx` decisions, contracts, and gotchas -- and exports them back. Supports bidirectional sync with conflict detection so that design documents and context files stay in lockstep.

## Installation

`@ctxkit/speckit-bridge` is part of the ctxl monorepo. When working inside the monorepo, it is available automatically:

```bash
pnpm install
pnpm build
```

It can also be installed as a standalone package:

```bash
npm install @ctxkit/speckit-bridge
```

**Requirements:** Node.js >= 20.0.0

## Overview

[spec-kit](https://github.com/szaher/contextual) is a convention for storing design knowledge as Markdown artifacts in a repository. Two key artifact types are:

- **Constitution** -- a set of architectural principles (e.g., `.specify/memory/constitution.md`) written with roman-numeral headings and RFC-2119 keywords (`MUST`, `SHALL`, `REQUIRED`).
- **Component specs** -- per-component specification files that describe functional requirements, edge cases, and caveats.

This bridge package translates between those Markdown artifacts and the structured `.ctx` file format that the ctxl toolchain consumes. It provides:

| Capability | Description |
|---|---|
| **Import** | Parse constitutions into locked decisions + contracts; parse component specs into contracts + gotchas |
| **Export** | Render `.ctx` data back to spec-kit Markdown or YAML, preserving manually-edited sections |
| **Validate** | Check all `.ctx` files for compliance with constitutional principles |
| **Sync** | Bidirectional mtime-based synchronization with conflict detection |

## API Reference

### `parseConstitution(content)`

Parse a constitution Markdown string and extract principles as locked decisions and technical boundaries as locked contracts.

```ts
function parseConstitution(content: string): {
  decisions: Decision[];
  contracts: Contract[];
}
```

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `content` | `string` | Raw Markdown content of the constitution file |

**Returns:** An object with two arrays:

- `decisions` -- One `Decision` per heading. Each has an `id` of the form `CONST-{numeral}` (roman numeral or number from the heading), `status: 'accepted'`, `locked: true`, and `owner: 'speckit-bridge'`.
- `contracts` -- One `Contract` per heading whose body contains `MUST`, `SHALL`, or `REQUIRED`. Named `CONST-{numeral}-boundary`, `locked: true`.

**Example:**

```ts
import { parseConstitution } from '@ctxkit/speckit-bridge';

const md = `
## I. Local-First
All data MUST be stored locally. No cloud dependency.

## II. Simplicity
Keep the API surface minimal.
`;

const { decisions, contracts } = parseConstitution(md);
// decisions.length === 2  (CONST-I, CONST-II)
// contracts.length === 1  (CONST-I-boundary, from the MUST clause)
```

---

### `parseComponentSpec(content, specName)`

Parse a component spec Markdown string and extract functional requirements as contracts and edge cases as gotchas.

```ts
function parseComponentSpec(
  content: string,
  specName: string,
): {
  contracts: Contract[];
  gotchas: Gotcha[];
}
```

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `content` | `string` | Raw Markdown content of the component spec |
| `specName` | `string` | Name of the component (used for contract IDs and tags) |

**Returns:** An object with:

- `contracts` -- One `Contract` per bullet item under a section whose heading contains "requirement" or "functional". IDs follow the pattern `FR-{specName}-{NNN}` (zero-padded). Scoped with a tag matching `specName`. Not locked by default.
- `gotchas` -- One `Gotcha` per bullet item under a section whose heading contains "edge case", "gotcha", or "caveat". Tagged with `specName`.

**Example:**

```ts
import { parseComponentSpec } from '@ctxkit/speckit-bridge';

const md = `
## Functional Requirements
- Accept JSON and YAML input formats
- Validate schemas before processing

## Edge Cases
- Empty input should return a valid empty result
`;

const { contracts, gotchas } = parseComponentSpec(md, 'parser');
// contracts[0].name === 'FR-parser-001'
// contracts[1].name === 'FR-parser-002'
// gotchas[0].text  === 'Empty input should return a valid empty result'
```

---

### `importConstitution(repoRoot, constitutionPath, dryRun?)`

Import a constitution file into the root `.ctx` file as locked decisions and contracts.

```ts
function importConstitution(
  repoRoot: string,
  constitutionPath: string,
  dryRun?: boolean,
): ImportResult
```

**Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| `repoRoot` | `string` | -- | Absolute path to the repository root |
| `constitutionPath` | `string` | -- | Path to the constitution Markdown file (absolute, or relative to `repoRoot`) |
| `dryRun` | `boolean` | `false` | When `true`, parse and count but do not write any files |

**Returns:** `ImportResult` describing what was (or would be) imported.

**Behavior:**

- Reads or creates the root `.ctx` file at `{repoRoot}/.ctx`.
- Replaces all existing `CONST-` prefixed decisions and contracts; preserves non-`CONST-` entries.
- Bumps the `.ctx` version with author `speckit-bridge`.

**Example:**

```ts
import { importConstitution } from '@ctxkit/speckit-bridge';

const result = importConstitution('/path/to/repo', '.specify/memory/constitution.md');
console.log(result);
// { decisions: 5, contracts: 2, gotchas: 0, files_updated: ['.ctx'] }
```

---

### `importSpecs(repoRoot, specsDir, dryRun?)`

Import all component spec Markdown files from a directory into the root `.ctx` file.

```ts
function importSpecs(
  repoRoot: string,
  specsDir: string,
  dryRun?: boolean,
): ImportResult
```

**Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| `repoRoot` | `string` | -- | Absolute path to the repository root |
| `specsDir` | `string` | -- | Path to the specs directory (absolute, or relative to `repoRoot`) |
| `dryRun` | `boolean` | `false` | When `true`, parse and count but do not write any files |

**Returns:** `ImportResult` with aggregated counts across all spec files.

**Behavior:**

- Scans `specsDir` for `*.md` files.
- For each file, calls `parseComponentSpec` using the filename (without `.md`) as the spec name.
- Merges contracts by replacing existing `FR-{specName}-` prefixed entries; keeps others.
- Merges gotchas by text deduplication.
- Bumps the `.ctx` version per spec file processed.

**Example:**

```ts
import { importSpecs } from '@ctxkit/speckit-bridge';

const result = importSpecs('/path/to/repo', 'specs/', true);
console.log(result);
// { decisions: 0, contracts: 12, gotchas: 4, files_updated: [] }  (dry run)
```

---

### `exportToSpecKit(repoRoot, outputDir, format?)`

Export `.ctx` decisions, contracts, and gotchas to spec-kit Markdown or YAML format.

```ts
function exportToSpecKit(
  repoRoot: string,
  outputDir: string,
  format?: 'md' | 'yaml',
): ExportResult
```

**Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| `repoRoot` | `string` | -- | Absolute path to the repository root |
| `outputDir` | `string` | -- | Directory to write exported files (absolute, or relative to `repoRoot`) |
| `format` | `'md' \| 'yaml'` | `'md'` | Output format |

**Returns:** `ExportResult` listing all files written.

**Behavior:**

- Recursively finds all `.ctx` files under `repoRoot` (skipping `node_modules`, `.git`, `dist`).
- Creates one output file per `.ctx` file (named by relative path, e.g., `root.md`, `packages-core.md`).
- Preserves manually-edited sections delimited by `<!-- MANUAL START -->` and `<!-- MANUAL END -->` in existing output files.
- Markdown output includes sections for Overview, Decisions, Contracts, and Edge Cases.
- YAML output includes the same data in a structured YAML format.

**Example:**

```ts
import { exportToSpecKit } from '@ctxkit/speckit-bridge';

const result = exportToSpecKit('/path/to/repo', 'specs/exported/');
console.log(result);
// { exported_files: ['specs/exported/root.md', 'specs/exported/packages-core.md'] }
```

---

### `validateConstitution(repoRoot, constitutionPath)`

Validate all `.ctx` files in the repository against a constitution.

```ts
function validateConstitution(
  repoRoot: string,
  constitutionPath: string,
): ValidationResult
```

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `repoRoot` | `string` | Absolute path to the repository root |
| `constitutionPath` | `string` | Path to the constitution Markdown file (absolute, or relative to `repoRoot`) |

**Returns:** `ValidationResult` indicating whether all files pass and listing any violations.

**Checks performed:**

- **Missing decisions:** The root `.ctx` must contain all `CONST-` decisions from the constitution. Missing ones produce `warning` severity.
- **Unlocked constitution decisions:** Any `CONST-` prefixed decision that is not `locked: true` produces an `error`.
- **External service references:** Contracts referencing external/remote/cloud/SaaS services without an opt-in gate produce a `warning` when the constitution has local/private MUST clauses.

**Example:**

```ts
import { validateConstitution } from '@ctxkit/speckit-bridge';

const result = validateConstitution('/path/to/repo', '.specify/memory/constitution.md');
if (!result.valid) {
  for (const v of result.violations) {
    console.error(`[${v.severity}] ${v.ctx_path}: ${v.violation}`);
  }
}
```

---

### `syncBidirectional(repoRoot, options?)`

Bidirectional sync between spec-kit artifacts and `.ctx` files using modification time comparison.

```ts
function syncBidirectional(
  repoRoot: string,
  options?: {
    constitutionPath?: string;
    specsDir?: string;
    outputDir?: string;
    dryRun?: boolean;
    forceDirection?: 'spec-to-ctx' | 'ctx-to-spec';
  },
): SyncResult
```

**Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| `repoRoot` | `string` | -- | Absolute path to the repository root |
| `options.constitutionPath` | `string` | `'.specify/memory/constitution.md'` | Path to constitution file |
| `options.specsDir` | `string` | `'specs/'` | Directory containing component specs |
| `options.outputDir` | `string` | `'specs/exported/'` | Directory for exported spec files |
| `options.dryRun` | `boolean` | `false` | Compute sync plan without writing files |
| `options.forceDirection` | `'spec-to-ctx' \| 'ctx-to-spec'` | -- | Override automatic direction detection |

**Returns:** `SyncResult` describing what was synced and any conflicts.

**Behavior:**

- Loads previous sync state from `.ctxl.speckit-sync.yaml` in the repo root.
- Compares modification times of spec files and `.ctx` files against the last sync timestamp.
- If only the spec side changed, imports (spec-to-ctx). If only the ctx side changed, exports (ctx-to-spec). If both changed since last sync, reports a conflict.
- Use `forceDirection` to resolve conflicts by choosing which side wins.
- Saves updated sync state after a successful (non-dry-run) sync.

**Example:**

```ts
import { syncBidirectional } from '@ctxkit/speckit-bridge';

// Automatic sync
const result = syncBidirectional('/path/to/repo');
console.log(`Synced: ${result.synced}, Conflicts: ${result.conflicts}`);

// Force spec-kit as source of truth
const forced = syncBidirectional('/path/to/repo', {
  forceDirection: 'spec-to-ctx',
});
```

---

### `loadSyncState(repoRoot)`

Load the sync state from the `.ctxl.speckit-sync.yaml` file in the repository root.

```ts
function loadSyncState(repoRoot: string): SyncState[]
```

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `repoRoot` | `string` | Absolute path to the repository root |

**Returns:** An array of `SyncState` entries, or an empty array if the file does not exist.

---

### `saveSyncState(repoRoot, states)`

Write sync state to the `.ctxl.speckit-sync.yaml` file in the repository root.

```ts
function saveSyncState(repoRoot: string, states: SyncState[]): void
```

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `repoRoot` | `string` | Absolute path to the repository root |
| `states` | `SyncState[]` | Array of sync state entries to persist |

## Type Definitions

### `ImportResult`

```ts
interface ImportResult {
  decisions: number;       // Number of decisions imported
  contracts: number;       // Number of contracts imported
  gotchas: number;         // Number of gotchas imported
  files_updated: string[]; // Relative paths of files that were updated
}
```

### `ExportResult`

```ts
interface ExportResult {
  exported_files: string[]; // Relative paths of exported spec files
}
```

### `ValidationResult`

```ts
interface ValidationResult {
  valid: boolean;                    // true if no violations with severity 'error'
  violations: ConstitutionViolation[];
}
```

### `ConstitutionViolation`

```ts
interface ConstitutionViolation {
  ctx_path: string;            // Path to the .ctx file with the violation
  principle: string;           // Constitutional principle violated
  violation: string;           // Description of the violation
  severity: 'error' | 'warning';
}
```

### `SyncResult`

```ts
interface SyncResult {
  synced: number;              // Number of file pairs synced
  conflicts: number;           // Number of conflicts detected
  direction_used: SyncDirection | 'bidirectional';
  files_updated: string[];     // .ctx files updated
  specs_updated: string[];     // Spec files updated
}
```

### `SyncState`

```ts
interface SyncState {
  spec_path: string;    // Path to spec-kit artifact
  ctx_path: string;     // Path to .ctx file
  spec_mtime: string;   // Last modification time of spec (ISO 8601)
  ctx_mtime: string;    // Last modification time of .ctx (ISO 8601)
  last_synced: string;  // Last sync timestamp (ISO 8601)
  direction: SyncDirection;
}
```

### `SyncDirection`

```ts
type SyncDirection = 'import_only' | 'export_only' | 'bidirectional';
```

### `TransformType`

```ts
type TransformType = 'direct' | 'reshape' | 'aggregate' | 'split';
```

### `MappingRule`

```ts
interface MappingRule {
  spec_section: string;      // Section name in spec-kit artifact
  ctx_section: string;       // Target section in .ctx file
  transform: TransformType;  // Transformation type
  id_prefix: string | null;  // Prefix for generated IDs (e.g., "CONST-", "FR-")
  locked: boolean;           // Whether imported entries are locked
  direction: SyncDirection;  // Sync direction
}
```

## CLI Usage

The bridge integrates with the `ctxkit` CLI under the `speckit` subcommand:

```bash
# Import a constitution into .ctx
ctxkit speckit import --constitution .specify/memory/constitution.md

# Import component specs from a directory
ctxkit speckit import --specs specs/

# Dry-run import (preview without writing)
ctxkit speckit import --constitution .specify/memory/constitution.md --dry-run

# Export .ctx data to spec-kit Markdown
ctxkit speckit export --output specs/exported/

# Export in YAML format
ctxkit speckit export --output specs/exported/ --format yaml

# Validate .ctx files against a constitution
ctxkit speckit validate --constitution .specify/memory/constitution.md

# Bidirectional sync (automatic direction detection)
ctxkit speckit sync

# Force sync direction
ctxkit speckit sync --force spec-to-ctx

# Dry-run sync
ctxkit speckit sync --dry-run
```

All commands support `--json` for machine-readable output.

## How It Works

### Constitution Import

When importing a constitution, the bridge parses Markdown headings at `##` or `###` level. Each heading becomes a locked decision:

```
## III. Single-File Simplicity
All context MUST live in a single .ctx file per directory.
```

This produces:

- **Decision** `CONST-III` with title "Single-File Simplicity", `status: 'accepted'`, `locked: true`.
- **Contract** `CONST-III-boundary` (because the body contains `MUST`), `locked: true`, scoped to `/`.

Headings can use roman numerals (`## IV. ...`), arabic numerals (`## 4. ...`), or no numeral (`### Principle Name`). The bridge detects `MUST`, `SHALL`, and `REQUIRED` (RFC 2119 keywords) to identify technical boundaries that warrant a contract.

### Component Spec Import

Component specs are parsed by section heading:

- Sections with headings containing "requirement" or "functional" -- each bullet item becomes a `Contract` with ID `FR-{componentName}-{NNN}`.
- Sections with headings containing "edge case", "gotcha", or "caveat" -- each bullet item becomes a `Gotcha`.

Contracts from specs are **not** locked by default, unlike constitution entries.

### Export

The exporter walks all `.ctx` files in the repository and renders each to a Markdown (or YAML) file in the output directory. The output file is named by the relative path of the `.ctx` file (e.g., `.ctx` at root becomes `root.md`, `packages/core/.ctx` becomes `packages-core.md`).

When the output file already exists, manually-edited sections are preserved. Wrap manual content with:

```html
<!-- MANUAL START -->
Your hand-written notes, diagrams, or additional context here.
<!-- MANUAL END -->
```

The bridge appends these sections to the regenerated output.

### Bidirectional Sync

The `syncBidirectional` function uses a state file (`.ctxl.speckit-sync.yaml`) to track the last sync timestamp for each spec/ctx pair. On each sync:

1. Compare the modification time of the spec file and the `.ctx` file against the last sync time.
2. If **only the spec** was modified since last sync, import (spec-to-ctx).
3. If **only the .ctx** was modified since last sync, export (ctx-to-spec).
4. If **both** were modified since last sync, report a conflict. Use `forceDirection` to resolve.
5. If **neither** was modified, no action is taken.

The state file is updated after each successful sync.

## License

MIT
