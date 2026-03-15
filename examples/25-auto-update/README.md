# Example 25: Auto-Update During Coding Sessions

ctxl can automatically update `.ctx` files as an agent works. When a file
referenced in a `.ctx` entry is modified, ctxl marks it as stale and, at
the end of the task, proposes updates to bring the `.ctx` file back in
sync. This keeps context fresh without requiring manual intervention.
The behavior is controlled by policies: some teams prefer fully automatic
updates, while others require human review of every proposed change.

## What This Demonstrates

- How the PostToolUse hook tracks file modifications and marks entries as stale
- How the TaskCompleted hook generates update proposals for stale entries
- The staleness lifecycle: fresh -> stale -> proposed -> updated
- Policy controls: `auto_update` vs. `require_review`
- Activity events that ctxl logs during a session
- How to configure auto-update behavior

## Files in This Example

- **`.ctx`** -- A sample `.ctx` file with entries that will become stale during
  a coding session.
- **`.ctxl/config.yaml`** -- Configuration showing auto-update policy settings.
- **`activity-log.yaml`** -- A sample activity log showing the events that
  ctxl records during a session.

## How Auto-Update Works

### The Staleness Lifecycle

```
                 Agent modifies            TaskCompleted
                 referenced file            hook fires
                      |                         |
  FRESH ------> STALE ------> PROPOSED ------> UPDATED
    ^                              |               |
    |                              v               |
    |                          REJECTED            |
    |                              |               |
    +------------------------------+---------------+
                   (manual re-verify)
```

### Step-by-Step Flow

1. **Session starts**: The SessionStart hook loads all `.ctx` entries and
   marks them as FRESH.

2. **Agent reads a file**: The PostToolUse hook logs a READ event for the
   file. If the file is referenced in a `.ctx` entry, the entry's status
   is noted.

3. **Agent modifies a file**: The PostToolUse hook detects that a file
   referenced in a `.ctx` entry has been modified. It marks the entry as
   STALE and logs a STALE event.

4. **Agent selects context**: When the agent requests context (via
   SessionStart or context_pack), stale entries receive a lower recency
   score (0.3 instead of 0.9). They are still included if their other
   scores are high enough, but with a staleness warning.

5. **Task completes**: The TaskCompleted hook fires. ctxl reviews all
   STALE entries and generates update proposals for each one. Depending
   on the policy:
   - `auto_update`: The proposal is applied immediately. The entry is
     marked as UPDATED and version is bumped.
   - `require_review`: The proposal is saved for human review. The entry
     remains STALE until the proposal is approved or rejected.

6. **Session ends**: The SessionEnd hook logs the final state of all entries
   and records any pending proposals.

### Activity Events

ctxl logs the following events during a session:

| Event    | Trigger                          | Data Recorded                    |
|----------|----------------------------------|----------------------------------|
| SELECT   | Context assembled for injection  | Entries selected, scores, budget |
| READ     | Agent reads a file               | File path, .ctx entry (if any)   |
| STALE    | Agent modifies a tracked file    | File path, entry, previous hash  |
| PROPOSE  | TaskCompleted generates proposal | Proposal ID, entry, diff         |
| UPDATE   | Proposal applied (auto or manual)| Entry, new version, new checksum |
| REJECT   | Proposal rejected by user        | Proposal ID, reason              |

## Try It Out

### Step 1: Start a session and observe staleness tracking

During a normal coding session with ctxl hooks enabled, the agent works
as usual. ctxl tracks file modifications in the background.

Example session log (from the daemon):

```
[09:00:01] SESSION_START sess_abc123 (agent: claude-code)
[09:00:02] SELECT 8 entries (1,840 / 4,000 tokens)
[09:02:15] READ src/auth/handler.ts (tracked in src/auth/.ctx key_files[0])
[09:05:30] READ src/auth/jwt-service.ts (tracked in src/auth/.ctx key_files[1])
[09:08:00] STALE src/auth/handler.ts modified (key_files[0] verified_at: def5678)
[09:12:00] STALE src/auth/jwt-service.ts modified (key_files[1] verified_at: def5678)
[09:15:00] READ src/auth/oauth.ts (not tracked -- new file)
[09:30:00] TASK_COMPLETED
[09:30:01] PROPOSE diff_015: update key_files[0].verified_at and .why
[09:30:02] PROPOSE diff_016: update key_files[1].verified_at
[09:30:03] PROPOSE diff_017: add key_files entry for src/auth/oauth.ts
```

### Step 2: Review the policy configuration

```yaml
# .ctxl/config.yaml
policies:
  auto_update:
    # Entries with these owners are auto-updated without review
    auto_owners: ["agent"]

    # Entries with these owners require human review
    review_owners: ["security", "infrastructure", "speckit"]

    # Default behavior for entries without an owner
    default: "require_review"   # options: auto_update, require_review

    # Locked entries are never auto-updated (regardless of owner)
    respect_locks: true

    # Maximum number of auto-updates per session
    max_auto_updates_per_session: 10
```

### Step 3: View pending proposals after task completion

With `require_review` policy:

```bash
ctxkit propose --pending
```

Expected output:

```
Pending Proposals (from session sess_abc123)
=============================================

diff_015: src/auth/.ctx key_files[0] (handler.ts)
  Reason: File modified during session
  Changes:
    - verified_at: "def5678" -> "eee9999"
    - why: "Auth handler." -> "Auth handler with OAuth callback endpoint."
  [a]pprove / [e]dit / [r]eject?

diff_016: src/auth/.ctx key_files[1] (jwt-service.ts)
  Reason: File modified during session
  Changes:
    - verified_at: "def5678" -> "eee9999"
  [a]pprove / [e]dit / [r]eject?

diff_017: src/auth/.ctx key_files (new entry)
  Reason: New tracked file detected
  Changes:
    + path: src/auth/oauth.ts
    + why: "OAuth2 provider integration (Google, GitHub)."
    + tags: [oauth, auth]
    + verified_at: "eee9999"
  [a]pprove / [e]dit / [r]eject?
```

### Step 4: View the activity log

```bash
ctxkit sessions show sess_abc123 --activity
```

Expected output:

```
Activity Log for sess_abc123
==============================

09:00:01  SELECT   8 entries selected (1,840 tokens)
09:02:15  READ     src/auth/handler.ts
09:05:30  READ     src/auth/jwt-service.ts
09:08:00  STALE    src/auth/handler.ts (key_files[0])
09:12:00  STALE    src/auth/jwt-service.ts (key_files[1])
09:15:00  READ     src/auth/oauth.ts (untracked)
09:30:00  PROPOSE  diff_015: update handler.ts entry
09:30:01  PROPOSE  diff_016: update jwt-service.ts entry
09:30:02  PROPOSE  diff_017: add oauth.ts entry
```

## Key Takeaways

- ctxl tracks file modifications during coding sessions and automatically
  marks `.ctx` entries as stale when their referenced files change.
- The TaskCompleted hook generates update proposals for stale entries,
  keeping context files fresh.
- Policies control whether updates are applied automatically
  (`auto_update`) or require human review (`require_review`).
- Locked entries and entries owned by security/infrastructure teams are
  never auto-updated, even with the `auto_update` policy.
- Activity events (SELECT, READ, STALE, PROPOSE, UPDATE) provide a full
  audit trail of how context was used and updated during a session.
