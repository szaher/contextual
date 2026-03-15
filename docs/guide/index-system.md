# The .ctxl Index System

The `.ctxl` index is a YAML file at the repository root that catalogs every `.ctx` file in the project. It provides a single source of truth for context discovery, dependency graphing, and category-budgeted packing -- without needing to parse every `.ctx` file on every request.

## What the Index Does

When a repository has dozens or hundreds of `.ctx` files, scanning and parsing each one on every context request becomes expensive. The index solves this by maintaining a pre-computed catalog of all `.ctx` files with their metadata, checksums, and dependency relationships.

The index enables:

- **Fast selection** -- select relevant `.ctx` files by tags, path, or dependencies without parsing YAML
- **Dependency graphing** -- know which `.ctx` files depend on others before merging
- **Category budgets** -- allocate token budget proportionally across categories
- **Staleness checks** -- detect out-of-date `.ctx` files by comparing checksums
- **Token estimation** -- know how many tokens each `.ctx` file will consume before packing

## Index File Location

The index file lives at the repository root:

```
my-project/
  .ctxl              <-- index file
  .ctx                <-- root context
  src/
    auth/
      .ctx
    db/
      .ctx
```

## Index Entry Fields

Each entry in the index describes a single `.ctx` file:

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Relative path to the `.ctx` file from the repo root |
| `summary` | string | The `summary` field from the `.ctx` file |
| `tags` | string[] | Aggregated tags from the `.ctx` file |
| `depth` | number | Directory depth relative to repo root (0 for root `.ctx`) |
| `ctx_version` | number | The `version` field from the `.ctx` file |
| `last_modified` | string | ISO 8601 timestamp of the last modification |
| `checksum` | string | SHA-256 hash of the `.ctx` file content (excluding `_history`) |
| `dependencies` | object | Dependency edges (`depends_on` and `depended_by`) |
| `weight` | number | Relative importance weight (default: 1.0) |
| `sections` | string[] | Which sections are present (e.g., `["key_files", "contracts", "decisions"]`) |
| `token_estimate` | number | Estimated total tokens for all sections in this `.ctx` file |

### Example Index

```yaml
version: 2
generated_at: "2026-03-15T10:00:00.000Z"
entries:
  - path: ".ctx"
    summary: "Root project context"
    tags: [typescript, monorepo]
    depth: 0
    ctx_version: 2
    last_modified: "2026-03-14T08:30:00.000Z"
    checksum: "sha256:a1b2c3d4e5f6..."
    dependencies:
      depends_on: []
      depended_by: ["src/auth/.ctx", "src/db/.ctx"]
    weight: 1.0
    sections: [key_files, contracts, decisions, gotchas]
    token_estimate: 1200

  - path: "src/auth/.ctx"
    summary: "Auth module context"
    tags: [auth, security, jwt]
    depth: 1
    ctx_version: 2
    last_modified: "2026-03-14T09:15:00.000Z"
    checksum: "sha256:f6e5d4c3b2a1..."
    dependencies:
      depends_on: [".ctx"]
      depended_by: []
    weight: 1.2
    sections: [key_files, contracts, gotchas]
    token_estimate: 800
```

## Dependency Graph

The index tracks dependency relationships between `.ctx` files through two edge lists:

- **`depends_on`** -- `.ctx` files this file references via the `refs` section
- **`depended_by`** -- `.ctx` files that reference this file

These edges are computed from the `refs` section in each `.ctx` file. When a `.ctx` file has a ref targeting another directory, the index records the edge in both directions.

The dependency graph is used during context packing to include related context. If a `.ctx` file at `src/auth/.ctx` is selected and it depends on `src/middleware/.ctx`, the middleware context receives a dependency bonus during scoring.

## Scoring with the Index

The index introduces two additional scoring signals beyond the base scoring algorithm:

### Dependency Bonus

When a `.ctx` file is selected for inclusion and it has dependencies, those dependencies receive a bonus:

```
depBonus = 0.15 per dependency edge
```

This ensures that closely related context is more likely to be included together.

### CWD Bonus

When the agent's working directory matches or is a child of a `.ctx` file's directory:

```
cwdBonus = 0.1
```

### Full Scoring Formula

With the index, the scoring formula becomes:

```
score = locality * w_locality + tagMatch * w_tag + recency * w_recency + depBonus + cwdBonus
```

Where the weights depend on the section type (same as the base scoring algorithm).

## Category Budgets

The index enables proportional budget allocation across categories. Instead of a single global budget, tokens are distributed across categories:

| Category | Budget Share | Description |
|----------|-------------|-------------|
| `contracts` | 20% | Safety invariants and API rules |
| `local_ctx` | 30% | Context from the working directory and immediate parents |
| `related_ctx` | 30% | Context from dependencies and tag-matched files |
| `history` | 10% | Version history and decision records |
| `reserve` | 10% | Headroom for deep-read fallback and dynamic content |

With a 4000-token budget, this means:
- 800 tokens for contracts
- 1200 tokens for local context
- 1200 tokens for related context
- 400 tokens for history
- 400 tokens reserved

If a category does not use its full allocation, the surplus flows to other categories by score.

## CLI Commands

### `ctxkit index generate`

Generate or regenerate the `.ctxl` index from all `.ctx` files in the repository.

```bash
# Generate the index
ctxkit index generate

# Output
Scanning .ctx files...
  Found 12 .ctx files across 6 packages
  Computed 8 dependency edges

Generated .ctxl index (12 entries)
  Total tokens: 14,200
  Path: /path/to/repo/.ctxl
```

### `ctxkit index show`

Display the current index contents.

```bash
# Show all entries
ctxkit index show

# Output
.ctxl Index (12 entries, generated 2026-03-15T10:00:00Z)

Path                   Tags                    Depth  Tokens  Checksum
---------------------------------------------------------------------------
.ctx                   typescript, monorepo    0      1200    a1b2c3d4
src/auth/.ctx          auth, security, jwt     1      800     f6e5d4c3
src/db/.ctx            database, sql           1      650     b3c4d5e6
...
```

### `ctxkit index select`

Select `.ctx` files matching criteria, useful for previewing what the packer would choose.

```bash
# Select by tags
ctxkit index select --tags auth,security

# Select by path prefix
ctxkit index select --path src/auth

# Select with budget constraint
ctxkit index select --tags auth --budget 2000
```

## Automatic Index Updates

The index is kept up to date automatically. When a `.ctx` file is modified (through proposals, manual edits, or auto-updates), the `updateIndexEntry()` function updates just that entry in the index without regenerating the entire file.

```typescript
import { updateIndexEntry } from '@ctxkit/core'

// Called automatically after any .ctx modification
updateIndexEntry(repoRoot, ctxPath)
```

This incremental update recomputes:
- The checksum for the modified `.ctx` file
- The summary and tags
- The `last_modified` timestamp
- Dependency edges (if refs changed)
- Token estimates

The full `ctxkit index generate` command can always be run to regenerate from scratch, which is useful after bulk changes or when the index file is missing.

## Next Steps

- Understand the [Scoring Algorithm](/guide/scoring-algorithm) that the index enhances
- Learn about [Version Tracking](/guide/versioning) and how checksums are computed
- See how [Bootstrap](/guide/bootstrap) creates `.ctx` files that the index catalogs
