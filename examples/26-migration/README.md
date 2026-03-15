# Example 26: V1 to V2 Migration

ctxl v2 introduces version tracking, history, checksums, and the `.ctxl`
index. Projects using v1 `.ctx` files need to be migrated to take
advantage of these features. The `ctxkit migrate` command handles this
automatically: it reads all v1 `.ctx` files, adds the v2 fields
(`_version`, `_history`, checksum), and generates the `.ctxl` index.
Migration is idempotent -- running it again on already-migrated files
produces no changes.

## What This Demonstrates

- A v1 `.ctx` file (before migration) and what it looks like after migration
- The `ctxkit migrate` command and its `--dry-run` option
- What migration adds: `_version` field, `_history` array, checksum computation
- Idempotency: running migrate again has no effect
- `.ctxl` index generation as part of migration
- Handling edge cases: missing `verified_at`, deprecated fields

## Files in This Example

- **`before/auth.ctx`** -- A v1 `.ctx` file with `version: 1`, no `_version`,
  no `_history`, and no checksums.
- **`before/api.ctx`** -- Another v1 `.ctx` file.
- **`after/auth.ctx`** -- The same file after migration: `version: 2`,
  `_version: 1`, `_history` initialized, checksum computed.
- **`after/api.ctx`** -- The API `.ctx` file after migration.
- **`after/.ctxl`** -- The `.ctxl` index generated during migration.

## What Migration Does

### Field-by-Field Changes

| Field       | V1 State                | V2 State (after migration)              |
|-------------|-------------------------|-----------------------------------------|
| version     | `1`                     | `2`                                     |
| _version    | (does not exist)        | `1` (initialized)                       |
| _history    | (does not exist)        | Single entry: "Migrated from v1"        |
| checksum    | (not computed)          | SHA-256 of file content after migration |
| verified_at | Optional string or missing | Preserved as-is (not changed)        |
| All other fields | Unchanged           | Unchanged (format-compatible)           |

### Migration Steps

When you run `ctxkit migrate`, ctxl performs the following for each `.ctx` file:

1. **Read**: Parse the v1 `.ctx` file.
2. **Validate**: Ensure the file is valid v1 YAML with `version: 1`.
3. **Transform**:
   - Set `version` to `2`.
   - Add `_version: 1`.
   - Compute the SHA-256 checksum of the file content.
   - Add a `_history` array with one entry recording the migration.
4. **Write**: Write the transformed file back to disk.
5. **Verify**: Re-read and validate the file as v2.

After all files are migrated, ctxl generates the `.ctxl` index.

### Edge Cases

| Edge Case                    | Behavior                                      |
|------------------------------|-----------------------------------------------|
| File already v2              | Skipped (no changes)                          |
| Missing `verified_at`        | Preserved as missing (not added)              |
| Deprecated fields            | Warned but not removed (manual cleanup)       |
| Invalid v1 file              | Error reported, file skipped                  |
| File with `version` missing  | Error reported, file skipped                  |

## Try It Out

### Step 1: Preview the migration (dry run)

```bash
ctxkit migrate --dry-run
```

Expected output:

```
Migration Preview (dry run -- no files will be modified)
=========================================================

Found 2 v1 .ctx files:

  src/auth/.ctx
    version: 1 -> 2
    + _version: 1
    + _history: [{ version: 1, reason: "Migrated from v1" }]
    + checksum: sha256:a1b2c3d4...

  src/api/.ctx
    version: 1 -> 2
    + _version: 1
    + _history: [{ version: 1, reason: "Migrated from v1" }]
    + checksum: sha256:e5f6a7b8...

Would also generate .ctxl index with 2 sources.

Run without --dry-run to apply these changes.
```

### Step 2: Run the migration

```bash
ctxkit migrate
```

Expected output:

```
Migration
==========

Migrating 2 .ctx files from v1 to v2...

  src/auth/.ctx
    version: 1 -> 2
    _version: 1 (initialized)
    _history: 1 entry (migration record)
    checksum: sha256:a1b2c3d4e5f6...
    Status: OK

  src/api/.ctx
    version: 1 -> 2
    _version: 1 (initialized)
    _history: 1 entry (migration record)
    checksum: sha256:e5f6a7b8c9d0...
    Status: OK

Generating .ctxl index...
  Sources: 2
  Entries: 9
  Status: OK

Migration complete. 2 files migrated, 0 errors.
Run 'ctxkit validate' to verify.
```

### Step 3: Verify idempotency

```bash
ctxkit migrate
```

Expected output:

```
Migration
==========

Scanning for v1 .ctx files...

No v1 .ctx files found. All files are already v2.
Nothing to do.
```

### Step 4: Validate the migrated files

```bash
ctxkit validate
```

Expected output:

```
Checking src/auth/.ctx ...
Checking src/api/.ctx ...

All .ctx files valid. 0 errors, 0 warnings.
```

## Key Takeaways

- `ctxkit migrate` converts v1 `.ctx` files to v2 by adding `_version`,
  `_history`, and checksum fields. The schema `version` changes from `1`
  to `2`.
- Migration is idempotent: running it again on already-migrated files
  produces no changes and no errors.
- Always use `--dry-run` first to preview what changes will be made before
  committing to the migration.
- The `.ctxl` index is generated automatically as part of the migration,
  so the project is fully ready for v2 features immediately.
- Existing field values (summaries, key_files, contracts, decisions) are
  preserved exactly as they were. Migration only adds new v2 metadata.
