# Example 10: Update Proposals

## What This Demonstrates

The complete lifecycle of a `.ctx` update proposal: how changes are
proposed, reviewed, edited, approved, and applied. ctxl never silently
modifies `.ctx` files -- all changes go through this workflow.

## The Proposal Lifecycle

```
proposed --> reviewed --> approved --> applied
               |
               +--> edited --> approved --> applied
               |
               +--> rejected (discarded)
```

Every change to a `.ctx` file follows this path. There are no shortcuts,
no silent rewrites, and no auto-applies unless explicitly configured.

## Walkthrough: Propose, Review, Apply

### Step 1: Make a Code Change

Suppose you rename a function in your codebase:

```bash
# Before: src/auth/handler.ts exports loginHandler
# After:  src/auth/handler.ts exports signInHandler
git mv src/auth/login.ts src/auth/sign-in.ts
git commit -m "rename login to sign-in"
```

### Step 2: Detect Drift and Generate Proposals

```bash
ctxkit propose
```

Output:

```
Analyzing .ctx files for potential updates...

Proposal prop_001:
  File: src/auth/.ctx
  Type: key_files path update
  Reason: file_renamed (src/auth/login.ts -> src/auth/sign-in.ts)

--- a/src/auth/.ctx
+++ b/src/auth/.ctx
@@ key_files @@
   - path: src/auth/login.ts
-    why: "Main login handler"
+  - path: src/auth/sign-in.ts
+    why: "Main sign-in handler (renamed from login)"
     tags: [auth, api]
-    verified_at: "a1b2c3d"
+    verified_at: "f5e6d7c"
     locked: false

Provenance: File renamed in commit f5e6d7c
            Detected via: git log --diff-filter=R

[a]pprove / [e]dit / [r]eject? _
```

### Step 3: Review the Proposal

Before approving, you can inspect the proposal:

```bash
ctxkit proposals list
```

Output:

```
ID         FILE              TYPE          STATUS     CREATED
prop_001   src/auth/.ctx     key_files     proposed   2026-03-01 10:15
prop_002   .ctx              gotchas       proposed   2026-03-01 10:15
```

```bash
ctxkit proposals show prop_001
```

Output:

```
Proposal: prop_001
File: src/auth/.ctx
Section: key_files
Type: path update (file renamed)
Status: proposed

Provenance:
  Source: git log --diff-filter=R
  Commit: f5e6d7c
  Author: developer@example.com
  Message: "rename login to sign-in"

Diff:
  - path: src/auth/login.ts
  + path: src/auth/sign-in.ts

Impact:
  - 1 key_files entry updated
  - verified_at will be bumped to f5e6d7c
  - No locked entries affected
```

### Step 4a: Approve the Proposal

```bash
ctxkit apply prop_001
```

Output:

```
Applied prop_001 to src/auth/.ctx
  - Updated key_files path: src/auth/login.ts -> src/auth/sign-in.ts
  - Updated verified_at: a1b2c3d -> f5e6d7c
Audit log entry: aud_001
```

### Step 4b: Edit Before Approving (Alternative)

If the proposal is partially correct but you want to modify it:

```bash
ctxkit proposals edit prop_001
```

This opens the proposal diff in your editor. You can modify the proposed
changes before applying:

```diff
# Edit this diff. Lines starting with + will be applied.
# Remove or modify lines as needed.

   - path: src/auth/sign-in.ts
-    why: "Main sign-in handler (renamed from login)"
+    why: "Sign-in and authentication handler. Validates credentials and issues JWT tokens."
     tags: [auth, api]
     verified_at: "f5e6d7c"
     locked: false
```

Save and close the editor, then approve:

```bash
ctxkit apply prop_001
```

### Step 4c: Reject the Proposal (Alternative)

```bash
ctxkit reject prop_001 --reason "keeping the old name for now"
```

Output:

```
Rejected prop_001
  Reason: keeping the old name for now
  Audit log entry: aud_002
```

Rejected proposals are recorded in the audit log for traceability but
are not applied.

## Proposal Sources

Proposals can be triggered by several events:

### 1. Drift Detection

When `ctxkit drift` or `ctxkit propose` finds stale entries:
- Renamed files generate path update proposals
- Deleted files generate removal proposals
- Modified files generate re-verification proposals

### 2. Agent Session Completion

After a coding agent completes a task, ctxl analyzes what changed:
- New files may trigger "add to key_files" proposals
- Changed APIs may trigger contract update proposals
- New patterns may trigger "add gotcha" proposals

### 3. Manual Trigger

```bash
ctxkit propose --section key_files
ctxkit propose --section decisions
ctxkit propose --file src/auth/.ctx
```

### 4. Staleness Pruning

```bash
ctxkit propose --prune
```

This generates removal proposals for entries that reference files which
no longer exist or have not been verified in a long time.

Output:

```
Pruning proposals:

Proposal prop_003:
  File: .ctx
  Type: key_files removal (stale)
  Reason: src/legacy/old-handler.ts deleted 45 days ago

--- a/.ctx
+++ b/.ctx
@@ key_files @@
-  - path: src/legacy/old-handler.ts
-    why: "Legacy request handler (deprecated)"
-    tags: [legacy]
-    verified_at: "old1234"
-    locked: false

Justification: File deleted in commit abc5678 (45 days ago).
               No references to this file found in current codebase.

[a]pprove / [e]dit / [r]eject? _
```

## Locked Entry Behavior

When a proposal targets a locked entry:

```
Skipping: contracts/auth-security-requirements
  Reason: Entry is locked (owner: security)
  Drift detected: contract content may be stale
  NOTE: Manual review recommended. Use ctxkit unlock to allow updates.
```

Locked entries are never auto-proposed. The system alerts you about drift
but leaves the decision to you.

## Concurrent Proposals

When two agent sessions both propose changes to the same `.ctx` file:

```bash
# Session A proposes updating key_files
# Session B proposes updating commands

ctxkit proposals list
# ID         FILE    SECTION      STATUS     SESSION
# prop_004   .ctx    key_files    proposed   sess_A
# prop_005   .ctx    commands     proposed   sess_B
```

Both proposals are preserved. When you approve them:
- If they affect different sections: both are applied atomically
- If they conflict (same entry): you choose which to apply, or merge them

## Audit Trail

Every proposal action is recorded:

```bash
ctxkit audit --file .ctx --limit 10
```

Output:

```
AUDIT LOG for .ctx
==================

aud_001  2026-03-01 10:20  APPLIED   prop_001  key_files path update
  By: user (manual approval)
  Diff: src/auth/login.ts -> src/auth/sign-in.ts

aud_002  2026-03-01 10:22  REJECTED  prop_002  gotchas update
  By: user
  Reason: keeping the old name for now

aud_003  2026-02-28 14:00  APPLIED   prop_000  initial creation
  By: system (ctxkit init)
  Diff: (full file created)
```

## Best Practices

- **Review proposals promptly**: Stale proposals accumulate and become
  harder to evaluate. Review them after each coding session.

- **Use edit mode for accuracy**: Auto-generated proposals are good
  starting points but may miss nuance. Edit the "why" field to be
  more descriptive than the auto-generated text.

- **Reject with reasons**: Always provide a reason when rejecting.
  This helps ctxl learn patterns and helps teammates understand why
  a proposed change was declined.

- **Batch approve low-risk changes**: Command and tag updates are
  usually safe to batch approve. Consider enabling auto-approve for
  these sections in your workspace profile.

- **Never force-apply to locked entries**: If you need to update a
  locked entry, unlock it first, make the change, then re-lock it.
  This maintains the audit trail.
