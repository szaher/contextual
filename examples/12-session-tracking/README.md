# Example 12: Session Tracking

## What This Demonstrates

How ctxl tracks agent sessions from start to finish, recording every
request, the context injected, tool calls, and any `.ctx` update proposals
generated. Sessions are the observability layer that makes the system
transparent and debuggable.

## Session Lifecycle

```
                 ctxkit daemon start
                        |
                        v
          ctxkit run -- agent "request"
                        |
                        v
                  Session Created
                  (status: active)
                        |
                        v
                  Context Pack Built
                  Request Event Recorded
                        |
                        v
                  Agent Runs...
                  (tool calls recorded)
                        |
                        v
                  Agent Completes
                  (proposals generated if applicable)
                        |
                        v
                  Session Ended
                  (status: completed)
                        |
                        v
                  Data Available for
                  Inspection (CLI + Dashboard)
```

## Starting the Daemon

The daemon is required for session tracking. It runs as a background
service on your machine:

```bash
ctxkit daemon start
```

Output:

```
ctxl daemon started
  PID: 12345
  API: http://localhost:3742
  Database: ~/.ctxl/data/ctxl.db
  Log: ~/.ctxl/data/daemon.log
```

### Daemon Management

```bash
# Check daemon status
ctxkit daemon status
# Output: ctxl daemon is running (PID: 12345, uptime: 2h 15m)

# Stop the daemon
ctxkit daemon stop
# Output: ctxl daemon stopped

# Restart the daemon
ctxkit daemon restart

# View daemon logs
ctxkit daemon logs
ctxkit daemon logs --tail 50
```

## Session Commands

### List sessions

```bash
ctxkit sessions
```

Output:

```
Active Sessions:
  ID           AGENT    REQUESTS  STARTED              CWD
  sess_a1b2    claude   3         2026-03-01 10:15    /repo/src/auth

Recent Sessions (last 7 days):
  ID           AGENT    REQUESTS  STARTED              ENDED                CWD
  sess_c3d4    claude   5         2026-02-28 14:30    2026-02-28 15:45    /repo/src/api
  sess_e5f6    aider    2         2026-02-28 11:00    2026-02-28 11:30    /repo
  sess_g7h8    claude   1         2026-02-27 09:15    2026-02-27 09:20    /repo/src
```

### Filter sessions

```bash
# Filter by agent
ctxkit sessions --agent claude

# Filter by date range
ctxkit sessions --since 2026-02-28 --until 2026-03-01

# Filter by repository
ctxkit sessions --repo /path/to/repo

# Filter by status
ctxkit sessions --status active
```

### Inspect a session

```bash
ctxkit sessions show sess_a1b2
```

Output:

```
Session: sess_a1b2
========================================
Agent: claude
Status: active
Repository: /path/to/repo
Working directory: /path/to/repo/src/auth
Branch: feature/fix-login
Started: 2026-03-01 10:15:00 UTC

Timeline:
---------

[10:15:00] REQUEST #1
  Text: "fix the auth bug in the login handler"
  Context Pack: 2,340 / 4,000 tokens
  Included:
    1. [CONTRACT_REQUIRED] src/auth/.ctx -> auth-security (280 tok)
    2. [LOCALITY_HIGH]     src/auth/.ctx -> key_files/handler.ts (45 tok)
    3. [TAG_MATCH]         src/auth/.ctx -> gotchas/0 (80 tok)
  Omitted:
    - .ctx -> gotchas/0 (score: 0.22)

[10:16:30] REQUEST #2
  Text: "also fix the token refresh endpoint"
  Context Pack: 2,580 / 4,000 tokens
  Included:
    1. [CONTRACT_REQUIRED] src/auth/.ctx -> auth-security (280 tok)
    2. [LOCALITY_HIGH]     src/auth/.ctx -> key_files/handler.ts (45 tok)
    3. [TAG_MATCH]         src/auth/.ctx -> key_files/refresh.ts (50 tok)
    4. [RECENT_EDIT]       src/auth/.ctx -> gotchas/1 (65 tok)
  Omitted:
    - .ctx -> decisions/d003 (score: 0.18)

[10:18:00] REQUEST #3
  Text: "run the auth tests"
  Context Pack: 890 / 4,000 tokens
  Included:
    1. [LOCALITY_HIGH] src/auth/.ctx -> commands/test (45 tok)
    2. [LOCALITY_HIGH] .ctx -> commands/test (40 tok)
  Deep Read Decision:
    Trigger: user intent = "run tests"
    Rationale: Low complexity request, .ctx commands sufficient
    Files NOT read directly (confidence: high)

Proposals Generated: 1
  prop_001: Update key_files/handler.ts verified_at (pending)
```

### Inspect a specific request event

```bash
ctxkit sessions show sess_a1b2 --event 1
```

Output:

