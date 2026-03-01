# CLI Reference

The `ctxkit` command-line tool provides access to all ctxl functionality. This page documents every command, subcommand, option, and flag.

## Global Usage

```bash
ctxkit [command] [options]
```

### Global Options

| Option | Description |
|--------|-------------|
| `-V, --version` | Output the version number |
| `-h, --help` | Display help for the command |

---

## `ctxkit init`

Initialize a `.ctx` file by scanning directory metadata.

```bash
ctxkit init [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dir <path>` | Current directory | Target directory to initialize |
| `--force` | `false` | Overwrite existing `.ctx` file |

### Behavior

Scans the target directory for:
- `package.json` -- extracts description (as summary), scripts (as commands), keywords (as tags), and detects tech stack from dependencies (typescript, react, vue, api, testing)
- `tsconfig.json` -- adds as a key file, tags with `typescript`
- `README.md` / `README` / `readme.md` -- extracts first content line as summary
- Entry points -- detects `src/index.ts`, `src/main.ts`, `src/app.ts`, and similar files

### Examples

```bash
# Initialize in current directory
ctxkit init

# Initialize in a specific directory
ctxkit init --dir packages/core

# Overwrite existing .ctx
ctxkit init --force
```

### Output

```
Created .ctx at /path/to/project/.ctx
  Summary: Context & Memory Manager for coding agents
  Key files: 3
  Commands: 8
  Tags: typescript, testing
```

---

## `ctxkit validate`

Validate a `.ctx` file for structural correctness.

```bash
ctxkit validate [path] [options]
```

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `.` | Path to `.ctx` file or directory containing one |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--check-files` | `false` | Verify that referenced files exist on disk |

### Validation Checks

**Errors** (cause exit code 1):
- Unknown version number
- Empty or missing `summary`
- Missing key file `path`
- Duplicate key file paths
- Missing contract `name`
- Duplicate contract names
- Missing decision `id`
- Duplicate decision IDs
- Missing ref `target`

**Warnings:**
- Missing key file `purpose`
- Empty contract `content`
- Contract with no scope (no paths AND no tags)
- Missing decision `title`
- Ref with no `sections` specified
- Referenced file does not exist (with `--check-files`)

### Examples

```bash
# Validate .ctx in current directory
ctxkit validate

# Validate a specific .ctx file
ctxkit validate src/auth/.ctx

# Validate with file existence checks
ctxkit validate --check-files

