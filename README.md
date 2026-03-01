# ctxl

**Local-first context memory for AI coding agents**

[![CI](https://github.com/szaher/ctxl/actions/workflows/ci.yml/badge.svg)](https://github.com/szaher/ctxl/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@ctxl/cli.svg)](https://www.npmjs.com/package/@ctxl/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

---

## Overview

ctxl (pronounced "contextual") gives AI coding agents -- Claude, Copilot, Cursor, and others -- persistent, structured project memory. Instead of re-reading your entire codebase on every request, agents receive a curated **Context Pack** containing exactly the knowledge they need.

Memory lives in `.ctx` YAML files alongside your code. They are tracked in git, reviewable in pull requests, and owned by your team -- not a third-party service.

**Core principles:**

- **Local-first, private-by-default.** No data leaves your machine. Ever.
- **Deterministic.** Same inputs always produce the same Context Pack, in the same order.
- **Budget-aware.** Respects token limits with intelligent scoring and prioritization.
- **Transparent.** Every included and excluded item is attributed with reason codes.

---

## Key Features

- **Hierarchical `.ctx` memory files** -- per-directory context that merges upward, child overrides parent
- **Smart context pack assembly** with locality, recency, and tag-based scoring
- **Contract enforcement** with scope matching across paths and tags
- **Token budget management** with guaranteed deterministic output
- **Drift detection** -- flags when referenced files are moved, renamed, or deleted
- **Proposal workflow** -- diffs are shown before any `.ctx` modification is written
- **Session tracking** with full audit trail of every context injection
- **MCP server** -- 10 structured JSON-RPC tools usable by any MCP-compatible agent
- **Claude Code plugin** -- automatic context injection via 8 hooks, interactive `/ctxkit` skill
- **Codex integration** -- MCP registration, `AGENTS.md` generation, and CLI fallback
- **Agent wrapper** for transparent context injection via `ctxkit run`
- **React inspection dashboard** for visual session and memory management
- **Secret detection** and automatic redaction of credentials in diffs and logs

---

## Architecture

ctxl is a TypeScript monorepo with six packages:

```
  +-------------------+     +---------------------+
  | @ctxl/claude-plugin|     |     @ctxl/mcp       |
  | (hooks + skill)    |     | (MCP server, 10     |
  +--------+----------+     |  JSON-RPC tools)    |
           |                 +----------+----------+
           |                            |
           +------------+---------------+
                        |
                +-------v--------+
                |    @ctxl/cli   |
                |  (ctxkit CLI)  |
                +-------+--------+
                        |
         +--------------+--------------+
         |                             |
+--------v--------+          +--------v---------+
|  @ctxl/daemon    |          |    @ctxl/ui       |
| (HTTP API +      |          | (React dashboard) |
|  SQLite store)   |          +------------------+
+--------+--------+
         |
+--------v--------+
|   @ctxl/core    |
| (engine: parse,  |
|  score, pack)    |
+-----------------+
```

| Package | Description | Key Dependencies |
|---------|-------------|------------------|
| `@ctxl/core` | Context engine -- parsing, scoring, packing, diffing, redaction | js-yaml, proper-lockfile |
| `@ctxl/daemon` | HTTP API server with persistent SQLite storage | Hono, @hono/node-server, better-sqlite3 |
| `@ctxl/cli` | Command-line interface (`ctxkit`) | Commander.js |
| `@ctxl/ui` | React inspection dashboard | React 19, React Router, Vite |
| `@ctxl/mcp` | MCP server exposing 10 CtxKit tools over stdio | @modelcontextprotocol/sdk, zod |
| `@ctxl/claude-plugin` | Claude Code plugin with 8 hooks and `/ctxkit` skill | @ctxl/mcp (client) |

**Tech stack:** TypeScript 5.x, Node.js 20+, Hono (HTTP), better-sqlite3 (storage), Commander.js (CLI), @modelcontextprotocol/sdk (MCP), zod (schema validation), React 19, Vite 6

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/szaher/ctxl.git
cd ctxl
pnpm install
pnpm build

# Initialize a .ctx in your project
ctxkit init

# Validate the generated .ctx file
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

Use the interactive skill for manual control:

```bash
/ctxkit inject       # Build and display context pack
/ctxkit sessions     # List sessions
/ctxkit memory search <query>  # Search .ctx entries
/ctxkit propose      # Trigger a .ctx update proposal
/ctxkit apply <id>   # Apply an approved proposal
/ctxkit policy       # Show effective configuration
```

### Codex (MCP or AGENTS.md)

**Option A: MCP tools** (structured, real-time)

```bash
codex mcp add ctxkit -- ctxkit-mcp
```

Codex can then call any of the 10 MCP tools (`ctxkit.context_pack`, `ctxkit.log_event`, `ctxkit.propose_update`, etc.).

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
```

All CLI commands support `--json` for machine-readable output compatible with Codex's shell tool.

### Any MCP-Compatible Agent

Register the MCP server for any agent that supports the Model Context Protocol:

```bash
ctxkit-mcp   # stdio-based MCP server
```

Exposes 10 tools: `ctxkit.context_pack`, `ctxkit.log_event`, `ctxkit.propose_update`, `ctxkit.apply_proposal`, `ctxkit.reject_proposal`, `ctxkit.sessions.list`, `ctxkit.sessions.show`, `ctxkit.policy.get`, `ctxkit.policy.validate`, `ctxkit.memory.search`.

### Any CLI Agent (wrapper)

```bash
ctxkit run --agent claude --budget 8000 -- your-agent-command "fix the bug"
```

Wraps any CLI agent with context injection via environment variables.

---

## The .ctx File Format

`.ctx` files are YAML documents that capture structured project knowledge at each directory level. They live alongside the code they describe and are designed to be human-readable, git-diffable, and reviewable in pull requests.

### Complete Example

```yaml
version: "1"

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

Build a context pack for a given request. Discovers `.ctx` files, merges the hierarchy, scores entries, and assembles the pack within the token budget.

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

Generate an update proposal for a `.ctx` file. Analyzes recent changes and produces a diff of suggested updates. The proposal is stored but not applied until explicitly approved.

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

Apply or reject a pending update proposal.

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

Open the inspection dashboard in a browser. Requires the daemon to be running.

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

---

## Context Pack Assembly

When a request arrives, the context pack assembly pipeline runs these steps:

### 1. Discover

Walk from the current working directory upward to the repository root, collecting every `.ctx` file found along the way.

### 2. Merge

Apply hierarchical merge rules. Child entries override parent entries for overlapping topics. Non-overlapping entries are inherited. The result is a single unified context view.

### 3. Score

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

### 4. Budget

Fill the token budget in priority order:

1. **Contracts** matching the request scope (tagged `CONTRACT_REQUIRED`)
2. **Pinned entries** (tagged `PINNED`)
3. **Remaining entries** by descending score until the budget is filled

Entries that do not fit are recorded in the omitted-items list with their score and the reason for exclusion.

### 5. Build

Assemble the final Context Pack with full attribution:

- **Source file** -- which `.ctx` file each entry came from
- **Reason codes** -- why each entry was included
- **Staleness info** -- how recently each entry was verified
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
  mode: weighted          # "weighted" | "locality-only" | "tags-only"
  locality_weight: 0.4
  tags_weight: 0.3
  recency_weight: 0.2
  section_bonus_weight: 0.1

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

daemon:
  port: 7419
  auto_start: false
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
git clone https://github.com/szaher/ctxl.git
cd ctxl
pnpm install
pnpm build
```

### Commands

```bash
pnpm build          # Build all packages (6 packages)
pnpm test           # Run integration tests (147 tests)
pnpm test:e2e       # Run end-to-end tests (79 tests)
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
    core/               @ctxl/core -- context engine
      src/
        config/          Configuration loading and merging
        ctx/             .ctx file parsing and validation
        differ/          Diff generation for proposals
        packer/          Context pack assembly
        redact/          Secret detection and redaction
        scorer/          Entry scoring (locality, tags, recency)
        types/           Shared type definitions
    daemon/              @ctxl/daemon -- HTTP API + storage
      src/
        routes/          Hono route handlers (context-pack, sessions, events, config, memory, proposals, drift, audit)
        store/           SQLite persistence layer
        scheduler/       Background task scheduling
    cli/                 @ctxl/cli -- ctxkit command-line tool
      src/
        commands/        Commander.js command definitions (inject, propose, sessions, drift, codex, ...)
        services/        Service layer (agents-md generator)
    mcp/                 @ctxl/mcp -- MCP server
      src/
        tools/           MCP tool registrations (context-pack, events, proposals, sessions, policy, memory)
        client.ts        Daemon HTTP client
        server.ts        McpServer instance and transport
    claude-plugin/       @ctxl/claude-plugin -- Claude Code plugin
      scripts/           Hook handler scripts (session-start, user-prompt-submit, pre-tool-use, ...)
      hooks/             hooks.json configuration
      skills/            /ctxkit skill definition (SKILL.md)
      .claude-plugin/    Plugin manifest (plugin.json)
    ui/                  @ctxl/ui -- React inspection dashboard
      src/
        components/      Reusable UI components
        pages/           Route-level page components
        services/        API client services
  tests/
    integration/         Integration test suites (10 files, 147 tests)
    e2e/                 End-to-end test suites (12 files, 79 tests)
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
