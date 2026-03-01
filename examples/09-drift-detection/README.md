# Example 09: Drift Detection

## What This Demonstrates

How ctxl detects when `.ctx` entries become stale because the code they
describe has changed. Drift detection uses the `verified_at` commit hash
on each entry to determine whether referenced files have been modified
since the entry was last verified.

## How Drift Detection Works

### The verified_at Field

Every entry in `key_files`, `contracts`, `decisions`, and `gotchas` has
a `verified_at` field containing a git commit hash:

```yaml
- path: src/email/sender.ts
  why: "Email sending logic"
  verified_at: "a1b2c3d"    # <-- This is the anchor
```

This means: "As of commit a1b2c3d, this entry accurately describes the
referenced file."

### What Triggers Drift

ctxl checks whether the referenced file has been modified since the
`verified_at` commit. Drift is detected when:

1. **File modified**: `src/email/sender.ts` has commits after `a1b2c3d`
   that changed it.
2. **File renamed**: `src/email/sender.ts` was renamed to
   `src/email/email-sender.ts`.
3. **File deleted**: `src/email/sender.ts` no longer exists in the repo.
4. **Contract mismatch**: The API described in a contract no longer
   matches the actual code signatures.

### Drift Severity

| Severity | Condition                           | Impact on Scoring        |
|----------|-------------------------------------|--------------------------|
| Low      | File modified, minor changes        | Recency score reduced    |
| Medium   | File significantly changed          | Recency score = 0.3      |
| High     | File renamed or deleted             | Entry flagged for update  |

### Effect on Context Assembly

Stale entries are down-ranked during scoring:
- **Verified entry** (no drift): recency score = 0.9
- **No verification** (missing `verified_at`): recency score = 0.5
- **Stale entry** (drift detected): recency score = 0.3

This means stale entries are less likely to be included in the Context
Pack, reducing the risk of injecting outdated information.

## Commands to Try

### Run drift detection

```bash
ctxkit drift
```

Expected output for this example:

```
Drift Report
=============

STALE: key_files/src/email/sender.ts
  Verified at: a1b2c3d (12 commits behind)
  Files modified since verification:
    - src/email/sender.ts (commits: e7f8a9b, d6c5b4a)
  Action: Update entry or re-verify

STALE: key_files/src/queue/processor.ts
  Verified at: b2c3d4e (8 commits behind)
  Files modified since verification:
    - src/queue/processor.ts (commits: f0a1b2c)
  Action: LOCKED -- manual review required (owner: infrastructure)
  WARNING: This entry is locked. Automated proposals are suppressed.

MISSING: key_files/src/push/firebase-client.ts
  Verified at: c3d4e5f
  File does not exist in the current tree.
  Action: Remove entry or update path

OK: key_files/src/sms/twilio-client.ts
  Verified at: f0a1b2c (current)

Summary: 2 stale, 1 missing, 1 current
```

### Check drift for a specific .ctx file

```bash
ctxkit drift .ctx
```

### Propose updates based on drift

```bash
ctxkit propose
```

Expected output:

```
Proposal diff_001:
--- a/.ctx
+++ b/.ctx
@@ key_files @@
   - path: src/email/sender.ts
-    verified_at: "a1b2c3d"
+    verified_at: "e7f8a9b"

Provenance: file modified in commits e7f8a9b, d6c5b4a
[a]pprove / [e]dit / [r]eject?

Proposal diff_002:
--- a/.ctx
+++ b/.ctx
@@ key_files @@
-  - path: src/push/firebase-client.ts
-    why: "Firebase Cloud Messaging client for push notifications."
-    tags: [push, firebase, notifications]
-    verified_at: "c3d4e5f"
-    locked: false

Provenance: file src/push/firebase-client.ts no longer exists
[a]pprove / [e]dit / [r]eject?

Skipping: key_files/src/queue/processor.ts
  Reason: Entry is locked (owner: infrastructure)
  NOTE: This entry is stale. Manual review recommended.
```

Notice:
- The stale email entry gets a proposal to update `verified_at`
- The missing firebase entry gets a proposal to remove it
- The locked queue entry is flagged but NOT automatically proposed

### Re-verify an entry manually

After confirming an entry is still accurate:

```bash
# Update verified_at to the current HEAD commit
ctxkit verify src/email/sender.ts
```

This updates the `verified_at` field to the current commit hash without
changing any other content.

## Drift and Locked Entries

When drift is detected on a locked entry, ctxl:
1. Surfaces a warning with the drift details
2. Does NOT propose an automated change
3. Records the drift in the session log
4. The developer must manually review and update the entry

This protects critical entries (security contracts, infrastructure
decisions) from automated modifications while still alerting the team
that something may be out of date.

## Periodic Drift Checks

The ctxl daemon can run drift checks periodically:
- On daemon startup
- When a session begins
- On a configurable schedule

Drift results are visible in the dashboard and CLI.

## Best Practices

- **Update verified_at after code reviews**: When you review and confirm
  a `.ctx` entry is still accurate, bump the `verified_at` hash. This
  is the primary signal for freshness.

- **Do not ignore drift warnings**: A stale entry is worse than no entry.
  It gives the agent false confidence in outdated information.

- **Use lock for entries that need human judgment**: Infrastructure
  decisions, security contracts, and compliance rules should be locked
  so drift triggers a manual review, not an automated fix.

- **Delete entries for deleted files**: If a file is permanently removed,
  remove the `.ctx` entry. Do not leave dangling references.

- **Run drift checks before major changes**: Before starting a big
  refactor, run `ctxkit drift` to identify stale entries that might
  mislead the agent during the work.
