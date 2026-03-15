# ctxl

**Local-first context memory for AI coding agents**

[![CI](https://github.com/szaher/contextual/actions/workflows/ci.yml/badge.svg)](https://github.com/szaher/contextual/actions/workflows/ci.yml)
[![Security Audit](https://github.com/szaher/contextual/actions/workflows/security.yml/badge.svg)](https://github.com/szaher/contextual/actions/workflows/security.yml)
[![npm version](https://img.shields.io/npm/v/@ctxkit/cli.svg)](https://www.npmjs.com/package/@ctxkit/cli)
[![@ctxkit/core](https://img.shields.io/npm/v/@ctxkit/core.svg?label=@ctxkit/core)](https://www.npmjs.com/package/@ctxkit/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

---

## Overview

ctxl (pronounced "contextual") gives AI coding agents -- Claude, Copilot, Cursor, and others -- persistent, structured project memory. Instead of re-reading your entire codebase on every request, agents receive a curated **Context Pack** containing exactly the knowledge they need.

Memory lives in `.ctx` YAML files alongside your code. They are tracked in git, reviewable in pull requests, and owned by your team -- not a third-party service.

v2 introduces the `.ctxl` index system for budget-constrained context selection, version tracking with automatic history entries, multi-agent conflict resolution, auto-update during coding sessions, project bootstrap, spec-kit bidirectional sync, and session-aware PR context generation.

**Core principles:**

- **Local-first, private-by-default.** No data leaves your machine. Ever.
- **Deterministic.** Same inputs always produce the same Context Pack, in the same order.
- **Budget-aware.** Respects token limits with index-based scoring and category budgets.
- **Transparent.** Every included and excluded item is attributed with reason codes.
- **Version-tracked.** Every `.ctx` change is recorded with full history and conflict resolution.

---

## Key Features

- **Hierarchical `.ctx` memory files** -- per-directory context that merges upward, child overrides parent
- **`.ctxl` index system** -- scored, categorized, budget-constrained context selection with dependency graph
- **Version tracking** -- automatic history entries and archival for every `.ctx` change
- **Multi-agent conflict resolution** -- three-way merge with lock manager for concurrent agent sessions
- **Auto-update** -- staleness tracking and proposal generation during coding sessions
- **Project bootstrap** -- analyze directory structure and generate `.ctx` files automatically with `ctxkit bootstrap`
- **Spec-kit bridge** -- import constitution and specs as locked decisions and contracts, bidirectional sync
- **PR context generation** -- session-aware PR descriptions with prompt chains and agent decisions
- **Smart context pack assembly** with index-based selection, locality, recency, and tag-based scoring
- **Contract enforcement** with scope matching across paths and tags
- **Token budget management** with category budgets and guaranteed deterministic output
- **Drift detection** -- flags when referenced files are moved, renamed, or deleted
- **Proposal workflow** -- diffs are shown before any `.ctx` modification is written
- **Session tracking** with full audit trail of every context injection
- **MCP server** -- 16 structured JSON-RPC tools usable by any MCP-compatible agent
- **Claude Code plugin** -- automatic context injection via 8 hooks, interactive `/ctxkit` and `/ctx` skills
- **Codex integration** -- MCP registration, `AGENTS.md` generation, and CLI fallback
- **Agent wrapper** for transparent context injection via `ctxkit run`
- **React inspection dashboard** with 5 new pages: timeline, context map, conflicts, activity feed, PR context
- **Secret detection** and automatic redaction of credentials in diffs and logs
- **V1-to-V2 migration** with `ctxkit migrate`

---

## Architecture

ctxl is a TypeScript monorepo with seven packages:

```
  +-------------------+     +---------------------+     +---------------------+
  | @ctxkit/claude-plugin|     |     @ctxkit/mcp       |     | @ctxkit/speckit-bridge|
  | (hooks + skills)   |     | (MCP server, 16     |     | (spec-kit import/   |
  +--------+----------+     |  JSON-RPC tools)    |     |  export/sync)       |
           |                 +----------+----------+     +----------+----------+
           |                            |                           |
           +------------+---------------+---------------------------+
                        |
                +-------v--------+
                |    @ctxkit/cli   |
                |  (ctxkit CLI)  |
                +-------+--------+
                        |
         +--------------+--------------+
         |                             |
+--------v--------+          +--------v---------+
|  @ctxkit/daemon    |          |    @ctxkit/ui       |
| (HTTP API +      |          | (React dashboard, |
|  SQLite store)   |          |  10 pages)        |
+--------+--------+          +------------------+
         |
+--------v--------+
|   @ctxkit/core    |
| (engine: parse,  |
|  score, pack,    |
|  index, version, |
|  conflict, auto- |
|  update, boot-   |
|  strap, pr-ctx)  |
+-----------------+
```

| Package | npm | Description |
|---------|-----|-------------|
| [`@ctxkit/core`](https://www.npmjs.com/package/@ctxkit/core) | [![npm](https://img.shields.io/npm/v/@ctxkit/core.svg)](https://www.npmjs.com/package/@ctxkit/core) | Context engine -- parsing, scoring, packing, diffing, redaction, indexing, versioning, conflict resolution, auto-update, bootstrap, PR context |
| [`@ctxkit/daemon`](https://www.npmjs.com/package/@ctxkit/daemon) | [![npm](https://img.shields.io/npm/v/@ctxkit/daemon.svg)](https://www.npmjs.com/package/@ctxkit/daemon) | HTTP API server with persistent SQLite storage |
| [`@ctxkit/cli`](https://www.npmjs.com/package/@ctxkit/cli) | [![npm](https://img.shields.io/npm/v/@ctxkit/cli.svg)](https://www.npmjs.com/package/@ctxkit/cli) | Command-line interface (`ctxkit`) |
| `@ctxkit/ui` | -- | React inspection dashboard (10 pages, not published) |
| [`@ctxkit/mcp`](https://www.npmjs.com/package/@ctxkit/mcp) | [![npm](https://img.shields.io/npm/v/@ctxkit/mcp.svg)](https://www.npmjs.com/package/@ctxkit/mcp) | MCP server exposing 16 CtxKit tools over stdio |
| [`@ctxkit/claude-plugin`](https://www.npmjs.com/package/@ctxkit/claude-plugin) | [![npm](https://img.shields.io/npm/v/@ctxkit/claude-plugin.svg)](https://www.npmjs.com/package/@ctxkit/claude-plugin) | Claude Code plugin with 8 hooks, `/ctxkit` skill, and `/ctx` skill |
| [`@ctxkit/speckit-bridge`](https://www.npmjs.com/package/@ctxkit/speckit-bridge) | [![npm](https://img.shields.io/npm/v/@ctxkit/speckit-bridge.svg)](https://www.npmjs.com/package/@ctxkit/speckit-bridge) | Spec-kit constitution/spec import, export, validation, and bidirectional sync |

**Tech stack:** TypeScript 5.x, Node.js 20+, Hono 4.7 (HTTP), better-sqlite3 11.8 (storage), Commander 13 (CLI), @modelcontextprotocol/sdk 1.27 (MCP), zod 3.25 (schema validation), React 19 (dashboard), Vite 6 (bundler)

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/szaher/contextual.git
cd ctxl
pnpm install
pnpm build

# Bootstrap .ctx files from your project structure
ctxkit bootstrap

# Or initialize a single .ctx manually
ctxkit init

# Generate the .ctxl index
ctxkit index generate

# Validate the generated files
ctxkit validate

# Preview the context pack for a request (without sending it)
ctxkit inject --request "explain auth flow" --budget 4000 --preview

# Build and inject a context pack
ctxkit inject --request "explain auth flow" --budget 4000

# Start the background daemon
ctxkit daemon start

# Open the inspection dashboard
ctxkit dashboard
```

### Migrating from v1

If you have existing v1 `.ctx` files, run the migration command:

```bash
ctxkit migrate
```

This adds `_history` and `_conflicts` fields, generates the `.ctxl` index, and updates the version field to `"2"`. Your existing context is preserved -- migration only adds v2 capabilities.

---

## Agent Integrations

ctxl supports multiple integration paths depending on the agent:

### Claude Code (automatic, zero-config)

Install the Claude Code plugin for fully automatic context injection:

```bash
# The plugin registers 8 hooks that fire automatically:
# SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
# PostToolUseFailure, TaskCompleted, PreCompact, SessionEnd
```

What happens automatically:
- **Every prompt** gets a relevant Context Pack injected as `additionalContext`
- **Every tool call** (Bash, Edit, Write) gets tool-specific context
- **Tool activity** is logged to the session timeline
- **Task completion** triggers a `.ctx` update proposal
- **Context compaction** preserves session memory via a compaction spine
- **Conflicts** are detected and resolved when multiple agents edit the same `.ctx`
- **History entries** are recorded for every change

Use the interactive `/ctxkit` skill for manual control:

```bash
/ctxkit inject       # Build and display context pack
/ctxkit sessions     # List sessions
/ctxkit memory search <query>  # Search .ctx entries
/ctxkit propose      # Trigger a .ctx update proposal
/ctxkit apply <id>   # Apply an approved proposal
/ctxkit policy       # Show effective configuration
/ctxkit index        # Show current .ctxl index
/ctxkit conflicts    # List active conflicts
/ctxkit pr           # Generate PR context from session
```

Use the interactive `/ctx` skill for quick status:

```bash
/ctx status          # Show current context state and staleness
/ctx suggest         # Get auto-update suggestions
/ctx apply           # Apply pending suggestions
/ctx diff            # Show pending .ctx diffs
/ctx conflicts       # Show and resolve conflicts
/ctx help            # Show available subcommands
```

### Codex (MCP or AGENTS.md)

**Option A: MCP tools** (structured, real-time)

```bash
codex mcp add ctxkit -- ctxkit-mcp
```

Codex can then call any of the 16 MCP tools (`ctxkit.context_pack`, `ctxkit.log_event`, `ctxkit.propose_update`, `ctxkit.index.generate`, `ctxkit.pr.generate`, etc.).

**Option B: AGENTS.md** (zero-config, passive)

```bash
ctxkit codex sync-agents
```

Generates `AGENTS.md` files from your `.ctx` hierarchy. Codex automatically discovers and reads these files -- no MCP registration required.

**Option C: CLI fallback**

```bash
ctxkit inject --request "fix auth bug" --json
ctxkit sessions list --json
ctxkit propose .ctx --json
ctxkit pr --json
```

All CLI commands support `--json` for machine-readable output compatible with Codex's shell tool.

### Any MCP-Compatible Agent

Register the MCP server for any agent that supports the Model Context Protocol:

```bash
ctxkit-mcp   # stdio-based MCP server
```

Exposes 16 tools:

| Tool | Description |
|------|-------------|
| `ctxkit.context_pack` | Build a context pack for a request |
| `ctxkit.log_event` | Log a tool event to the session timeline |
| `ctxkit.propose_update` | Generate a `.ctx` update proposal |
| `ctxkit.apply_proposal` | Apply an approved proposal |
| `ctxkit.reject_proposal` | Reject a pending proposal |
| `ctxkit.sessions.list` | List tracked agent sessions |
| `ctxkit.sessions.show` | Show session details |
| `ctxkit.policy.get` | Get effective workspace configuration |
| `ctxkit.policy.validate` | Validate a configuration object |
| `ctxkit.memory.search` | Search `.ctx` entries by keyword |
| `ctxkit.index.generate` | Generate or regenerate the `.ctxl` index |
| `ctxkit.index.select` | Select context entries using the index with budget constraints |
| `ctxkit.history.show` | Show version history for a `.ctx` file |
| `ctxkit.conflicts.resolve` | Resolve a multi-agent conflict |
| `ctxkit.bootstrap.run` | Analyze a directory and generate `.ctx` files |
| `ctxkit.pr.generate` | Generate session-aware PR context |

### Any CLI Agent (wrapper)

```bash
ctxkit run --agent claude --budget 8000 -- your-agent-command "fix the bug"
```

Wraps any CLI agent with context injection via environment variables.

---

## The .ctx File Format (v2)

`.ctx` files are YAML documents that capture structured project knowledge at each directory level. They live alongside the code they describe and are designed to be human-readable, git-diffable, and reviewable in pull requests.

v2 adds `_history` and `_conflicts` fields for version tracking and multi-agent conflict resolution.

### Complete Example

```yaml
version: "2"

summary: |
  Authentication module handling user login, registration, and
  session management. Uses JWT tokens with refresh rotation.
  All routes require HTTPS in production.

key_files:
  - path: src/auth/login.ts
    why: "Entry point for all login flows (email, OAuth, SSO)"
    tags: [auth, login, critical-path]
    verified_at: "2026-02-15T10:30:00Z"
    locked: false
  - path: src/auth/jwt.ts
    why: "Token generation, validation, and refresh logic"
    tags: [auth, jwt, security]
    verified_at: "2026-02-15T10:30:00Z"
    locked: true
  - path: src/auth/middleware.ts
    why: "Express middleware that validates JWT on protected routes"
    tags: [auth, middleware]
    verified_at: "2026-02-10T08:00:00Z"

contracts:
  - name: "AuthService interface"
    scope:
      paths: ["src/auth/*.ts"]
      tags: [auth]
    content: |
      interface AuthService {
        login(credentials: Credentials): Promise<AuthResult>;
        refresh(token: string): Promise<TokenPair>;
        logout(sessionId: string): Promise<void>;
        validateToken(token: string): Promise<Claims>;
      }

decisions:
  - id: "DEC-001"
    title: "JWT over session cookies"
    status: accepted
    date: "2026-01-15"
    rationale: |
      Stateless authentication scales better for our microservice
      architecture. Refresh token rotation mitigates the revocation
      limitation.
    alternatives:
      - "Session cookies with Redis store"
      - "OAuth2 proxy (rejected: too complex for MVP)"
  - id: "DEC-002"
    title: "bcrypt for password hashing"
    status: accepted
    date: "2026-01-20"
    rationale: "Industry standard, configurable work factor, well-audited."
    alternatives:
      - "argon2 (considered, less library support at the time)"

gotchas:
  - "Token refresh endpoint must be excluded from rate limiting"
  - "OAuth callback URL must match EXACTLY -- no trailing slash"
  - "Password reset tokens expire after 15 minutes, not 1 hour"

commands:
  test: "pnpm test -- --filter auth"
  lint: "pnpm lint -- src/auth/"

tags: [auth, security, jwt, login]

refs:
  - "docs/auth-architecture.md"
  - "https://datatracker.ietf.org/doc/html/rfc7519"

ignore:
  never_read:
    - "src/auth/__fixtures__/private-keys/"
    - ".env"
  never_log:
    - "src/auth/secrets.ts"

_history:
  - version: 3
    timestamp: "2026-03-10T14:22:00Z"
    author: "claude-agent-sess_abc123"
    changes:
      - field: "key_files"
        action: "add"
        summary: "Added src/auth/middleware.ts after refactoring auth pipeline"
      - field: "gotchas"
        action: "add"
        summary: "Added password reset token expiry gotcha"
    session_id: "sess_abc123"
  - version: 2
    timestamp: "2026-02-15T10:30:00Z"
    author: "developer@team.com"
    changes:
      - field: "contracts"
        action: "update"
        summary: "Updated AuthService interface to include validateToken method"
    session_id: null
  - version: 1
    timestamp: "2026-01-15T09:00:00Z"
    author: "developer@team.com"
    changes:
      - field: "*"
        action: "create"
        summary: "Initial .ctx file for auth module"
    session_id: null

_conflicts:
  - id: "conflict_001"
    status: "resolved"
    detected_at: "2026-03-10T14:25:00Z"
    resolved_at: "2026-03-10T14:26:00Z"
    field: "key_files"
    agents:
      - session_id: "sess_abc123"
        proposed: "add src/auth/rate-limiter.ts"
      - session_id: "sess_def456"
        proposed: "add src/auth/throttle.ts"
    resolution:
      strategy: "three-way-merge"
      result: "kept src/auth/rate-limiter.ts (more specific naming, matches existing pattern)"
      resolved_by: "sess_abc123"
```

### Hierarchical Merging

`.ctx` files form a hierarchy rooted at the repository root. When context is loaded for a working directory, the system walks from that directory upward to the repo root, loading every `.ctx` file it finds.

```
repo-root/.ctx          <-- project-wide context (summary, global decisions)
  src/.ctx              <-- source-level context (build conventions, shared types)
    src/auth/.ctx       <-- module-level context (auth-specific contracts, gotchas)
```

**Merge rules:**

- Child entries **override** parent entries for overlapping topics
- Non-overlapping parent entries are **inherited** without duplication
- `key_files`, `contracts`, `decisions`, and `gotchas` are merged additively
- `summary` at the child level replaces the parent summary for that scope
- `ignore` policies are unioned -- a path ignored at any level stays ignored
- `_history` entries are kept per-file and never merged across levels
- `_conflicts` are scoped to the file where the conflict occurred

---

## CLI Reference

The CLI tool is called `ctxkit`.

### Command Overview

| Command | Description |
|---------|-------------|
| `ctxkit init` | Initialize a `.ctx` file in the current directory |
| `ctxkit validate [path]` | Validate a `.ctx` file for structural correctness |
| `ctxkit inject` | Build and output a context pack |
| `ctxkit propose <ctx-path>` | Generate an update proposal for a `.ctx` file |
| `ctxkit apply <proposal-id>` | Apply or reject a pending proposal |
| `ctxkit sessions` | List tracked sessions |
| `ctxkit drift [path]` | Check for stale file references |
| `ctxkit daemon start\|stop\|status` | Manage the background daemon |
| `ctxkit dashboard` | Open the inspection dashboard |
| `ctxkit run <cmd...>` | Wrap an agent command with context injection |
| `ctxkit codex sync-agents` | Generate `AGENTS.md` files from `.ctx` hierarchy |
| `ctxkit index generate\|show\|select` | Manage the `.ctxl` index |
| `ctxkit history [path]` | Show version history for a `.ctx` file |
| `ctxkit conflicts list\|resolve` | List and resolve multi-agent conflicts |
| `ctxkit bootstrap` | Analyze directory structure and generate `.ctx` files |
| `ctxkit migrate` | Migrate v1 `.ctx` files to v2 format |
| `ctxkit speckit import\|export\|validate\|sync` | Spec-kit bridge operations |
| `ctxkit pr` | Generate session-aware PR context |
| `ctxkit hooks` | Manage and inspect plugin hooks |

### Detailed Command Reference

#### `ctxkit init`

Create a new `.ctx` file in the current directory, pre-populated from available project metadata (package.json, README, directory structure).

```bash
ctxkit init
ctxkit init --path src/auth/
```

#### `ctxkit validate [path]`

Validate a `.ctx` file for structural correctness. Reports missing required sections, malformed entries, and optionally checks that referenced files exist on disk.

```bash
ctxkit validate
ctxkit validate src/auth/.ctx
ctxkit validate --check-files    # also verify referenced file paths exist
```

#### `ctxkit inject`

Build a context pack for a given request. Discovers `.ctx` files, consults the `.ctxl` index, merges the hierarchy, scores entries, and assembles the pack within category budgets.

```bash
ctxkit inject --request "fix the login timeout bug" --budget 4000
ctxkit inject --request "explain auth flow" --cwd src/auth/ --budget 8000
ctxkit inject --request "add rate limiting" --preview    # show what would be injected
ctxkit inject --request "fix auth bug" --json            # JSON output for scripting
```

| Flag | Description | Default |
|------|-------------|---------|
| `--request` | The request text to score against | (required) |
| `--cwd` | Working directory for locality scoring | `.` |
| `--budget` | Maximum token budget | `4096` |
| `--preview` | Show the pack without injecting | `false` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit propose <ctx-path>`

Generate an update proposal for a `.ctx` file. Analyzes recent changes and produces a diff of suggested updates. The proposal is stored but not applied until explicitly approved. Proposals automatically include a history entry.

```bash
ctxkit propose .ctx
ctxkit propose src/auth/.ctx --check-files
ctxkit propose .ctx --daemon    # submit via daemon API
```

| Flag | Description | Default |
|------|-------------|---------|
| `--check-files` | Include file existence checks in proposal | `false` |
| `--daemon` | Submit proposal via the daemon | `false` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit apply <proposal-id>`

Apply or reject a pending update proposal. On apply, a history entry is appended and conflict checks run against active sessions.

```bash
ctxkit apply prop_abc123
ctxkit apply prop_abc123 --reject
ctxkit apply prop_abc123 --daemon
```

| Flag | Description | Default |
|------|-------------|---------|
| `--reject` | Reject the proposal instead of applying | `false` |
| `--daemon` | Apply via the daemon API | `false` |

#### `ctxkit sessions`

List and inspect tracked agent sessions.

```bash
ctxkit sessions
ctxkit sessions --status active --limit 10
ctxkit sessions show sess_xyz789
ctxkit sessions --daemon
```

| Flag | Description | Default |
|------|-------------|---------|
| `--status` | Filter by status (`active`, `completed`) | all |
| `--limit` | Maximum number of sessions to list | `20` |
| `--daemon` | Query the daemon API | `false` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit drift [path]`

Check for drift between `.ctx` references and the actual repository state. Flags moved, renamed, or deleted files and stale verification timestamps.

```bash
ctxkit drift
ctxkit drift src/auth/.ctx
```

#### `ctxkit daemon start|stop|status`

Manage the ctxl background daemon. The daemon provides the HTTP API, persists sessions in SQLite, and serves the dashboard.

```bash
ctxkit daemon start
ctxkit daemon start --port 7420
ctxkit daemon stop
ctxkit daemon status
```

| Flag | Description | Default |
|------|-------------|---------|
| `--port` | Port for the daemon HTTP server | `7419` |

#### `ctxkit dashboard`

Open the inspection dashboard in a browser. Requires the daemon to be running. The dashboard includes 10 pages: sessions, context packs, proposals, drift, config, timeline, context map, conflicts, activity feed, and PR context.

```bash
ctxkit dashboard
ctxkit dashboard --port 7420
```

#### `ctxkit codex sync-agents`

Generate `AGENTS.md` files from the `.ctx` hierarchy for Codex integration. Codex automatically reads `AGENTS.md` files from each directory, providing zero-config context injection.

```bash
ctxkit codex sync-agents
ctxkit codex sync-agents --budget 12000
ctxkit codex sync-agents --dry-run    # show what would be written
ctxkit codex sync-agents --repo-root /path/to/repo
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo-root` | Repository root path | auto-detected |
| `--budget` | Max tokens per AGENTS.md file | `8000` |
| `--dry-run` | Preview without writing files | `false` |

Generated files include `<!-- CTXKIT:BEGIN -->` / `<!-- CTXKIT:END -->` markers. Content outside these markers is preserved across re-runs. Re-running on unchanged `.ctx` files produces zero-diff output (idempotent).

#### `ctxkit run <cmd...>`

Wrap an agent command with transparent context injection. Starts a session, injects context into the agent's environment, and tracks all requests.

```bash
ctxkit run claude --request "fix auth bug"
ctxkit run cursor --agent cursor --budget 8000
ctxkit run -- npx my-agent --cwd src/auth/
```

| Flag | Description | Default |
|------|-------------|---------|
| `--daemon` | Route through daemon API | `false` |
| `--cwd` | Working directory | `.` |
| `--budget` | Token budget | `4096` |
| `--agent` | Agent identifier for config lookup | auto-detect |
| `--request` | Initial request text | none |

#### `ctxkit index generate|show|select`

Manage the `.ctxl` index -- a scored, categorized manifest of all context entries with dependency graph and category budgets.

```bash
ctxkit index generate                  # scan all .ctx files and build the index
ctxkit index generate --force          # regenerate even if index is current
ctxkit index show                      # display current index with scores
ctxkit index show --category contracts # filter by category
ctxkit index select --request "auth flow" --budget 4000  # select entries for a request
ctxkit index select --request "auth flow" --json          # JSON output
```

| Flag | Description | Default |
|------|-------------|---------|
| `--force` | Force regeneration of the index | `false` |
| `--category` | Filter by category (`contracts`, `local_ctx`, `related_ctx`, `history`, `reserve`) | all |
| `--request` | Request text for selection scoring | (required for `select`) |
| `--budget` | Token budget for selection | `4096` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit history [path]`

Show version history for a `.ctx` file. Displays all changes with timestamps, authors, and session IDs.

```bash
ctxkit history                         # history for .ctx in current directory
ctxkit history src/auth/.ctx           # history for a specific file
ctxkit history --limit 10              # show last 10 entries
ctxkit history --json                  # JSON output
```

| Flag | Description | Default |
|------|-------------|---------|
| `--limit` | Maximum number of history entries | `50` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit conflicts list|resolve`

List and resolve multi-agent conflicts. Conflicts occur when multiple agents propose changes to the same `.ctx` field concurrently.

```bash
ctxkit conflicts list                         # list all active conflicts
ctxkit conflicts list --status resolved       # include resolved conflicts
ctxkit conflicts resolve conflict_001         # interactively resolve a conflict
ctxkit conflicts resolve conflict_001 --strategy three-way-merge  # use specific strategy
ctxkit conflicts resolve conflict_001 --accept sess_abc123        # accept one agent's proposal
ctxkit conflicts list --json                  # JSON output
```

| Flag | Description | Default |
|------|-------------|---------|
| `--status` | Filter by status (`active`, `resolved`, `all`) | `active` |
| `--strategy` | Resolution strategy (`three-way-merge`, `accept`, `reject`) | interactive |
| `--accept` | Accept the proposal from this session ID | none |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit bootstrap`

Analyze a directory structure and automatically generate `.ctx` files. Scans source files, package manifests, READMEs, and existing documentation to produce initial context.

```bash
ctxkit bootstrap                       # bootstrap from current directory
ctxkit bootstrap --path src/           # bootstrap a specific subtree
ctxkit bootstrap --depth 3             # limit directory traversal depth
ctxkit bootstrap --dry-run             # preview without writing files
ctxkit bootstrap --json                # JSON output
```

| Flag | Description | Default |
|------|-------------|---------|
| `--path` | Root directory to analyze | `.` |
| `--depth` | Maximum directory depth to traverse | `5` |
| `--dry-run` | Preview generated files without writing | `false` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit migrate`

Migrate v1 `.ctx` files to v2 format. Adds `_history` and `_conflicts` fields, updates the version to `"2"`, and generates the `.ctxl` index.

```bash
ctxkit migrate                         # migrate all .ctx files in the repo
ctxkit migrate --path src/auth/.ctx    # migrate a specific file
ctxkit migrate --dry-run               # preview changes without writing
ctxkit migrate --json                  # JSON output
```

| Flag | Description | Default |
|------|-------------|---------|
| `--path` | Specific `.ctx` file to migrate | all files |
| `--dry-run` | Preview without writing | `false` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit speckit import|export|validate|sync`

Bridge operations between ctxl and spec-kit. Import constitutions and specs as locked decisions and contracts, export `.ctx` entries as spec-kit artifacts, validate consistency, or run bidirectional sync.

```bash
ctxkit speckit import constitution.yaml        # import constitution as locked decisions
ctxkit speckit import specs/api-v2.yaml        # import spec as contracts
ctxkit speckit export .ctx --format speckit     # export .ctx entries as spec-kit artifacts
ctxkit speckit validate                         # check consistency between .ctx and specs
ctxkit speckit sync                             # bidirectional sync (pull and push changes)
ctxkit speckit sync --dry-run                   # preview sync without writing
```

| Flag | Description | Default |
|------|-------------|---------|
| `--format` | Export format (`speckit`, `yaml`, `json`) | `speckit` |
| `--dry-run` | Preview without writing | `false` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit pr`

Generate a session-aware PR description from the current session's context. Includes prompt chains, agent decisions, relevant `.ctx` changes, and a structured summary.

```bash
ctxkit pr                              # generate PR context from active session
ctxkit pr --session sess_abc123        # generate from a specific session
ctxkit pr --format markdown            # output as markdown (default)
ctxkit pr --format json                # output as structured JSON
ctxkit pr --include-decisions          # include decision rationale in output
ctxkit pr --include-prompts            # include prompt chain in output
```

| Flag | Description | Default |
|------|-------------|---------|
| `--session` | Session ID to generate PR context from | active session |
| `--format` | Output format (`markdown`, `json`) | `markdown` |
| `--include-decisions` | Include decision rationale | `true` |
| `--include-prompts` | Include the prompt chain | `false` |
| `--json` | Output as structured JSON | `false` |

#### `ctxkit hooks`

Manage and inspect plugin hooks. Lists registered hooks, shows hook execution history, and allows testing hooks in isolation.

```bash
ctxkit hooks                           # list all registered hooks
ctxkit hooks show SessionStart         # show details for a specific hook
ctxkit hooks test PreToolUse           # test a hook handler in isolation
ctxkit hooks --json                    # JSON output
```

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output as structured JSON | `false` |

---

## Context Pack Assembly

When a request arrives, the context pack assembly pipeline runs these steps:

### 1. Discover

Walk from the current working directory upward to the repository root, collecting every `.ctx` file found along the way. Load the `.ctxl` index if present.

### 2. Index Select

If a `.ctxl` index exists, use it for budget-constrained selection with category budgets. The index scores entries across five categories:

| Category | Budget Share | Description |
|----------|-------------|-------------|
| `contracts` | 20% | Interface contracts and API boundaries |
| `local_ctx` | 30% | Context from `.ctx` files near the working directory |
| `related_ctx` | 30% | Context from related modules via dependency graph |
| `history` | 10% | Recent version history entries |
| `reserve` | 10% | Buffer for unexpected context needs |

If no index exists, the system falls back to the directory-walk scoring pipeline.

### 3. Merge

Apply hierarchical merge rules. Child entries override parent entries for overlapping topics. Non-overlapping entries are inherited. The result is a single unified context view.

### 4. Score

Each entry is scored using a weighted formula:

```
score = (locality * 0.4) + (tags * 0.3) + (recency * 0.2) + (section_bonus * 0.1)
```

| Factor | Weight | Description |
|--------|--------|-------------|
| Locality | 0.4 | How close the `.ctx` source is to the working directory |
| Tags | 0.3 | Overlap between entry tags and request keywords |
| Recency | 0.2 | How recently the entry was verified or the referenced file was modified |
| Section bonus | 0.1 | Bonus for contracts, decisions, and gotchas sections |

Pinned entries bypass scoring and are always included (within budget).

### 5. Budget

Fill the token budget in priority order, respecting category allocations from the `.ctxl` index:

1. **Contracts** matching the request scope (tagged `CONTRACT_REQUIRED`)
2. **Pinned entries** (tagged `PINNED`)
3. **Index-selected entries** by category budget allocation
4. **Remaining entries** by descending score until the budget is filled

Entries that do not fit are recorded in the omitted-items list with their score and the reason for exclusion.

### 6. Build

Assemble the final Context Pack with full attribution:

- **Source file** -- which `.ctx` file each entry came from
- **Reason codes** -- why each entry was included
- **Staleness info** -- how recently each entry was verified
- **History context** -- relevant version history for included entries
- **Omitted items** -- what was left out and why

### Reason Codes

| Code | Meaning |
|------|---------|
| `LOCALITY_HIGH` | Entry is from a `.ctx` file near the working directory |
| `TAG_MATCH` | Entry tags match request keywords |
| `PINNED` | Entry is explicitly pinned by the user |
| `RECENT_EDIT` | Referenced file was recently modified |
| `CONTRACT_REQUIRED` | Entry is a contract matching the request scope |
| `DEEP_READ` | Entry was resolved via direct file read fallback |
| `INDEX_SELECTED` | Entry was selected by the `.ctxl` index |
| `DEPENDENCY_GRAPH` | Entry was included via dependency graph traversal |
| `HISTORY_RELEVANT` | History entry is relevant to the current request |

---

## Configuration

ctxl uses a layered configuration system. Settings are resolved in this order (first match wins):

**Request overrides > Agent config > Workspace profile > Global profile > Defaults**

### Workspace Configuration

Create `.ctxl/config.yaml` in your repository root:

```yaml
# .ctxl/config.yaml
budget: 4096

scoring:
  mode: weighted          # "weighted" | "locality-only" | "tags-only" | "index"
  locality_weight: 0.4
  tags_weight: 0.3
  recency_weight: 0.2
  section_bonus_weight: 0.1

index:
  enabled: true
  category_budgets:
    contracts: 0.20       # 20% of budget for contracts
    local_ctx: 0.30       # 30% for local context
    related_ctx: 0.30     # 30% for related context
    history: 0.10         # 10% for version history
    reserve: 0.10         # 10% reserve buffer

auto_update:
  enabled: true
  staleness_threshold: 7d    # flag entries older than 7 days
  proposal_on_complete: true # propose .ctx updates on task completion

conflict_resolution:
  strategy: three-way-merge  # "three-way-merge" | "last-write-wins" | "manual"
  lock_timeout: 300          # seconds before lock expires

ignore:
  - "node_modules/**"
  - "dist/**"
  - ".env*"
  - "**/*.min.js"

agents:
  claude:
    budget: 8000
    auto_approve: false
  cursor:
    budget: 6000
    auto_approve: true

retention:
  sessions: 30d           # keep session data for 30 days
  audit_log: 90d          # keep audit entries for 90 days
  proposals: 7d           # keep unapplied proposals for 7 days
  history: 365d           # keep .ctx version history for 1 year

daemon:
  port: 7419
  auto_start: false

speckit:
  enabled: false
  sync_mode: pull          # "pull" | "push" | "bidirectional"
  constitution_path: null  # path to spec-kit constitution file
```

### Global Configuration

Place defaults in `~/.ctxl/config.yaml`. These apply to all repositories unless overridden by a workspace config.

---

## Daemon API

The daemon exposes a REST API for programmatic access. All endpoints are prefixed with `/api/v1`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check, returns daemon status and version |
| `POST` | `/api/v1/context-pack` | Build a context pack for a request |
| `GET` | `/api/v1/context-pack/preview` | Preview a context pack without creating a session |
| `POST` | `/api/v1/sessions` | Create a new tracking session |
| `GET` | `/api/v1/sessions` | List sessions (supports `?status=` and `?limit=` query params) |
| `GET` | `/api/v1/sessions/:id` | Get session details including request timeline |
| `PATCH` | `/api/v1/sessions/:id` | Update session status (e.g., mark completed) |
| `POST` | `/api/v1/sessions/:id/events` | Log a tool event to the session timeline |
| `POST` | `/api/v1/proposals` | Submit a `.ctx` update proposal |
| `GET` | `/api/v1/proposals` | List pending proposals |
| `PATCH` | `/api/v1/proposals/:id` | Update proposal status |
| `POST` | `/api/v1/proposals/:id/apply` | Apply an approved proposal to the `.ctx` file |
| `GET` | `/api/v1/config` | Get effective workspace configuration |
| `POST` | `/api/v1/config/validate` | Validate a configuration object against the schema |
| `GET` | `/api/v1/memory/search` | Search `.ctx` entries by keyword |
| `GET` | `/api/v1/drift` | Run drift detection across all tracked `.ctx` files |
| `GET` | `/api/v1/audit` | Query the audit log (supports `?from=`, `?to=`, `?path=`) |
| `POST` | `/api/v1/index/generate` | Generate or regenerate the `.ctxl` index |
| `GET` | `/api/v1/index` | Get the current `.ctxl` index |
| `POST` | `/api/v1/index/select` | Select context entries using index with budget constraints |
| `GET` | `/api/v1/history/:path` | Get version history for a `.ctx` file |
| `GET` | `/api/v1/history/:path/:version` | Get a specific version of a `.ctx` file |
| `GET` | `/api/v1/conflicts` | List active conflicts |
| `GET` | `/api/v1/conflicts/:id` | Get conflict details |
| `POST` | `/api/v1/conflicts/:id/resolve` | Resolve a conflict |
| `GET` | `/api/v1/activity` | Get the activity feed (supports `?from=`, `?to=`, `?type=`) |
| `GET` | `/api/v1/activity/stats` | Get activity statistics |
| `POST` | `/api/v1/speckit/import` | Import a spec-kit artifact |
| `POST` | `/api/v1/speckit/export` | Export `.ctx` entries as spec-kit artifacts |
| `POST` | `/api/v1/speckit/validate` | Validate consistency between `.ctx` and specs |
| `POST` | `/api/v1/speckit/sync` | Run bidirectional sync |
| `POST` | `/api/v1/pr-context/generate` | Generate PR context from a session |
| `GET` | `/api/v1/pr-context/:session_id` | Get generated PR context for a session |
| `POST` | `/api/v1/bootstrap` | Analyze a directory and generate `.ctx` files |
| `GET` | `/api/v1/bootstrap/preview` | Preview bootstrap results without writing |

### Example: Build a Context Pack

```bash
curl -X POST http://localhost:7419/api/v1/context-pack \
  -H "Content-Type: application/json" \
  -d '{
    "request": "explain the auth flow",
    "cwd": "/home/dev/myproject/src/auth",
    "budget": 4000
  }'
```

### Example: List Active Sessions

```bash
curl http://localhost:7419/api/v1/sessions?status=active&limit=5
```

### Example: Generate PR Context

```bash
curl -X POST http://localhost:7419/api/v1/pr-context/generate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_abc123",
    "include_decisions": true,
    "include_prompts": false
  }'
```

### Example: Resolve a Conflict

```bash
curl -X POST http://localhost:7419/api/v1/conflicts/conflict_001/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "three-way-merge",
    "accepted_session": "sess_abc123"
  }'
```

---

## Security

ctxl enforces strict security policies to prevent credentials and secrets from leaking into `.ctx` files or logs.

### Secret Detection Patterns

The redaction engine scans all proposed `.ctx` updates, diffs, and log entries for known secret patterns:

| Pattern | Example |
|---------|---------|
| AWS Access Key | `AKIAIOSFODNN7EXAMPLE` |
| AWS Secret Key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| API tokens | `sk-proj-...`, `sk_live_...`, `tok_...` |
| PEM private keys | `-----BEGIN RSA PRIVATE KEY-----` |
| Connection strings | `postgresql://user:pass@host/db` |
| GitHub tokens | `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| Bearer tokens | `Bearer eyJhbGciOiJIUzI1NiIs...` |
| Generic high-entropy secrets | Base64 strings with key/secret/token context |

### Enforcement

- **Automatic redaction.** Any content matching a secret pattern is replaced with `[REDACTED]` before being written to a proposal diff or log entry.
- **Block on write.** The system refuses to write detected secrets into `.ctx` files, even if a user explicitly includes them in a proposal.
- **Ignore policies.** Use the `ignore.never_read` and `ignore.never_log` fields in `.ctx` files to designate sensitive paths. These policies are enforced at all levels and cannot be overridden by scoring or pinning.

---

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Setup

```bash
git clone https://github.com/szaher/contextual.git
cd ctxl
pnpm install
pnpm build
```

### Commands

```bash
pnpm build          # Build all packages (7 packages)
pnpm test           # Run all tests (324 tests across 23 test files)
pnpm test:e2e       # Run end-to-end tests
pnpm test:watch     # Run tests in watch mode
pnpm lint           # Lint all packages
pnpm lint:fix       # Lint and auto-fix
pnpm format         # Format with Prettier
pnpm format:check   # Check formatting
pnpm clean          # Remove all build artifacts
```

### Project Structure

```
ctxl/
  packages/
    core/               @ctxkit/core -- context engine
      src/
        auto-update/     Staleness tracking and proposal generation
        bootstrap/       Directory analysis and .ctx file generation
        config/          Configuration loading and merging
        conflict/        Multi-agent conflict detection and resolution
        ctx/             .ctx file parsing and validation
        differ/          Diff generation for proposals
        index/           .ctxl index generation, scoring, and selection
        packer/          Context pack assembly
        pr-context/      PR description generation from sessions
        redact/          Secret detection and redaction
        scorer/          Entry scoring (locality, tags, recency)
        types/           Shared type definitions
        versioning/      Version tracking and history management
    daemon/              @ctxkit/daemon -- HTTP API + storage
      src/
        routes/          Hono route handlers (context-pack, sessions, events, config,
                         memory, proposals, drift, audit, index, history, conflicts,
                         activity, speckit, pr-context, bootstrap)
        store/           SQLite persistence layer
        scheduler/       Background task scheduling
    cli/                 @ctxkit/cli -- ctxkit command-line tool
      src/
        commands/        Commander.js command definitions (inject, propose, sessions,
                         drift, codex, index, history, conflicts, bootstrap, migrate,
                         speckit, pr, hooks, ...)
        services/        Service layer (agents-md generator)
    mcp/                 @ctxkit/mcp -- MCP server
      src/
        tools/           MCP tool registrations (context-pack, events, proposals,
                         sessions, policy, memory, index, history, conflicts,
                         bootstrap, pr)
        client.ts        Daemon HTTP client
        server.ts        McpServer instance and transport
    claude-plugin/       @ctxkit/claude-plugin -- Claude Code plugin
      scripts/           Hook handler scripts (session-start, user-prompt-submit,
                         pre-tool-use, ...)
      hooks/             hooks.json configuration
      skills/            /ctxkit and /ctx skill definitions (SKILL.md)
      .claude-plugin/    Plugin manifest (plugin.json)
    speckit-bridge/      @ctxkit/speckit-bridge -- spec-kit integration
      src/
        import/          Constitution and spec import
        export/          .ctx to spec-kit artifact export
        validate/        Consistency validation
        sync/            Bidirectional sync engine
    ui/                  @ctxkit/ui -- React inspection dashboard
      src/
        components/      Reusable UI components
        pages/           Route-level page components (sessions, context-packs,
                         proposals, drift, config, timeline, context-map,
                         conflicts, activity-feed, pr-context)
        services/        API client services
  tests/
    integration/         Integration test suites
    e2e/                 End-to-end test suites
    fixtures/            Test data (golden files, sample repos)
```

---

## Contributing

Contributions are welcome. Please follow these guidelines:

1. **Fork** the repository and create a feature branch from `main`.
2. **Write tests** for any new functionality. The test suites live in `tests/integration/` and `tests/e2e/`.
3. **Run the full test suite** before submitting:
   ```bash
   pnpm test && pnpm test:e2e && pnpm lint
   ```
4. **Follow existing code style.** The project uses ESLint and Prettier with the configurations checked into the repository.
5. **Keep commits focused.** One logical change per commit with a clear message.
6. **Open a pull request** against `main` with a description of what changed and why.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
