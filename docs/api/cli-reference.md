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
| `--json` | `false` | Output the Context Pack as a JSON object |

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

# Output as JSON (for piping to other tools)
ctxkit inject --request "fix the auth bug" --json
```

### JSON Output

When `--json` is passed, the command outputs a JSON Context Pack instead of the human-readable table. This is useful for piping into other tools or for programmatic consumption.

```json
{
  "version": 1,
  "items": [
    {
      "content": "login.ts: Handles user authentication flow",
      "source": "src/auth/.ctx",
      "section": "key_files",
      "entry_id": "login.ts",
      "score": 0.88,
      "tokens": 42,
      "reason_codes": ["LOCALITY_HIGH", "TAG_MATCH"]
    }
  ],
  "omitted": [
    {
      "content_preview": "Do not use console.log in production...",
      "source": ".ctx",
      "section": "gotchas",
      "score": 0.22,
      "tokens": 30,
      "reason": "BUDGET_EXCEEDED"
    }
  ],
  "total_tokens": 1842,
  "budget_tokens": 4000,
  "budget_used_pct": 46.1
}
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
| `--json` | `false` | Output proposal details as JSON |

### Examples

```bash
# Analyze a .ctx file
ctxkit propose .ctx

# Check for dead references
ctxkit propose src/auth/.ctx --check-files

# Output as JSON
ctxkit propose .ctx --json
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

### JSON Output

When `--json` is passed, the command outputs a JSON object with the proposal summary:

```json
{
  "path": "src/auth/.ctx",
  "version": 1,
  "summary": "Auth module context descriptor",
  "counts": {
    "key_files": 5,
    "contracts": 2,
    "decisions": 3,
    "gotchas": 1,
    "refs": 2
  },
  "tags": ["typescript", "auth"]
}
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
| `--json` | `false` | Output session data as JSON (applies to both `list` and `show`) |

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
ctxkit sessions show <id> [--json]
```

Displays full session details including the request timeline. When `--json` is passed, outputs the session object as JSON.

### Examples

```bash
# List all sessions
ctxkit sessions

# List only active sessions
ctxkit sessions --status active

# Show session details
ctxkit sessions show sess_abc123

# List sessions as JSON
ctxkit sessions --json

# Show session details as JSON
ctxkit sessions show sess_abc123 --json
```

### JSON Output

When `--json` is passed to `sessions list`:

```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "agent_id": "claude",
      "status": "active",
      "request_count": 3,
      "started_at": "2026-03-01T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

When `--json` is passed to `sessions show`:

```json
{
  "id": "sess_abc123",
  "repo_path": "/path/to/repo",
  "working_dir": "/path/to/repo/src/auth",
  "branch": "main",
  "agent_id": "claude",
  "status": "active",
  "started_at": "2026-03-01T10:30:00.000Z",
  "ended_at": null,
  "events": [
    {
      "id": "evt_001",
      "request_text": "fix the auth bug",
      "token_count": 1842,
      "budget": 4000,
      "created_at": "2026-03-01T10:30:15.000Z"
    }
  ]
}
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

## `ctxkit codex`

Commands for generating agent-oriented project files from `.ctx` metadata.

### `ctxkit codex sync-agents`

Generate or update an `AGENTS.md` file from the `.ctx` hierarchy. The generated file provides a structured summary of the project for coding agents (e.g., Claude, Copilot) that consume `AGENTS.md` for workspace awareness.

```bash
ctxkit codex sync-agents [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--repo-root <path>` | (auto-detected) | Path to the repository root. If omitted, walks up from the current directory to find the nearest `.git` directory. |
| `--budget <tokens>` | `8000` | Token budget for the generated content. Controls how much detail is included in the output. |
| `--dry-run` | `false` | Show what would be written to `AGENTS.md` without actually writing the file. |

### Behavior

The command walks the `.ctx` hierarchy starting from the repository root, collects summaries, key files, contracts, decisions, gotchas, and tags, then renders them into an `AGENTS.md` file at the repository root.

**Marker protocol:** The generated content is wrapped in markers to support idempotent updates:

```markdown
<!-- CTXKIT:BEGIN -->
(generated content here)
<!-- CTXKIT:END -->
```

On subsequent runs, only the content between the `CTXKIT:BEGIN` and `CTXKIT:END` markers is replaced. Any content outside the markers (added manually by the user) is preserved. This allows teams to maintain hand-written sections alongside the auto-generated content.

**Idempotency:** Running `sync-agents` multiple times produces the same result as long as the `.ctx` files have not changed. The command is safe to include in CI pipelines or git hooks.

**Token budgeting:** The `--budget` flag controls how much content is included. When the total content from all `.ctx` files exceeds the budget, lower-priority sections (e.g., gotchas, decisions with low relevance) are trimmed first. Summaries and contracts are prioritized.

### Examples

```bash
# Generate AGENTS.md from the current repo
ctxkit codex sync-agents

# Preview without writing
ctxkit codex sync-agents --dry-run

# Specify a custom repo root and budget
ctxkit codex sync-agents --repo-root /path/to/repo --budget 12000

# Use in a CI pipeline
ctxkit codex sync-agents && git diff --exit-code AGENTS.md
```

### Output

```
Scanning .ctx files from /path/to/repo...
  Found 8 .ctx files across 4 packages

Generated AGENTS.md (6240 / 8000 tokens)
  Sections: 8 summaries, 12 key files, 4 contracts, 3 decisions, 2 gotchas
  Path: /path/to/repo/AGENTS.md
```

### Dry Run Output

When `--dry-run` is passed, the command prints the content that would be written and exits without modifying any files:

```
[dry-run] Would write AGENTS.md to /path/to/repo/AGENTS.md (6240 tokens)

<!-- CTXKIT:BEGIN -->
# Project Context

## src/auth
Auth module handling login, registration, and token refresh.
...
<!-- CTXKIT:END -->
```

---

## `ctxkit index`

Manage the `.ctxl` index file that catalogs all `.ctx` files in the repository.

### `ctxkit index generate`

Generate or regenerate the `.ctxl` index from all `.ctx` files.

```bash
ctxkit index generate [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--repo-root <path>` | (auto-detected) | Repository root path |

```bash
# Generate the index
ctxkit index generate

# Specify a repo root
ctxkit index generate --repo-root /path/to/repo
```

### `ctxkit index show`

Display the current index contents.

```bash
ctxkit index show [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--json` | `false` | Output as JSON |

### `ctxkit index select`

Select `.ctx` files matching criteria.

```bash
ctxkit index select [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--tags <tags>` | (none) | Comma-separated tags to match |
| `--path <prefix>` | (none) | Path prefix filter |
| `--budget <tokens>` | (none) | Maximum token budget |
| `--json` | `false` | Output as JSON |

### Examples

```bash
# Generate the index
ctxkit index generate

# Show all indexed .ctx files
ctxkit index show

# Select by tags
ctxkit index select --tags auth,security

# Select with budget constraint
ctxkit index select --tags auth --budget 2000 --json
```

---

## `ctxkit history`

View the version history for a `.ctx` file.

```bash
ctxkit history [path] [options]
```

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `.` | Path to `.ctx` file or directory containing one |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--all` | `false` | Include archived entries (not just inline) |
| `--diff <range>` | (none) | Show diffs between versions (e.g., `1..5`) |
| `--count` | `false` | Show only the total number of versions |
| `--json` | `false` | Output as JSON |

### Examples

```bash
# Show recent history
ctxkit history src/auth/.ctx

# Show full history including archived entries
ctxkit history src/auth/.ctx --all

# Compare two versions
ctxkit history src/auth/.ctx --diff 1..5

# Count total versions
ctxkit history src/auth/.ctx --count

# Output as JSON
ctxkit history src/auth/.ctx --json
```

### Output

```
src/auth/.ctx (ctx_version: 7)

Version  Timestamp                  Author              Reason
---------------------------------------------------------------------------
7        2026-03-15T10:30:00.000Z   claude:sess_abc123  Added new key_file for refactored handler
6        2026-03-14T15:00:00.000Z   human               Manual contract update
5        2026-03-14T09:00:00.000Z   auto-update         Updated tags after dependency change
...

Showing 7 of 7 entries (inline)
```

---

## `ctxkit conflicts`

Manage multi-agent conflicts in `.ctx` files.

### `ctxkit conflicts list`

List all `.ctx` files with unresolved conflicts.

```bash
ctxkit conflicts list [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--json` | `false` | Output as JSON |

### `ctxkit conflicts resolve`

Resolve conflicts by picking a side.

```bash
ctxkit conflicts resolve <ctx-path> [options]
```

| Argument | Description |
|----------|-------------|
| `ctx-path` | Path to the `.ctx` file with conflicts |

| Option | Default | Description |
|--------|---------|-------------|
| `--pick <side>` | (required) | Side to pick: `ours` or `theirs` |

### Examples

```bash
# List all conflicts
ctxkit conflicts list

# Resolve by picking "ours"
ctxkit conflicts resolve src/auth/.ctx --pick ours

# Resolve by picking "theirs"
ctxkit conflicts resolve src/auth/.ctx --pick theirs

# List conflicts as JSON
ctxkit conflicts list --json
```

### Output

```
Resolved 1 conflict(s) in src/auth/.ctx
  summary: picked ours ("Auth module handling login and registration")
  ctx_version bumped to 8
```

---

## `ctxkit bootstrap`

Analyze a repository and generate `.ctx` files automatically.

```bash
ctxkit bootstrap [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | `false` | Preview without writing files |
| `--mode <mode>` | `quick` | Analysis depth: `quick` or `full` |
| `--skip-existing` | `false` | Do not overwrite existing `.ctx` files |
| `--min-files <n>` | `3` | Minimum source files to generate a `.ctx` for a directory |

### Examples

```bash
# Bootstrap with dry-run preview
ctxkit bootstrap --dry-run

# Full analysis mode
ctxkit bootstrap --mode full

# Skip existing .ctx files
ctxkit bootstrap --skip-existing

# Only generate for directories with 5+ files
ctxkit bootstrap --min-files 5
```

### Output

```
Analyzing /path/to/repo...
  Scanning 42 directories...
  Found 8 directories with sufficient content

Proposals:
  .ctx                 summary, 5 key_files, 3 commands, 4 tags
  src/auth/.ctx        summary, 3 key_files, 2 contracts, 3 tags
  src/db/.ctx          summary, 4 key_files, 1 contract, 2 tags
  ...

Applied 8 .ctx files
Generated .ctxl index (8 entries)
```

---

## `ctxkit migrate`

Migrate v1 `.ctx` files to v2 format.

```bash
ctxkit migrate [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | `false` | Preview without writing files |

### Behavior

1. Scans for `.ctx` files with `version: 1`
2. Adds `version: 2`, `ctx_version: 1`, `_history`, and checksum fields
3. Generates the `.ctxl` index file
4. Idempotent: running again produces no changes

### Examples

```bash
# Preview migration
ctxkit migrate --dry-run

# Apply migration
ctxkit migrate
```

### Output

```
Scanning for v1 .ctx files...
  Found 12 .ctx files

Migrating...
  .ctx                   migrated (checksum: a1b2c3d4)
  src/auth/.ctx          migrated (checksum: f6e5d4c3)
  ...

Migrated 12 .ctx files to v2
Generated .ctxl index (12 entries)
```

---

## `ctxkit speckit`

Commands for integrating with Spec-Kit specification documents.

### `ctxkit speckit import`

Import Spec-Kit documents into `.ctx` files.

```bash
ctxkit speckit import [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--source <path>` | (required) | Path to Spec-Kit document or directory |
| `--dry-run` | `false` | Preview without writing |
| `--target <dir>` | (auto-detected) | Target directory for generated `.ctx` files |

### `ctxkit speckit export`

Export `.ctx` files to Spec-Kit format.

```bash
ctxkit speckit export [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--format <fmt>` | `yaml` | Output format: `yaml` or `md` |
| `--output <dir>` | `specs/` | Output directory |
| `--filter <path>` | (all) | Only export `.ctx` files matching this path prefix |

### `ctxkit speckit validate`

Validate `.ctx` files against a constitution document.

```bash
ctxkit speckit validate [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--constitution <path>` | (required) | Path to the constitution document |
| `--strict` | `false` | Treat SHOULD violations as errors |

### `ctxkit speckit sync`

Bidirectional sync between `.ctx` files and Spec-Kit documents.

```bash
ctxkit speckit sync [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--source <path>` | (required) | Path to Spec-Kit documents directory |
| `--direction <dir>` | `both` | Sync direction: `spec-to-ctx`, `ctx-to-spec`, or `both` |
| `--pick <side>` | (none) | Resolve conflicts: `spec` or `ctx` |
| `--dry-run` | `false` | Preview without writing |

### Examples

```bash
# Import a constitution
ctxkit speckit import --source constitution.yaml

# Export as markdown
ctxkit speckit export --format md --output docs/specs/

# Validate against constitution
ctxkit speckit validate --constitution constitution.yaml

# Bidirectional sync
ctxkit speckit sync --source specs/ --direction both
```

---

## `ctxkit pr`

Generate a pull request description from session data.

```bash
ctxkit pr [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--branch <name>` | Current branch | Branch to generate context for |
| `--session <id>` | (auto-detected) | Specific session ID to use |
| `--format <fmt>` | `md` | Output format: `md`, `json`, or `gh` |
| `--gh` | `false` | Shorthand for `--format gh` (GitHub PR body format) |

### Examples

```bash
# Generate markdown PR description
ctxkit pr --branch feature/auth-refactor

# Generate JSON output
ctxkit pr --format json

# Generate GitHub PR body and create PR
ctxkit pr --gh | gh pr create --title "Add MFA support" --body-file -

# Use a specific session
ctxkit pr --session sess_abc123 --format md
```

### Output

The output varies by format. See the [PR Context guide](/guide/pr-context) for full examples of each format.

---

## `ctxkit hooks`

Display information about installed hooks.

```bash
ctxkit hooks [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--list` | `false` | List all available hooks and their status |

### Examples

```bash
# List all hooks
ctxkit hooks --list

# Output
Hook                  Status      Description
---------------------------------------------------------------------------
SessionStart          active      Inject context at session start
UserPromptSubmit      active      Log user prompts
PreToolUse            active      Validate tool inputs
PostToolUse           active      Track file modifications
PostToolUseFailure    active      Log tool failures
TaskCompleted         active      Generate auto-update proposals
PreCompact            active      Compact context memory
SessionEnd            active      Finalize session data
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (validation failure, drift detected, connection error, etc.) |