# Validate a specific directory
ctxkit validate packages/core
```

---

## `ctxkit inject`

Build and display a Context Pack for a request.

```bash
ctxkit inject [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--request <text>` | (required) | The request text to build context for |
| `--cwd <path>` | Current directory | Working directory for context resolution |
| `--budget <tokens>` | `4000` | Token budget |
| `--preview` | `false` | Preview mode (no event recorded) |

### Output Format

```
Context Pack (1842 / 4000 tokens)
----------------------------------------

Included (5 items):
  1. [LOCALITY_HIGH, TAG_MATCH]  .ctx -> contracts/auth-api (320 tok)
  2. [CONTRACT_REQUIRED]         .ctx -> contracts/security (280 tok)
  3. [LOCALITY_HIGH]             .ctx -> key_files/login.ts (150 tok)
  4. [TAG_MATCH]                 .ctx -> decisions/ADR-003 (210 tok)
  5. [LOCALITY_HIGH]             .ctx -> summary (180 tok)

Omitted (2 items):
  - .ctx -> gotchas (score: 0.22, reason: BUDGET_EXCEEDED)
  - .ctx -> key_files/db.ts (score: 0.18, reason: LOW_SCORE)

Deep Read: Confidence sufficient, no deep-read needed
```

### Examples

```bash
# Basic context injection preview
ctxkit inject --request "fix the auth bug in login handler"

# With a specific working directory
ctxkit inject --request "fix the database query" --cwd src/db

# With a larger budget
ctxkit inject --request "refactor the API layer" --budget 8000
```

---

## `ctxkit propose`

Generate a `.ctx` update proposal showing what would change.

```bash
ctxkit propose <ctx-path> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `ctx-path` | Path to the `.ctx` file to analyze |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--check-files` | `false` | Check for dead file references |
| `--daemon <url>` | `http://localhost:3742` | Daemon URL to submit the proposal |

### Examples

```bash
# Analyze a .ctx file
ctxkit propose .ctx

# Check for dead references
ctxkit propose src/auth/.ctx --check-files
```

### Output

```
Analyzing /path/to/src/auth/.ctx...

  Dead reference: key_files/old-file.ts
    File not found at /path/to/src/auth/old-file.ts

  Found 1 dead reference(s)

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

---

## `ctxkit apply`

Approve and apply a `.ctx` update proposal by ID.

```bash
ctxkit apply <proposal-id> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `proposal-id` | The proposal ID to approve and apply |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--daemon <url>` | `http://localhost:3742` | Daemon URL |
| `--reject` | `false` | Reject the proposal instead of approving |

### Behavior

1. Sends `PATCH /api/v1/proposals/:id` with `status: "approved"` (or `"rejected"`)
2. If approving, sends `POST /api/v1/proposals/:id/apply` to write the change
3. Reports the audit entry ID on success

### Examples

```bash
# Approve and apply a proposal
ctxkit apply prop_abc123

# Reject a proposal
ctxkit apply prop_abc123 --reject
```

---

## `ctxkit sessions`

List and inspect agent sessions.

```bash
ctxkit sessions [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--daemon <url>` | `http://localhost:3742` | Daemon URL |
| `--status <status>` | (all) | Filter by status (`active` or `completed`) |
| `--limit <n>` | `20` | Maximum results |

### Output

```
ID               Agent      Status       Requests   Started
------------------------------------------------------------------------
sess_abc123      claude     active       3          2026-03-01T10:30:00Z
sess_def456      copilot    completed    7          2026-03-01T09:15:00Z

Total: 2
```

### Subcommand: `sessions show`

```bash
ctxkit sessions show <id>
```

Displays full session details including the request timeline.

### Examples

```bash
# List all sessions
ctxkit sessions

# List only active sessions
ctxkit sessions --status active

# Show session details
ctxkit sessions show sess_abc123
```

---

## `ctxkit drift`

Check `.ctx` files for stale references and drift.

```bash
ctxkit drift [path]
```

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `.` | Path to `.ctx` file or repo root to scan all |

### Behavior

- If `path` points to a `.ctx` file: checks that single file
- If `path` points to a directory: finds all `.ctx` files in the repository and checks each one
- Exits with code 1 if any drift is detected

### Examples

```bash
# Scan all .ctx files in the repo
ctxkit drift

# Check a specific .ctx file
ctxkit drift src/auth/.ctx

# Check from a specific directory
ctxkit drift packages/core
```

### Output (no drift)

```
All 5 .ctx file(s) are up to date.
```

### Output (drift detected)

```
src/auth/.ctx -- 2 stale entry/entries:
  key_files/login.ts
    Reason: file_deleted
    Details: File src/auth/login.ts no longer exists
    Verified at: abc1234
  contracts/auth-api
    Reason: commit_unknown
    Details: Cannot verify commit xyz9999 for auth-api

Total: 2 stale entry/entries across 5 .ctx file(s)
```

---

## `ctxkit daemon`

Manage the ctxl daemon.

### `ctxkit daemon start`

Start the daemon in the background.

```bash
ctxkit daemon start [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port <port>` | `3742` | Port to listen on |

The daemon:
- Runs on `127.0.0.1` (localhost only)
- Stores its PID at `~/.ctxl/daemon.pid`
- Logs to `~/.ctxl/daemon.log`
- Uses SQLite at `~/.ctxl/data.db` (default path)

```
Daemon started (PID 12345) on port 3742
Logs: ~/.ctxl/daemon.log
Dashboard: http://localhost:3742
```

### `ctxkit daemon stop`

Stop the running daemon.

```bash
ctxkit daemon stop
```

Sends `SIGTERM` to the daemon process and removes the PID file.

### `ctxkit daemon status`

Check daemon status.

```bash
ctxkit daemon status [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--daemon <url>` | `http://localhost:3742` | Daemon URL to check |

Queries the `/api/v1/health` endpoint:

```
Status: ok
Version: 0.1.0
Uptime: 42 minutes
```

---

## `ctxkit dashboard`

Open the inspection dashboard in a browser.

```bash
ctxkit dashboard [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port <port>` | `3742` | Dashboard port |

Opens `http://localhost:<port>` in your default browser using the system's `open` command (macOS), `xdg-open` (Linux), or `start` (Windows).

---

## `ctxkit run`

Wrap an agent command with context injection.

```bash
ctxkit run [options] <cmd...>
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--daemon <url>` | `http://localhost:3742` | Daemon URL for session tracking |
| `--cwd <path>` | Current directory | Working directory |
| `--budget <tokens>` | `4000` | Token budget |
| `--agent <id>` | `default` | Agent identifier |
| `--request <text>` | `""` | Initial request text |

### Environment Variables Injected

| Variable | Description |
|----------|-------------|
| `CTXL_CONTEXT_PACK` | Full Context Pack as JSON |
| `CTXL_SESSION_ID` | Session ID (empty if daemon unavailable) |
| `CTXL_DAEMON_URL` | Daemon URL |
| `CTXL_TOKENS_USED` | Tokens in the pack |
| `CTXL_TOKENS_BUDGET` | Token budget |

### Examples

```bash
# Wrap an agent with default settings
ctxkit run -- my-agent-command

# With specific agent and budget
ctxkit run --agent claude --budget 8000 -- claude-code "fix the auth bug"

# With a specific request
ctxkit run --request "refactor the database layer" -- python agent.py

# With a custom daemon URL
ctxkit run --daemon http://localhost:8080 -- npm run agent
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (validation failure, drift detected, connection error, etc.) |
