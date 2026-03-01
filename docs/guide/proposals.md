# Proposals

Proposals are the mechanism through which `.ctx` files are updated. Every change -- whether triggered by drift detection, dead reference scanning, or manual editing -- goes through a strict propose-review-apply workflow.

## Core Principle: No Silent Rewrites

ctxl never modifies `.ctx` files without explicit user approval. All changes are:

1. **Proposed** -- a diff is generated showing the exact changes
2. **Reviewed** -- the user inspects the diff
3. **Approved or rejected** -- the user makes an explicit decision
4. **Applied** -- only approved proposals are written to disk

This is enforced at every level: CLI, daemon API, and dashboard UI.

## Proposal Lifecycle

```
proposed --> approved/rejected --> applied (if approved)
```

| Status | Description |
|--------|-------------|
| `proposed` | Initial state; diff generated but not reviewed |
| `approved` | User approved the change (optionally with edits) |
| `rejected` | User rejected the change |
| `applied` | Approved change was written to the `.ctx` file |

Status transitions are validated:
- Only `proposed` can transition to `approved` or `rejected`
- Only `approved` can transition to `applied`
- Attempting an invalid transition returns a `409 Conflict` error

## Creating Proposals

### Via CLI: Dead Reference Scanning

The `ctxkit propose` command analyzes a `.ctx` file and reports its structure:

```bash
ctxkit propose path/to/.ctx --check-files
```

This scans for:
- Key files that reference non-existent files
- Refs that point to missing `.ctx` targets
- Locked entries and their owners

Output:

```
Analyzing /path/to/.ctx...

  Dead reference: key_files/old-file.ts
    File not found at /path/to/old-file.ts
  Dead reference: refs/missing.ctx
    Target not found at /path/to/missing.ctx

  Found 2 dead reference(s)

.ctx Summary:
  Version: 1
  Key files: 5
  Contracts: 2
  Decisions: 3
  Gotchas: 1
  Tags: typescript, auth
  Refs: 2

  Locked entries (1):
    key_files/critical.ts (owner: core-team)
```

### Via Daemon API

Submit a proposal programmatically:

```bash
curl -X POST http://localhost:3742/api/v1/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_abc123",
    "ctx_path": "src/auth/.ctx",
    "diff_content": "--- a/src/auth/.ctx\n+++ b/src/auth/.ctx\n...",
    "provenance": "drift-detection: file_renamed"
  }'
```

Required fields:
- `ctx_path` -- path to the `.ctx` file being modified
- `diff_content` -- the unified diff showing proposed changes
- `provenance` -- why this change is being proposed

Optional fields:
- `session_id` -- the session that triggered this proposal
- `event_id` -- the specific request event that triggered it

### Programmatic Scanning

Use the core library to scan for dead references:

```typescript
import { scanForDeadReferences } from '@ctxl/core'

const result = scanForDeadReferences('/path/to/.ctx', '/repo/root')

console.log(result.proposals)
// [
//   {
//     section: 'key_files',
//     entryId: 'old-file.ts',
//     action: 'remove',
//     reason: 'Referenced file no longer exists',
//     details: 'File old-file.ts was not found at ...'
//   }
// ]

if (result.diff) {
  console.log(result.diff.diff)     // Unified diff string
  console.log(result.diff.hasChanges)  // true
  console.log(result.diff.secretsRedacted)  // true/false
}
```

## Reviewing Proposals

### Via CLI

List pending proposals:

```bash
ctxkit sessions  # Shows session with proposal counts
```

### Via Dashboard

The dashboard provides a visual diff viewer where you can:
- See the full unified diff with syntax highlighting
- Edit the diff before approving
- Approve or reject with one click
- View the provenance (what triggered the proposal)

### Via API

List proposals with optional filters:

```bash
# All pending proposals
curl "http://localhost:3742/api/v1/proposals?status=proposed"

# Proposals for a specific file
curl "http://localhost:3742/api/v1/proposals?ctx_path=src/auth/.ctx"

# With pagination
curl "http://localhost:3742/api/v1/proposals?limit=10&offset=0"
```

## Approving and Applying

### Via CLI

```bash
# Approve and apply a proposal
ctxkit apply <proposal-id>

# Reject a proposal
ctxkit apply <proposal-id> --reject
```

The `apply` command performs two steps:
1. `PATCH /proposals/:id` with `status: "approved"` (or `"rejected"`)
2. `POST /proposals/:id/apply` to write the change (only for approved proposals)

### Via API

Step 1: Approve (with optional edits):

```bash
curl -X PATCH http://localhost:3742/api/v1/proposals/prop_123 \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'
```

With edits to the diff:

```bash
curl -X PATCH http://localhost:3742/api/v1/proposals/prop_123 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "edited_diff": "--- a/.ctx\n+++ b/.ctx\n@@ -1,3 +1,3 @@\n..."
  }'
```

Step 2: Apply:

```bash
curl -X POST http://localhost:3742/api/v1/proposals/prop_123/apply
```

Response:

```json
{
  "id": "prop_123",
  "status": "applied",
  "audit_id": "aud_456"
}
```

## Secret Safety

Before a diff is presented to the user, ctxl scans it for secrets and redacts them:

```typescript
import { generateDiff } from '@ctxl/core'

const result = generateDiff(oldContent, newContent, '.ctx')
console.log(result.secretsRedacted)  // true if any secrets were found and redacted
```

The diff content replaces detected secrets with `[REDACTED:<type>]` markers. This prevents credentials from appearing in proposals, logs, or the dashboard.

## Audit Trail

Every applied proposal generates an audit entry recording:
- Which `.ctx` file was changed
- What the change was (diff content)
- Who initiated it (session ID or "user")
- Why (the provenance or reason)
- When (timestamp)

Audit entries are queryable via the API and visible in the dashboard.

## Locked Entries

Proposals respect lock semantics:
- Automated proposals skip entries with `locked: true`
- Manual proposals can modify locked entries (the user explicitly chose to)
- Drift detection warns about stale locked entries but does not propose changes

## Next Steps

- Understand how [Drift Detection](/guide/drift-detection) generates proposals
- Learn about [Sessions](/guide/sessions) and session-triggered proposals
- Review the [Security](/guide/security) model for secret handling
