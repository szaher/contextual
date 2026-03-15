# Version Tracking & History

ctxl v2 automatically tracks every modification to `.ctx` files with version numbers, timestamps, authors, and diff summaries. This gives teams a complete audit trail of how context memory has evolved over time.

## How It Works

Every time a `.ctx` file is modified -- whether by an agent, a CLI command, or a manual edit -- ctxl:

1. Bumps the `ctx_version` field
2. Computes a SHA-256 checksum of the new content
3. Generates a diff summary describing what changed
4. Appends a history entry to the `_history` field

This happens automatically through the proposal system, the auto-update system, and the MCP tools.

## Version Field

Each `.ctx` file carries a `ctx_version` field (distinct from the format `version` field):

```yaml
version: 2
ctx_version: 7
summary: "Auth module context"
# ...
```

The `ctx_version` starts at 1 when a `.ctx` file is created and increments on every modification. It provides a simple monotonic counter for ordering changes.

## History Entries

The `_history` field stores an inline array of modification records:

```yaml
_history:
  - version: 7
    timestamp: "2026-03-15T10:30:00.000Z"
    author: "claude:sess_abc123"
    session_id: "sess_abc123"
    reason: "Added new key_file for refactored handler"
    checksum: "sha256:f6e5d4c3b2a1..."
    diff_summary: "+key_files/sign-in.ts, ~summary"

  - version: 6
    timestamp: "2026-03-14T15:00:00.000Z"
    author: "human"
    session_id: null
    reason: "Manual contract update"
    checksum: "sha256:a1b2c3d4e5f6..."
    diff_summary: "~contracts/auth-security"
```

### History Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | The `ctx_version` at the time of this entry |
| `timestamp` | string | ISO 8601 timestamp of the modification |
| `author` | string | Who made the change (`"human"`, `"claude:sess_id"`, `"auto-update"`, etc.) |
| `session_id` | string or null | Agent session ID if the change was agent-initiated |
| `reason` | string | Human-readable explanation of why the change was made |
| `checksum` | string | SHA-256 hash of the `.ctx` content after this change |
| `diff_summary` | string | Compact notation of what changed (see below) |

### Diff Summary Notation

The `diff_summary` field uses a compact notation to describe changes:

| Symbol | Meaning | Example |
|--------|---------|---------|
| `+` | Added | `+key_files/new-file.ts` |
| `-` | Removed | `-gotchas/old-gotcha` |
| `~` | Modified | `~contracts/auth-security` |

Multiple changes are comma-separated: `+key_files/handler.ts, ~summary, -gotchas/stale-warning`

## Inline History Limit

The `_history` array is capped at **20 entries** to keep `.ctx` files from growing unbounded. When the 21st entry is added:

1. The oldest entries (beyond 20) are moved to the archive
2. The `_history` array is trimmed to the 20 most recent entries

This means the `.ctx` file always contains the 20 most recent changes inline, which is sufficient for day-to-day context about recent modifications.

## Archive Directory

Overflow history entries are archived to `.ctxl.history/` alongside the `.ctx` file:

```
src/auth/
  .ctx
  .ctxl.history/
    v1-v10.yaml
    v11-v20.yaml
```

Each archive file covers a range of versions. Archive files are append-only and never modified after creation.

### Archive File Format

```yaml
ctx_path: "src/auth/.ctx"
entries:
  - version: 1
    timestamp: "2026-01-10T08:00:00.000Z"
    author: "human"
    session_id: null
    reason: "Initial creation"
    checksum: "sha256:..."
    diff_summary: "+summary, +key_files/login.ts, +contracts/auth-security"
  - version: 2
    # ...
```

## Checksum Computation

Checksums are computed using SHA-256 over the `.ctx` file content with the `_history` field excluded. This means:

- Two `.ctx` files with identical content but different histories have the **same** checksum
- The checksum changes only when the actual context content changes
- This allows the index to detect content changes without tracking history

```typescript
import { computeChecksum } from '@ctxkit/core'

const checksum = computeChecksum(ctxFileContent)
// "sha256:a1b2c3d4e5f6..."
```

The exclusion of `_history` prevents checksum churn when history entries are archived or trimmed.

## CLI Commands

### `ctxkit history`

View the version history for a `.ctx` file.

```bash
# Show recent history (inline)
ctxkit history src/auth/.ctx

# Output
src/auth/.ctx (ctx_version: 7)

Version  Timestamp                  Author              Reason
---------------------------------------------------------------------------
7        2026-03-15T10:30:00.000Z   claude:sess_abc123  Added new key_file for refactored handler
6        2026-03-14T15:00:00.000Z   human               Manual contract update
5        2026-03-14T09:00:00.000Z   auto-update         Updated tags after dependency change
...

Showing 7 of 7 entries (inline)
```

### History Options

| Option | Description |
|--------|-------------|
| `--all` | Include archived entries (not just inline) |
| `--diff <range>` | Show diffs between versions (e.g., `--diff 1..5`) |
| `--count` | Show only the total number of versions |

### Viewing Diffs Between Versions

```bash
# Compare version 1 to version 5
ctxkit history src/auth/.ctx --diff 1..5

# Output
Diff: src/auth/.ctx v1 -> v5

--- v1 (2026-01-10T08:00:00.000Z)
+++ v5 (2026-03-14T09:00:00.000Z)

 summary: "Auth module context"
 key_files:
   - path: login.ts
     purpose: "Handles user authentication flow"
+  - path: sign-in.ts
+    purpose: "Refactored sign-in handler"
 contracts:
   - name: auth-security
-    content: "All endpoints must validate JWT tokens"
+    content: |
+      All authentication endpoints must:
+      1. Validate JWT signature and expiration
+      2. Apply rate limiting (100 req/min per IP)
```

### Full History

```bash
# Include archived history
ctxkit history src/auth/.ctx --all

# Count total versions
ctxkit history src/auth/.ctx --count
# 42 versions
```

## Reading Merged History Programmatically

```typescript
import { readMergedHistory } from '@ctxkit/core'

// Read inline + archived history, merged and sorted
const history = readMergedHistory('/path/to/src/auth/.ctx')

for (const entry of history) {
  console.log(`v${entry.version}: ${entry.reason} (${entry.author})`)
}
```

## Next Steps

- Learn how checksums feed into the [Index System](/guide/index-system)
- Understand [Conflict Resolution](/guide/conflict-resolution) when concurrent edits create version forks
- See how [Auto-Update](/guide/auto-update) creates versioned changes during sessions
