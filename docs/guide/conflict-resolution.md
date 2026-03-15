# Multi-Agent Conflict Resolution

When multiple agents edit the same `.ctx` file concurrently, ctxl detects the conflict and resolves it using a three-way merge algorithm. This page explains how conflicts arise, how they are resolved, and what to do when automatic resolution is not possible.

## The Problem

In a multi-agent workflow, two agents might be working on overlapping areas of the codebase simultaneously. Both agents may propose updates to the same `.ctx` file:

```
Agent A (session sess_001):               Agent B (session sess_002):
  reads src/auth/.ctx (v5)                  reads src/auth/.ctx (v5)
  modifies key_files section                modifies contracts section
  submits proposal                          submits proposal
  -- conflict --
```

Without conflict resolution, the second proposal to be applied would overwrite the first agent's changes. ctxl prevents this by detecting the version mismatch and applying a three-way merge.

## Three-Way Merge Algorithm

The merge uses three inputs:

- **Base** -- the common ancestor version (v5 in the example above)
- **Ours** -- the first applied change
- **Theirs** -- the second change attempting to be applied

### Section-Level Merge

The merge operates at the section level, not the line level. Each top-level section of the `.ctx` file is merged independently:

| Section | Merge Strategy |
|---------|----------------|
| `summary` | Compare: if both changed, conflict |
| `key_files` | Union by `path` key: entries are matched by their `path` field |
| `contracts` | Union by `name` key: entries are matched by their `name` field |
| `decisions` | Union by `id` key: entries are matched by their `id` field |
| `gotchas` | Union by index: entries are matched by position |
| `commands` | Union by key: commands are matched by their name |
| `tags` | Set union: tags are merged as a set (duplicates removed) |
| `refs` | Union by `target` key: refs are matched by their `target` field |

### Union Strategy (Arrays)

For array sections like `key_files`, `contracts`, and `decisions`:

1. Match entries between base, ours, and theirs using the key field (`path`, `name`, or `id`)
2. If an entry exists only in ours or only in theirs, include it (addition)
3. If an entry was removed in ours or theirs but not both, remove it (deletion)
4. If an entry was modified in ours but not theirs, use ours
5. If an entry was modified in theirs but not ours, use theirs
6. If an entry was modified in both, mark it as a conflict

### Compare Strategy (Scalars)

For scalar sections like `summary`:

1. If both ours and theirs have the same value, no conflict
2. If only one side changed from base, use the changed value
3. If both sides changed to different values, mark as a conflict

## Lock Manager

To reduce the frequency of conflicts, ctxl provides a lock manager that allows agents to claim exclusive write access to a `.ctx` file.

### Acquiring a Lock

```typescript
import { acquireLock } from '@ctxkit/core'

const lock = acquireLock(ctxPath, {
  session_id: 'sess_abc123',
  agent_id: 'claude',
})

if (lock.acquired) {
  // Safe to modify the .ctx file
  // ...
  releaseLock(ctxPath, lock.id)
} else {
  console.log(`Lock held by ${lock.holder.agent_id} (${lock.holder.session_id})`)
}
```

### Lock Properties

| Property | Value |
|----------|-------|
| TTL | 5 minutes |
| Scope | Per `.ctx` file |
| Holder info | session_id, agent_id, acquired_at |
| Renewal | Lock holder can renew before TTL expiry |
| Force release | Available for stuck locks |

Locks are advisory: they prevent well-behaved agents from colliding but do not prevent direct file writes. The three-way merge serves as the safety net when locks are bypassed or expire.

## Conflict Detection

When a proposal is applied and the `.ctx` file has been modified since the proposal was created, ctxl:

1. Loads the base version (from the proposal's snapshot)
2. Loads the current version (from disk)
3. Loads the proposed version (from the proposal diff)
4. Runs the three-way merge

If any section has an unresolvable conflict, the `.ctx` file is written with conflict markers:

### Conflict Entry Structure

```yaml
has_conflicts: true
_conflicts:
  - section: "summary"
    ours: "Auth module handling login and registration"
    theirs: "Auth module handling login, registration, and MFA"
    base: "Auth module handling login"
    created_at: "2026-03-15T10:35:00.000Z"
    session_ours: "sess_001"
    session_theirs: "sess_002"
```

The `has_conflicts` flag is set to `true` on the `.ctx` file, making conflicts easy to detect programmatically.

### ConflictEntry Fields

| Field | Type | Description |
|-------|------|-------------|
| `section` | string | Which section has the conflict |
| `ours` | any | The value from the first applied change |
| `theirs` | any | The value from the second change |
| `base` | any | The common ancestor value |
| `created_at` | string | When the conflict was detected |
| `session_ours` | string | Session ID that produced the "ours" side |
| `session_theirs` | string | Session ID that produced the "theirs" side |

## CLI Commands

### `ctxkit conflicts list`

List all `.ctx` files with unresolved conflicts.

```bash
ctxkit conflicts list

# Output
Files with conflicts:

Path                   Conflicts  Created
---------------------------------------------------------------------------
src/auth/.ctx          1          2026-03-15T10:35:00.000Z
src/db/.ctx            2          2026-03-15T10:40:00.000Z

Total: 3 conflict(s) across 2 file(s)
```

### `ctxkit conflicts resolve`

Resolve conflicts by picking a side.

```bash
# Pick "ours" for all conflicts in a file
ctxkit conflicts resolve src/auth/.ctx --pick ours

# Pick "theirs"
ctxkit conflicts resolve src/auth/.ctx --pick theirs

# Output
Resolved 1 conflict(s) in src/auth/.ctx
  summary: picked ours ("Auth module handling login and registration")
  ctx_version bumped to 8
```

After resolution, the `has_conflicts` flag is removed and the `_conflicts` array is cleared. A new history entry is added recording the conflict resolution.

## Dashboard

The dashboard provides a visual conflict resolution interface at `/conflicts`. See [Dashboard](/guide/dashboard) for details.

## Programmatic API

```typescript
import { threeWayMerge, resolveConflict, extractConflicts } from '@ctxkit/core'

// Run a three-way merge
const result = threeWayMerge(base, ours, theirs)

if (result.has_conflicts) {
  const conflicts = extractConflicts(result)
  for (const conflict of conflicts) {
    console.log(`Conflict in ${conflict.section}`)
  }

  // Resolve by picking a side
  const resolved = resolveConflict(result, 'ours')
}
```

## Best Practices

1. **Use locks for long edits** -- if an agent session will make multiple changes to a `.ctx` file, acquire a lock at the start and release it when done.

2. **Keep sections focused** -- splitting context across multiple `.ctx` files (one per directory) reduces the chance of conflicts since agents working on different directories will not touch the same files.

3. **Review conflicts promptly** -- unresolved conflicts prevent version tracking from incrementing cleanly. Use `ctxkit conflicts list` in CI to catch stale conflicts.

4. **Prefer the proposal system** -- the proposal system serializes changes through the daemon, which reduces conflict frequency compared to direct file writes.

## Next Steps

- Understand [Version Tracking](/guide/versioning) and how versions interact with conflicts
- Learn about [Auto-Update](/guide/auto-update) and how it generates proposals safely
- See the [HTTP API](/api/http-api) for conflict-related endpoints