```
Request Event #1
================
Session: sess_a1b2
Timestamp: 2026-03-01 10:15:00 UTC
Request: "fix the auth bug in the login handler"

Context Pack Details:
  Total tokens: 2,340 / 4,000 budget
  Items: 3 included, 2 omitted

  #1 [CONTRACT_REQUIRED] (score: 0.98)
     Source: src/auth/.ctx -> contracts/auth-security-requirements
     Tokens: 280
     Matched by: path scope (src/auth/*)
     Content preview:
       All auth endpoints MUST validate JWT tokens.
       Never store raw passwords; use bcrypt with cost 12...

  #2 [LOCALITY_HIGH] (score: 0.85)
     Source: src/auth/.ctx -> key_files/handler.ts
     Tokens: 45
     Scored by: locality=1.0 (same dir), tags=0.8 (auth match)
     Content preview:
       Main authentication request handler...

  #3 [TAG_MATCH] (score: 0.72)
     Source: src/auth/.ctx -> gotchas/0
     Tokens: 80
     Scored by: tags=1.0 (auth exact match), locality=0.8
     Content preview:
       The auth middleware silently swallows errors...

  OMITTED #1 (score: 0.22)
     Source: .ctx -> gotchas/0
     Tokens: 65
     Reason: LOW_SCORE (below cutoff 0.40)

  OMITTED #2 (score: 0.15)
     Source: .ctx -> key_files/scripts/
     Tokens: 30
     Reason: LOW_SCORE (below cutoff 0.40)
```

## Audit Log

The audit log tracks all `.ctx` changes with full attribution:

```bash
ctxkit audit
```

Output:

```
AUDIT LOG (last 30 days)
========================

aud_005  2026-03-01 10:20  APPLIED   prop_001
  File: src/auth/.ctx
  Section: key_files
  Change: updated verified_at for handler.ts
  Initiated by: session sess_a1b2 (agent: claude)
  Reason: file modified since last verification

aud_004  2026-02-28 15:45  APPLIED   prop_000
  File: .ctx
  Section: commands
  Change: updated build command
  Initiated by: user (manual edit)
  Reason: build system changed from webpack to vite

aud_003  2026-02-28 14:30  REJECTED  prop_003
  File: .ctx
  Section: decisions
  Change: proposed adding decision d004
  Initiated by: session sess_c3d4 (agent: claude)
  Reason: rejected by user -- decision not finalized yet
```

### Filter the audit log

```bash
# Filter by file
ctxkit audit --file src/auth/.ctx

# Filter by date range
ctxkit audit --since 2026-02-28

# Filter by change type
ctxkit audit --type applied

# Filter by initiator
ctxkit audit --by sess_a1b2
```

## Deep Read Decisions

When ctxl bypasses `.ctx` and reads files directly, the decision is
recorded in the session timeline:

```bash
ctxkit sessions show sess_a1b2 --event 3
```

```
Deep Read Decision:
  Trigger: low_confidence
  Rationale: Symbol "AuthService" referenced in request but not found
             in any .ctx entry. Reading src/auth/ directly.
  Files read:
    - src/auth/service.ts (120 lines)
    - src/auth/types.ts (45 lines)
  Tokens consumed: 850
```

Deep reads happen when:
- A symbol mentioned in the request is not in any `.ctx` file
- `.ctx` entries are too stale to trust
- The request implies deep analysis ("debug", "refactor", "investigate")
- Tests are failing and the agent needs current code

## Data Storage

Session data is stored in a local SQLite database:

```
~/.ctxl/data/ctxl.db
```

The database contains:
- `sessions`: Session metadata (agent, status, timestamps)
- `request_events`: Per-request data (text, context pack, tokens)
- `memory_diffs`: Proposed `.ctx` changes
- `audit_log`: Applied changes with attribution

### Retention

By default:
- Session data is purged after 30 days
- Audit log entries are purged after 90 days
- Both are configurable in `.ctxl/config.yaml`

```yaml
retention:
  sessions_days: 30
  audit_days: 90
```

## Dashboard Integration

All session data is available in the web dashboard:

```bash
ctxkit dashboard
# Opens http://localhost:3742 in your browser
```

The dashboard provides:
- Session list with filtering and search
- Per-request timeline with context visualization
- Token usage charts
- Audit log browser with diff viewer
- `.ctx` editor with live preview

## Best Practices

- **Keep the daemon running**: Start the daemon when you begin work
  and let it run. Session data accumulates and becomes more valuable
  over time.

- **Review sessions after complex tasks**: Use the session inspector
  to understand what context the agent received. If the agent made
  mistakes, check whether the right context was injected.

- **Use the audit log for team visibility**: The audit log shows who
  (or what) changed `.ctx` files and why. Share it with your team to
  build trust in the system.

- **Monitor deep read frequency**: If deep reads happen frequently,
  your `.ctx` files may be incomplete or stale. Add more entries or
  run drift detection to improve coverage.

- **Adjust retention for your needs**: 30-day session retention is a
  good default. Increase it if you need longer historical data for
  debugging or analysis.
