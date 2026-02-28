# Quickstart: Context & Memory Manager

**Branch**: `001-context-memory-manager` | **Date**: 2026-02-28

This guide walks through the MVP demo scenario from SC-010:
start the system, initialize .ctx, issue a request, inspect
the Context Pack, trigger an update proposal, approve it, and
verify it in the audit log.

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- Git repository to work in

## 1. Install & Build

```bash
git clone <repo-url> && cd ctxl
pnpm install
pnpm build
```

## 2. Initialize .ctx in a Repository

```bash
cd /path/to/your/repo
ctxkit init
```

This creates a `.ctx` file at the repo root pre-populated from
available metadata (README, package.json, etc.):

```yaml
version: 1
summary: |
  A Node.js web application for managing user accounts.
  Uses Express + PostgreSQL. Tested with Jest.
key_files:
  - path: src/index.ts
    purpose: Application entry point
    tags: [entry]
    verified_at: "a1b2c3d"
    locked: false
commands:
  build: npm run build
  test: npm test
  dev: npm run dev
tags: [nodejs, express, postgresql]
```

Optionally create subdirectory `.ctx` files:

```bash
ctxkit init src/auth
```

## 3. Start the Daemon

```bash
ctxkit daemon start
# Daemon listening on http://localhost:3742
```

The daemon runs in the background. It stores session data in
`~/.ctxl/data/ctxl.db` (SQLite).

## 4. Preview a Context Pack

```bash
ctxkit inject --preview \
  --request "fix the auth bug in login handler" \
  --cwd /path/to/your/repo/src/auth \
  --budget 4000
```

Output:

```
Context Pack (2,340 / 4,000 tokens)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Included (5 items):
  1. [CONTRACT_REQUIRED] src/auth/.ctx → contracts/Auth API Contract (120 tok)
  2. [LOCALITY_HIGH]     src/auth/.ctx → key_files/handler.ts (45 tok)
  3. [TAG_MATCH]         src/auth/.ctx → gotchas/0 (80 tok)
  4. [LOCALITY_HIGH]     src/.ctx → key_files/auth/ (30 tok)
  5. [PINNED]            .ctx → decisions/adr-001 (95 tok)

Omitted (2 items):
  - .ctx → gotchas/0 (score: 0.22, reason: BUDGET_OK but LOW_SCORE)
  - .ctx → key_files/scripts/ (score: 0.15, reason: LOW_SCORE)
```

## 5. Wrap an Agent and Issue a Request

```bash
ctxkit run -- your-agent-command "fix the auth bug"
```

This:
1. Creates a session in the daemon.
2. Builds a Context Pack and injects it into the agent's input.
3. Records the request event with full attribution.
4. When the agent finishes, ends the session.

## 6. Inspect the Session

```bash
ctxkit sessions
# ID           AGENT   STATUS   REQUESTS  STARTED
# sess_abc123  claude  active   1         2026-02-28 10:01

ctxkit sessions show sess_abc123
# Shows per-request timeline with context, tokens, reasons
```

## 7. Trigger a .ctx Update Proposal

After making code changes (e.g., renaming `loginHandler` to
`signInHandler`), check for drift:

```bash
ctxkit drift src/auth/.ctx
# STALE: key_files/src/auth/login.ts
#   Reason: file_renamed → src/auth/sign-in.ts
#   Verified at: abc1234 (3 commits behind)
```

The system proposes an update:

```bash
ctxkit propose src/auth/.ctx
# Proposal diff_001:
# --- a/src/auth/.ctx
# +++ b/src/auth/.ctx
# @@ key_files @@
# -  - path: src/auth/login.ts
# +  - path: src/auth/sign-in.ts
#
# Provenance: file renamed in commit def4567
# [a]pprove / [e]dit / [r]eject?
```

## 8. Approve and Apply

```bash
# Approve interactively (from the propose command above)
> a

# Or approve via CLI:
ctxkit apply diff_001
# Applied diff_001 to src/auth/.ctx
# Audit log entry: aud_001
```

## 9. Verify in the Dashboard

```bash
ctxkit dashboard
# Opens http://localhost:3742 in your browser
```

In the dashboard:
1. Click on session `sess_abc123` to see the timeline.
2. Click on the request to see the full Context Pack.
3. Navigate to Audit Log to see the applied change.
4. Open the .ctx Editor to browse and edit entries.

## 10. Validate

```bash
ctxkit validate
# Checking .ctx ...
# Checking src/auth/.ctx ...
# All .ctx files valid. 0 errors, 0 warnings.
```

---

## E2E Test Scenarios (from spec)

These three scenarios are implemented as integration tests:

1. **Single .ctx**: Root .ctx only → verify injection selects
   correct subset for a request within budget.

2. **Hierarchical merge**: Nested .ctx files → verify merge +
   scoring picks the right items with correct precedence.

3. **Drift detection**: Modify code so .ctx is stale → verify
   drift detection → proposal → approval → audit log.

Run all:
```bash
pnpm test:e2e
```
