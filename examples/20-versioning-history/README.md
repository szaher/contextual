# Example 20: Versioning and History

Every `.ctx` file in ctxl v2 is versioned. Each change to a `.ctx` file
automatically increments its version number and records a history entry
describing what changed, who changed it, and why. This gives teams full
auditability over their context files and allows agents to understand how
context has evolved over time.

## What This Demonstrates

- The `_history` field in `.ctx` files and its structure
- Automatic version bumping on every `.ctx` modification
- Viewing history with `ctxkit history`
- Comparing versions with `ctxkit history --diff`
- History archival: inline entries (up to 20) and overflow to `.ctxl.history/`
- History entry fields: version, timestamp, author, session_id, reason, checksum, diff_summary

## Files in This Example

- **`.ctx`** -- A `.ctx` file with a `_history` field containing 5 history entries,
  showing the evolution of the file from its initial creation through several
  updates.
- **`.ctxl.history/`** -- Directory where archived history entries are stored
  when the inline history exceeds 20 entries.
- **`.ctxl.history/auth.ctx.history.yaml`** -- Sample archived history file.

## How Versioning Works

### Version Field

Every `.ctx` file has a top-level `version` field. In v2, this field tracks
both the schema version and the file revision:

```yaml
version: 2          # Schema version (always 2 for v2)
_version: 5         # File revision (incremented on each change)
```

The `_version` field is managed automatically by ctxl. You should not edit
it manually. Every time a `.ctx` file is modified (either by a human or an
agent via `ctxkit apply`), `_version` is incremented by 1.

### The _history Field

The `_history` field is an array of history entries, most recent first.
Each entry records:

| Field          | Type     | Description                                      |
|----------------|----------|--------------------------------------------------|
| version        | number   | The `_version` value after this change            |
| timestamp      | string   | ISO 8601 timestamp of when the change was made   |
| author         | string   | Who made the change (user, agent name, or "system") |
| session_id     | string   | The ctxl session ID, if the change was made during a session |
| reason         | string   | Human-readable description of why the change was made |
| checksum       | string   | SHA-256 checksum of the file content after this change |
| diff_summary   | string   | One-line summary of what changed (e.g., "added key_file entry for utils/logger.ts") |

### Inline vs. Archived History

To keep `.ctx` files manageable, ctxl stores only the 20 most recent
history entries inline in the `_history` field. When a 21st entry is added:

1. The oldest entry is moved to `.ctxl.history/<path>.history.yaml`
2. The inline `_history` retains only the 20 newest entries
3. The archive file is append-only and contains the full history

This means the `.ctx` file stays readable while the full audit trail is
preserved in the archive.

### Checksum Verification

Each history entry includes a `checksum` field (SHA-256 of the file
content at that version). This allows ctxl to:

- Detect tampering: if the file content does not match the latest checksum,
  ctxl warns that the file was modified outside of ctxl
- Verify integrity during migration
- Enable reproducible diffs between any two versions

## Try It Out

### Step 1: View the history of a .ctx file

```bash
ctxkit history
```

Expected output:

```
History for .ctx (5 versions)
==============================

  v5  2026-03-14 09:15:00  claude-code  sess_abc123
      Added gotcha about test environment JWT algorithm mismatch
      Checksum: sha256:f7e8d9c0...

  v4  2026-03-12 14:30:00  developer    sess_def456
      Updated jwt-service.ts key_file entry after refactor
      Checksum: sha256:e6d7c8b9...

  v3  2026-03-10 11:00:00  claude-code  sess_ghi789
      Added decision d001: JWT over session cookies
      Checksum: sha256:d5c6b7a8...

  v2  2026-03-08 16:45:00  developer    (manual)
      Added auth-security-requirements contract
      Checksum: sha256:c4b5a697...

  v1  2026-03-05 09:00:00  system       (bootstrap)
      Initial .ctx generation via ctxkit bootstrap
      Checksum: sha256:b3a49586...
```

### Step 2: View history across all .ctx files

```bash
ctxkit history --all
```

Expected output:

```
History across all .ctx files
==============================

.ctx (5 versions, latest: v5 2026-03-14)
src/auth/.ctx (3 versions, latest: v3 2026-03-12)
src/api/.ctx (2 versions, latest: v2 2026-03-10)
src/utils/.ctx (1 version, latest: v1 2026-03-05)

Total: 11 versions across 4 files
```

### Step 3: Compare two versions

```bash
ctxkit history --diff 1..5
```

Expected output:

```
Diff: .ctx v1 -> v5
====================

--- v1 (2026-03-05 09:00:00, system)
+++ v5 (2026-03-14 09:15:00, claude-code)

Changes across 4 versions:

  v1 -> v2: Added auth-security-requirements contract
    + contracts[0]: auth-security-requirements (locked, owner: security)

  v2 -> v3: Added decision d001: JWT over session cookies
    + decisions[0]: d001 "JWT over session cookies for API authentication"

  v3 -> v4: Updated jwt-service.ts key_file entry after refactor
    ~ key_files[1].why: "JWT token management" -> "JWT issuance and validation. Token expiry: access=15m, refresh=7d."
    ~ key_files[1].verified_at: "aaa1111" -> "def5678"

  v4 -> v5: Added gotcha about test environment JWT algorithm mismatch
    + gotchas[0]: "jwt-service.ts uses RS256 in production but HS256 in test."
```

### Step 4: Inspect the checksum

```bash
ctxkit history --verify
```

Expected output:

```
Checksum Verification
======================

.ctx:
  Current checksum: sha256:f7e8d9c0...
  Latest history checksum: sha256:f7e8d9c0...
  Status: OK (checksums match)

src/auth/.ctx:
  Current checksum: sha256:a1b2c3d4...
  Latest history checksum: sha256:a1b2c3d4...
  Status: OK (checksums match)
```

## Key Takeaways

- Every `.ctx` change is tracked with a version number, timestamp, author,
  and reason. This provides a full audit trail for context evolution.
- The `_history` field stores the 20 most recent entries inline. Older
  entries overflow to `.ctxl.history/` for archival.
- Checksums (SHA-256) on each history entry enable integrity verification
  and tamper detection.
- Use `ctxkit history --diff` to understand how a `.ctx` file has evolved
  between any two versions.
- History is created automatically by ctxl -- you do not need to write
  history entries by hand.
