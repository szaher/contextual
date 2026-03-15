# V1 to V2 Migration

ctxl v2 introduces several new features that require initialization on existing `.ctx` files. The migration command upgrades v1 files to v2 format while preserving all existing content. The migration is idempotent and backward compatible.

## What Changes

The migration adds four capabilities to each `.ctx` file:

| Feature | What Migration Does |
|---------|-------------------|
| **Version field** | Sets `version: 2` and initializes `ctx_version: 1` |
| **History** | Adds an empty `_history: []` field with an initial "migrated from v1" entry |
| **Checksum** | Computes and records the SHA-256 checksum of the file content |
| **Index** | Generates the `.ctxl` index file at the repository root |

### Before Migration (v1)

```yaml
version: 1
summary: "Auth module context"
key_files:
  - path: login.ts
    purpose: "Handles user authentication flow"
    tags: [auth, login]
    verified_at: "2026-01-15"
    locked: false
    owner: null
contracts:
  - name: auth-security
    scope:
      paths: ["src/auth/**"]
      tags: [auth, security]
    content: "All auth endpoints must validate JWT tokens"
    verified_at: "2026-01-15"
    locked: true
    owner: security-team
tags: [auth, security]
```

### After Migration (v2)

```yaml
version: 2
ctx_version: 1
summary: "Auth module context"
key_files:
  - path: login.ts
    purpose: "Handles user authentication flow"
    tags: [auth, login]
    verified_at: "2026-01-15"
    locked: false
    owner: null
contracts:
  - name: auth-security
    scope:
      paths: ["src/auth/**"]
      tags: [auth, security]
    content: "All auth endpoints must validate JWT tokens"
    verified_at: "2026-01-15"
    locked: true
    owner: security-team
tags: [auth, security]
_history:
  - version: 1
    timestamp: "2026-03-15T10:00:00.000Z"
    author: "migration"
    session_id: null
    reason: "Migrated from v1 to v2"
    checksum: "sha256:a1b2c3d4e5f6..."
    diff_summary: "+version:2, +ctx_version, +_history, +checksum"
```

All existing fields are preserved exactly as they were. No content is modified, removed, or reordered.

## CLI Usage

### Dry Run

Preview what the migration would do without writing any files:

```bash
ctxkit migrate --dry-run

# Output
Scanning for v1 .ctx files...
  Found 12 .ctx files

Migration plan:
  .ctx                   v1 -> v2 (add ctx_version, _history, checksum)
  src/auth/.ctx          v1 -> v2 (add ctx_version, _history, checksum)
  src/db/.ctx            v1 -> v2 (add ctx_version, _history, checksum)
  src/api/.ctx           v1 -> v2 (add ctx_version, _history, checksum)
  src/utils/.ctx         v1 -> v2 (add ctx_version, _history, checksum)
  packages/core/.ctx     v1 -> v2 (add ctx_version, _history, checksum)
  packages/cli/.ctx      v1 -> v2 (add ctx_version, _history, checksum)
  packages/ui/.ctx       v1 -> v2 (add ctx_version, _history, checksum)
  packages/daemon/.ctx   v1 -> v2 (add ctx_version, _history, checksum)
  packages/mcp/.ctx      v1 -> v2 (add ctx_version, _history, checksum)
  packages/claude/.ctx   v1 -> v2 (add ctx_version, _history, checksum)
  tests/.ctx             v1 -> v2 (add ctx_version, _history, checksum)

Would generate .ctxl index (12 entries)

[dry-run] No files were modified.
```

### Apply Migration

```bash
ctxkit migrate

# Output
Scanning for v1 .ctx files...
  Found 12 .ctx files

Migrating...
  .ctx                   migrated (checksum: a1b2c3d4)
  src/auth/.ctx          migrated (checksum: f6e5d4c3)
  src/db/.ctx            migrated (checksum: b3c4d5e6)
  ...

Migrated 12 .ctx files to v2
Generated .ctxl index (12 entries)
```

## Idempotency

Running `ctxkit migrate` on files that have already been migrated produces no changes:

```bash
ctxkit migrate

# Output (second run)
Scanning for v1 .ctx files...
  Found 0 .ctx files needing migration (12 already at v2)

Nothing to migrate.
```

The migration checks each file's `version` field. Files with `version: 2` are skipped entirely. This makes it safe to run the migration command in CI pipelines, post-checkout hooks, or as part of onboarding scripts.

## Backward Compatibility

After migration, v1 workflows continue to work:

- **Parsing** -- the parser accepts both `version: 1` and `version: 2` files
- **Scoring** -- all v1 scoring signals are preserved; v2 features (index, dependency bonus) are additive
- **Proposals** -- existing proposals remain valid
- **Drift detection** -- works identically on v2 files
- **MCP tools** -- all 10 original tools work unchanged; 6 new tools are additive

The only behavioral difference is that v2 files gain version tracking, history, and index support. No existing functionality is removed or changed.

## Programmatic API

```typescript
import { needsV2Init, initV2Features } from '@ctxkit/core'

// Check if a .ctx file needs v2 initialization
const ctx = parseCtxFile(content)
if (needsV2Init(ctx)) {
  // Initialize v2 features (version, history, checksum)
  const migrated = initV2Features(ctx, {
    author: 'migration',
    reason: 'Migrated from v1 to v2',
  })

  // Write the migrated file
  const yaml = serializeCtxFile(migrated)
  writeFileSync(ctxPath, yaml)
}
```

### `needsV2Init(ctx: CtxFile): boolean`

Returns `true` if the file has `version: 1` or is missing `ctx_version`, `_history`, or checksum fields.

### `initV2Features(ctx: CtxFile, options): CtxFile`

Adds v2 fields to a parsed `CtxFile`:

| Added Field | Value |
|-------------|-------|
| `version` | `2` |
| `ctx_version` | `1` |
| `_history` | Array with one initial entry |
| Checksum | Computed from content (excluding `_history`) |

## Migration in Teams

When migrating a shared repository:

1. **One person runs the migration** -- `ctxkit migrate` on the default branch
2. **Commit the changes** -- all `.ctx` files and the new `.ctxl` index
3. **Team members pull** -- the migrated files are immediately usable
4. **No action needed** -- teammates do not need to run migrate; their tools automatically use v2 features

The migration commit typically changes every `.ctx` file in the repo (adding `version: 2`, `ctx_version`, `_history`) plus creates the `.ctxl` index file. A single commit keeps the migration atomic and easy to review.

## Next Steps

- Learn about [Version Tracking](/guide/versioning) to understand the new history system
- Set up the [Index System](/guide/index-system) to take advantage of the new index
- Explore [Bootstrap](/guide/bootstrap) for generating `.ctx` files in new directories
- See the [Core Library Reference](/api/core-library) for migration functions
