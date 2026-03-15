# Example 21: Multi-Agent Conflict Resolution

When multiple agents (or an agent and a human) edit the same `.ctx` file
concurrently, conflicts can occur. ctxl v2 includes a conflict resolution
system with file locking, three-way merge, and interactive resolution
commands. This example demonstrates how conflicts arise, how they are
detected, and how to resolve them.

## What This Demonstrates

- How concurrent edits to the same `.ctx` file create conflicts
- The `.ctxl.lock` file and lock acquisition protocol
- The `_conflicts` field in `.ctx` files
- Three-way merge algorithm for `.ctx` files
- Resolution choices: ours, theirs, merged
- Lock TTL (5-minute timeout) and the `has_conflicts` flag
- Commands for listing and resolving conflicts

## Files in This Example

- **`src/auth/.ctx.agent-a`** -- The `.ctx` file as modified by Agent A (adds a
  new key_file entry and updates the summary).
- **`src/auth/.ctx.agent-b`** -- The `.ctx` file as modified by Agent B (adds a
  different key_file entry and a new contract).
- **`src/auth/.ctx.base`** -- The common ancestor (base version) before both
  agents made changes.
- **`src/auth/.ctx.conflicted`** -- The `.ctx` file after conflict detection,
  showing the `_conflicts` field.
- **`.ctxl.lock`** -- Sample lock file showing lock acquisition metadata.

## How Conflicts Arise

### Scenario

1. Agent A starts a session and reads `src/auth/.ctx` (version 3).
2. Agent B starts a separate session and also reads `src/auth/.ctx` (version 3).
3. Agent A proposes an update: adds `key_files` entry for `src/auth/oauth.ts`
   and updates the summary to mention OAuth.
4. Agent B proposes an update: adds `key_files` entry for `src/auth/mfa.ts`
   and adds a new contract for MFA requirements.
5. Agent A's proposal is applied first, bumping the version to 4.
6. Agent B's proposal is applied -- but it was based on version 3, not 4.
   This creates a conflict.

### Conflict Detection

ctxl detects conflicts by comparing:
- The **base version** the proposal was created against
- The **current version** of the file on disk

If the current version is newer than the base version, ctxl performs a
three-way merge to determine whether the changes are compatible or conflicting.

## The Lock Protocol

Before applying a proposal, ctxl acquires a lock on the target `.ctx` file:

```yaml
# .ctxl.lock
locks:
  - path: "src/auth/.ctx"
    session_id: "sess_abc123"
    agent: "claude-code"
    acquired_at: "2026-03-15T10:30:00Z"
    ttl_seconds: 300
    purpose: "applying proposal diff_007"
```

### Lock Rules

| Rule              | Detail                                                 |
|-------------------|--------------------------------------------------------|
| TTL               | 5 minutes (300 seconds). Lock expires automatically.   |
| Scope             | One lock per `.ctx` file path.                         |
| Contention        | If a lock is held, the second agent waits or aborts.   |
| Stale locks       | Locks older than TTL are considered expired and can be overridden. |
| Manual release    | `ctxkit lock release src/auth/.ctx`                    |

## Three-Way Merge Algorithm

ctxl uses a three-way merge to resolve concurrent edits:

```
Base (v3)          Agent A (v4)        Agent B (proposed)
---------          ------------        ------------------
summary: "Auth"    summary: "Auth+OAuth" summary: "Auth"
key_files: [h,j,m] key_files: [h,j,m,o] key_files: [h,j,m,f]
contracts: [sec]   contracts: [sec]      contracts: [sec, mfa]
```

### Merge Rules

1. **Non-overlapping additions**: Automatically merged.
   - Agent A adds `oauth.ts` to key_files, Agent B adds `mfa.ts` to key_files.
   - Result: both entries are included.

2. **Non-overlapping modifications**: Automatically merged.
   - Agent A modifies summary, Agent B adds a contract.
   - Result: both changes are applied.

3. **Overlapping modifications**: Conflict.
   - Agent A changes `key_files[0].why` to "X", Agent B changes `key_files[0].why` to "Y".
   - Result: conflict marker added; human resolution required.

4. **Deletion vs. modification**: Conflict.
   - Agent A deletes a key_file entry, Agent B modifies the same entry.
   - Result: conflict marker added.

### The _conflicts Field

When conflicts are detected, ctxl adds a `_conflicts` field to the `.ctx` file:

```yaml
_conflicts:
  - field: "summary"
    base: "Authentication module."
    ours: "Authentication and OAuth module."
    theirs: "Authentication module."
    resolution: null    # null = unresolved
  - field: "key_files[0].why"
    base: "Auth handler."
    ours: "Auth handler with OAuth support."
    theirs: "Auth handler with MFA support."
    resolution: null
```

The `has_conflicts` flag is also set at the top level:

```yaml
has_conflicts: true
```

## Try It Out

### Step 1: List all conflicts

```bash
ctxkit conflicts list
```

Expected output:

```
Conflicts
=========

src/auth/.ctx (2 conflicts)
  1. summary
     ours:   "Authentication and OAuth module."
     theirs: "Authentication module."

  2. key_files[0].why
     ours:   "Auth handler with OAuth support."
     theirs: "Auth handler with MFA support."

Total: 2 conflicts in 1 file
```

### Step 2: Resolve conflicts interactively

```bash
ctxkit conflicts resolve src/auth/.ctx
```

Expected output:

```
Resolving conflicts in src/auth/.ctx
======================================

Conflict 1/2: summary
  Base:   "Authentication module."
  Ours:   "Authentication and OAuth module."
  Theirs: "Authentication module."

  [o]urs / [t]heirs / [m]erge / [s]kip? o

  Resolved: using ours -> "Authentication and OAuth module."

Conflict 2/2: key_files[0].why
  Base:   "Auth handler."
  Ours:   "Auth handler with OAuth support."
  Theirs: "Auth handler with MFA support."

  [o]urs / [t]heirs / [m]erge / [s]kip? m

  Enter merged value:
  > Auth handler with OAuth and MFA support.

  Resolved: using merged value.

All conflicts resolved. Updated src/auth/.ctx (version 5).
```

### Step 3: Resolve conflicts non-interactively

```bash
# Accept all "ours" changes
ctxkit conflicts resolve src/auth/.ctx --strategy ours

# Accept all "theirs" changes
ctxkit conflicts resolve src/auth/.ctx --strategy theirs
```

### Step 4: Check lock status

```bash
ctxkit lock status
```

Expected output:

```
Active Locks
=============

  src/auth/.ctx
    Session: sess_abc123
    Agent: claude-code
    Acquired: 2026-03-15T10:30:00Z (2m 15s ago)
    TTL: 300s (2m 45s remaining)
    Purpose: applying proposal diff_007

Total: 1 active lock
```

### Step 5: Release a stale lock manually

```bash
ctxkit lock release src/auth/.ctx
```

Expected output:

```
Released lock on src/auth/.ctx (was held by sess_abc123)
```

## Key Takeaways

- Conflicts arise when two agents (or an agent and a human) edit the same
  `.ctx` file concurrently based on the same base version.
- ctxl uses a three-way merge algorithm: non-overlapping changes merge
  automatically; overlapping changes require human resolution.
- The `_conflicts` field stores unresolved conflicts with base, ours, and
  theirs values. The `has_conflicts` flag indicates whether the file needs
  attention.
- File locks (`.ctxl.lock`) prevent simultaneous writes. Locks have a
  5-minute TTL and expire automatically.
- Use `ctxkit conflicts resolve` for interactive resolution or pass
  `--strategy ours|theirs` for batch resolution.
