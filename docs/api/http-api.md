# HTTP API Reference

The ctxl daemon exposes a REST API at `http://127.0.0.1:3742/api/v1/`. All requests and responses use JSON. The daemon must be running (`ctxkit daemon start`) for these endpoints to be available.

## Base URL

```
http://localhost:3742/api/v1
```

## Error Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

Error codes: `BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `APPLY_FAILED`, `INTERNAL_ERROR`.

---

## Health

### GET /health

Check daemon health and status.

**Response (200):**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime_seconds": 3600,
  "active_sessions": 2,
  "db_size_bytes": 1048576
}
```

**Example:**

```bash
curl http://localhost:3742/api/v1/health
```

---

## Context Packs

### POST /context-pack

Build a Context Pack for a request and record it as a session event.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | yes | Session to record this event under |
| `request_text` | string | yes | The request text to build context for |
| `working_dir` | string | yes | Working directory for context resolution |
| `touched_files` | string[] | no | Files the agent has touched (boosts RECENT_EDIT scoring) |
| `budget_tokens` | number | no | Token budget (default: 4000) |

**Response (200):**

```json
{
  "event_id": "evt_abc123",
  "pack": {
    "version": 1,
    "items": [
      {
        "content": "login.ts: Handles user authentication flow",
        "source": "src/auth/.ctx",
        "section": "key_files",
        "entry_id": "login.ts",
        "score": 0.88,
        "tokens": 42,
        "reason_codes": ["LOCALITY_HIGH", "TAG_MATCH"],
        "staleness": {
          "verified_at": "2026-01-15",
          "is_stale": false
        }
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
  },
  "deep_read": null
}
```

**Error (400):**

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "session_id, request_text, and working_dir are required"
  }
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/context-pack \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_abc123",
    "request_text": "fix the auth bug in login handler",
    "working_dir": "/path/to/repo/src/auth",
    "touched_files": ["src/auth/login.ts"],
    "budget_tokens": 4000
  }'
```

### GET /context-pack/preview

Preview a Context Pack without recording an event. Useful for testing and tuning.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | string | yes | The request text |
| `cwd` | string | yes | Working directory |
| `budget` | number | no | Token budget (default: 4000) |

**Response (200):** Same structure as `POST /context-pack` with `event_id: null`.

**Example:**

```bash
curl "http://localhost:3742/api/v1/context-pack/preview?request=fix%20auth%20bug&cwd=/path/to/repo/src/auth&budget=4000"
```

---

## Sessions

### POST /sessions

Create a new agent session.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | yes | Absolute path to the repository root |
| `working_dir` | string | yes | Working directory for this session |
| `branch` | string | no | Git branch name |
| `agent_id` | string | no | Agent identifier (e.g., "claude", "copilot") |
| `agent_config` | object | no | Agent-specific configuration |

**Response (201):**

```json
{
  "id": "sess_abc123",
  "status": "active",
  "started_at": "2026-03-01T10:30:00.000Z"
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "repo_path": "/path/to/repo",
    "working_dir": "/path/to/repo/src/auth",
    "branch": "main",
    "agent_id": "claude"
  }'
```

### GET /sessions

List sessions with optional filters.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | no | Filter by status (`active` or `completed`) |
| `repo_path` | string | no | Filter by repository path |
| `limit` | number | no | Maximum results (default: 20) |
| `offset` | number | no | Pagination offset (default: 0) |

**Response (200):**

```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "repo_path": "/path/to/repo",
      "working_dir": "/path/to/repo/src/auth",
      "branch": "main",
      "agent_id": "claude",
      "status": "active",
      "started_at": "2026-03-01T10:30:00.000Z",
      "ended_at": null,
      "request_count": 3
    }
  ],
  "total": 1
}
```

**Example:**

```bash
curl "http://localhost:3742/api/v1/sessions?status=active&limit=10"
```

### GET /sessions/:id

Get details for a specific session, including its event timeline.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Session identifier |

**Response (200):**

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

**Error (404):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Session not found"
  }
}
```

**Example:**

```bash
curl http://localhost:3742/api/v1/sessions/sess_abc123
```

### PATCH /sessions/:id

End a session by setting its status to `completed`.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Session identifier |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | yes | Must be `"completed"` |

**Response (200):**

```json
{
  "id": "sess_abc123",
  "status": "completed",
  "ended_at": "2026-03-01T11:00:00.000Z"
}
```

**Error (400):**

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Only status \"completed\" is supported"
  }
}
```

**Example:**

```bash
curl -X PATCH http://localhost:3742/api/v1/sessions/sess_abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

---

## Events

### POST /sessions/:id/events

Log a tool event to a session's timeline. Use this to record individual tool invocations, shell commands, or other discrete actions performed during a session.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Session identifier |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_type` | string | yes | Type of event (e.g., `"tool_call"`, `"shell"`, `"file_edit"`) |
| `session_id` | string | yes | Session ID (must match the path parameter) |
| `tool_name` | string | yes | Name of the tool or command that was invoked |
| `tool_input` | object | no | Input parameters passed to the tool |
| `tool_response` | string | no | Output or response from the tool |
| `exit_code` | number | no | Exit code (for shell commands) |
| `duration_ms` | number | no | Duration of the tool execution in milliseconds |

**Response (201):**

```json
{
  "id": "evt_abc123",
  "created_at": "2026-03-01T10:31:00.000Z"
}
```

**Error (404):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Session not found"
  }
}
```

**Error (400):**

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "event_type, session_id, and tool_name are required"
  }
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/sessions/sess_abc123/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "tool_call",
    "session_id": "sess_abc123",
    "tool_name": "file_read",
    "tool_input": {"path": "src/auth/login.ts"},
    "tool_response": "export function login(user: string, pass: string) { ... }",
    "exit_code": 0,
    "duration_ms": 12
  }'
```

---

## Proposals

### POST /proposals

Create a new `.ctx` update proposal.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ctx_path` | string | yes | Path to the `.ctx` file being modified |
| `diff_content` | string | yes | Unified diff showing proposed changes |
| `provenance` | string | yes | Why this change is being proposed |
| `session_id` | string | no | Session that triggered this proposal |
| `event_id` | string | no | Request event that triggered this proposal |

**Response (201):**

```json
{
  "id": "prop_abc123",
  "status": "proposed",
  "created_at": "2026-03-01T10:35:00.000Z"
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_abc123",
    "ctx_path": "src/auth/.ctx",
    "diff_content": "--- a/src/auth/.ctx\n+++ b/src/auth/.ctx\n@@ -5,7 +5,7 @@\n key_files:\n-  - path: login.ts\n+  - path: sign-in.ts\n",
    "provenance": "drift-detection: file_renamed"
  }'
```

### GET /proposals

List proposals with optional filters.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | no | Filter by status (`proposed`, `approved`, `rejected`, `applied`) |
| `ctx_path` | string | no | Filter by `.ctx` file path |
| `limit` | number | no | Maximum results |
| `offset` | number | no | Pagination offset |

**Response (200):**

```json
{
  "proposals": [
    {
      "id": "prop_abc123",
      "ctx_path": "src/auth/.ctx",
      "status": "proposed",
      "provenance": "drift-detection: file_renamed",
      "created_at": "2026-03-01T10:35:00.000Z"
    }
  ],
  "total": 1
}
```

**Example:**

```bash
curl "http://localhost:3742/api/v1/proposals?status=proposed&ctx_path=src/auth/.ctx"
```

### PATCH /proposals/:id

Approve or reject a proposal. Optionally provide an edited diff.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Proposal identifier |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | yes | Must be `"approved"` or `"rejected"` |
| `edited_diff` | string | no | Modified diff content (if the user edited the proposal) |

**Response (200):**

```json
{
  "id": "prop_abc123",
  "status": "approved",
  "resolved_at": "2026-03-01T10:40:00.000Z"
}
```

**Error (409):**

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Cannot change status from \"approved\" to \"rejected\""
  }
}
```

**Example:**

```bash
# Approve
curl -X PATCH http://localhost:3742/api/v1/proposals/prop_abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'

# Approve with edits
curl -X PATCH http://localhost:3742/api/v1/proposals/prop_abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "edited_diff": "--- a/.ctx\n+++ b/.ctx\n..."
  }'

# Reject
curl -X PATCH http://localhost:3742/api/v1/proposals/prop_abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "rejected"}'
```

### POST /proposals/:id/apply

Apply an approved proposal, writing the change to the `.ctx` file.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Proposal identifier |

**Precondition:** The proposal must have status `"approved"`.

**Response (200):**

```json
{
  "id": "prop_abc123",
  "status": "applied",
  "audit_id": "aud_def456"
}
```

**Error (409):**

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Proposal must be \"approved\" before applying, current status: \"proposed\""
  }
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/proposals/prop_abc123/apply
```

---

## Config

### GET /config

Get the effective workspace configuration. Returns the fully merged configuration profile that applies for the given working directory, including defaults, workspace-level overrides, and user-level overrides.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cwd` | string | no | Working directory for workspace-scoped configuration resolution. If omitted, returns the global default configuration. |

**Response (200):**

```json
{
  "budget_tokens": 4000,
  "deep_read_enabled": true,
  "drift_check_interval": 3600,
  "auto_propose": false,
  "ignored_paths": ["node_modules", ".git", "dist"],
  "tag_weights": {
    "auth": 1.5,
    "testing": 1.0
  },
  "agent_profiles": {
    "claude": {
      "budget_tokens": 8000
    }
  }
}
```

**Example:**

```bash
# Get global default configuration
curl http://localhost:3742/api/v1/config

# Get workspace-scoped configuration
curl "http://localhost:3742/api/v1/config?cwd=/path/to/repo/src/auth"
```

### POST /config/validate

Validate a configuration object without applying it. Returns whether the configuration is valid and any validation errors.

**Request Body:**

A configuration object to validate. The object may contain any subset of the configuration fields.

**Response (200) -- valid:**

```json
{
  "valid": true
}
```

**Response (200) -- invalid:**

```json
{
  "valid": false,
  "errors": [
    "budget_tokens must be a positive integer",
    "unknown field: invalid_key"
  ]
}
```

**Example:**

```bash
# Validate a configuration object
curl -X POST http://localhost:3742/api/v1/config/validate \
  -H "Content-Type: application/json" \
  -d '{
    "budget_tokens": 8000,
    "deep_read_enabled": true,
    "invalid_key": "test"
  }'
```

---

## Memory

### GET /memory/search

Search `.ctx` entries by keyword. Performs a text search across all `.ctx` files in the workspace and returns matching entries ranked by relevance.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search text to match against `.ctx` entry content |
| `cwd` | string | no | Working directory to scope the search. If omitted, searches across all known `.ctx` files. |
| `limit` | number | no | Maximum number of results to return (default: 20) |

**Response (200):**

```json
{
  "results": [
    {
      "source": "src/auth/.ctx",
      "section": "contracts",
      "content": "All endpoints must validate JWT tokens before processing requests",
      "score": 0.92,
      "tags": ["auth", "security"]
    },
    {
      "source": "src/auth/.ctx",
      "section": "key_files",
      "content": "login.ts: Handles user authentication flow",
      "score": 0.75,
      "tags": ["auth"]
    }
  ],
  "total": 2
}
```

**Error (400):**

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "query parameter is required"
  }
}
```

**Example:**

```bash
# Search for auth-related entries
curl "http://localhost:3742/api/v1/memory/search?query=authentication&limit=10"

# Search within a specific workspace
curl "http://localhost:3742/api/v1/memory/search?query=JWT%20token&cwd=/path/to/repo/src/auth"

# Broad search with default limit
curl "http://localhost:3742/api/v1/memory/search?query=database%20migration"
```

---

## Drift

### GET /drift

Check `.ctx` files for stale references and drift.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo_root` | string | yes | Absolute path to the repository root |
| `ctx_path` | string | no | Specific `.ctx` file to check (relative to repo_root). If omitted, checks all `.ctx` files. |

**Response (200):**

```json
{
  "results": [
    {
      "ctx_path": "src/auth/.ctx",
      "stale_entries": [
        {
          "section": "key_files",
          "entry_id": "login.ts",
          "verified_at": "abc1234",
          "current_commit": "def5678",
          "reason": "file_deleted",
          "details": "File src/auth/login.ts no longer exists"
        }
      ],
      "total_stale": 1
    }
  ]
}
```

**Example:**

```bash
# Check all .ctx files
curl "http://localhost:3742/api/v1/drift?repo_root=/path/to/repo"

# Check a specific file
curl "http://localhost:3742/api/v1/drift?repo_root=/path/to/repo&ctx_path=src/auth/.ctx"
```

---

## Audit

### GET /audit

Query the audit log of `.ctx` file changes.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx_path` | string | no | Filter by `.ctx` file path |
| `from` | string | no | Start of date range (ISO 8601) |
| `to` | string | no | End of date range (ISO 8601) |
| `limit` | number | no | Maximum results |

**Response (200):**

```json
{
  "entries": [
    {
      "id": "aud_def456",
      "ctx_path": "src/auth/.ctx",
      "change_type": "update",
      "diff_content": "--- a/src/auth/.ctx\n+++ b/src/auth/.ctx\n...",
      "initiated_by": "sess_abc123",
      "reason": "Applied proposal prop_abc123",
      "created_at": "2026-03-01T10:45:00.000Z"
    }
  ],
  "total": 1
}
```

**Example:**

```bash
# Recent audit entries
curl "http://localhost:3742/api/v1/audit?limit=50"

# Filter by file path
curl "http://localhost:3742/api/v1/audit?ctx_path=src/auth/.ctx"

# Filter by date range
curl "http://localhost:3742/api/v1/audit?from=2026-03-01T00:00:00Z&to=2026-03-02T00:00:00Z"
```

---

## Index

### GET /index

Get the current `.ctxl` index contents.

**Response (200):**

```json
{
  "version": 2,
  "generated_at": "2026-03-15T10:00:00.000Z",
  "entries": [
    {
      "path": ".ctx",
      "summary": "Root project context",
      "tags": ["typescript", "monorepo"],
      "depth": 0,
      "ctx_version": 2,
      "last_modified": "2026-03-14T08:30:00.000Z",
      "checksum": "sha256:a1b2c3d4e5f6...",
      "dependencies": {
        "depends_on": [],
        "depended_by": ["src/auth/.ctx", "src/db/.ctx"]
      },
      "weight": 1.0,
      "sections": ["key_files", "contracts", "decisions", "gotchas"],
      "token_estimate": 1200
    }
  ],
  "total": 12
}
```

**Example:**

```bash
curl http://localhost:3742/api/v1/index
```

### POST /index

Generate or regenerate the `.ctxl` index from all `.ctx` files.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_root` | string | yes | Absolute path to the repository root |

**Response (200):**

```json
{
  "entries_count": 12,
  "generated_at": "2026-03-15T10:00:00.000Z",
  "total_tokens": 14200
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/index \
  -H "Content-Type: application/json" \
  -d '{"repo_root": "/path/to/repo"}'
```

### POST /index/select

Select `.ctx` files matching criteria from the index.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tags` | string[] | no | Tags to match |
| `path_prefix` | string | no | Path prefix filter |
| `budget_tokens` | number | no | Maximum token budget |

**Response (200):**

```json
{
  "selected": [
    {
      "path": "src/auth/.ctx",
      "summary": "Auth module context",
      "tags": ["auth", "security", "jwt"],
      "token_estimate": 800,
      "score": 0.92
    }
  ],
  "total_tokens": 800
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/index/select \
  -H "Content-Type: application/json" \
  -d '{"tags": ["auth", "security"], "budget_tokens": 2000}'
```

---

## History

### GET /history/:path

Get the version history for a `.ctx` file.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `path` | URL-encoded relative path to the `.ctx` file |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `all` | boolean | no | Include archived entries (default: false) |
| `from_version` | number | no | Start of version range |
| `to_version` | number | no | End of version range |

**Response (200):**

```json
{
  "ctx_path": "src/auth/.ctx",
  "ctx_version": 7,
  "entries": [
    {
      "version": 7,
      "timestamp": "2026-03-15T10:30:00.000Z",
      "author": "claude:sess_abc123",
      "session_id": "sess_abc123",
      "reason": "Added new key_file for refactored handler",
      "checksum": "sha256:f6e5d4c3b2a1...",
      "diff_summary": "+key_files/sign-in.ts, ~summary"
    }
  ],
  "total": 7,
  "has_archive": true
}
```

**Example:**

```bash
# Get inline history
curl "http://localhost:3742/api/v1/history/src%2Fauth%2F.ctx"

# Get full history including archive
curl "http://localhost:3742/api/v1/history/src%2Fauth%2F.ctx?all=true"
```

---

## Conflicts

### GET /conflicts

List all `.ctx` files with unresolved conflicts.

**Response (200):**

```json
{
  "files": [
    {
      "ctx_path": "src/auth/.ctx",
      "conflict_count": 1,
      "conflicts": [
        {
          "section": "summary",
          "ours": "Auth module handling login and registration",
          "theirs": "Auth module handling login, registration, and MFA",
          "base": "Auth module handling login",
          "created_at": "2026-03-15T10:35:00.000Z",
          "session_ours": "sess_001",
          "session_theirs": "sess_002"
        }
      ]
    }
  ],
  "total_conflicts": 1
}
```

**Example:**

```bash
curl http://localhost:3742/api/v1/conflicts
```

### POST /conflicts

Check for conflicts in a specific `.ctx` file by performing a three-way merge check.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ctx_path` | string | yes | Path to the `.ctx` file to check |
| `base_content` | string | yes | Base version content |
| `proposed_content` | string | yes | Proposed new content |

**Response (200):**

```json
{
  "has_conflicts": false,
  "merged_content": "...",
  "conflicts": []
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/conflicts \
  -H "Content-Type: application/json" \
  -d '{
    "ctx_path": "src/auth/.ctx",
    "base_content": "version: 2\nsummary: Auth module...",
    "proposed_content": "version: 2\nsummary: Updated auth module..."
  }'
```

### POST /conflicts/resolve

Resolve conflicts in a `.ctx` file by picking a side.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ctx_path` | string | yes | Path to the `.ctx` file |
| `pick` | string | yes | Side to pick: `"ours"` or `"theirs"` |

**Response (200):**

```json
{
  "ctx_path": "src/auth/.ctx",
  "resolved_count": 1,
  "new_version": 8
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/conflicts/resolve \
  -H "Content-Type: application/json" \
  -d '{"ctx_path": "src/auth/.ctx", "pick": "ours"}'
```

---

## Activity

### GET /activity

Get recent activity events across all sessions and operations.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Maximum results (default: 50) |
| `types` | string | no | Comma-separated event types filter |
| `since` | string | no | ISO 8601 timestamp to filter from |

**Response (200):**

```json
{
  "events": [
    {
      "id": "act_001",
      "type": "ctx_modified",
      "ctx_path": "src/auth/.ctx",
      "summary": "Added key_file mfa.ts",
      "session_id": "sess_abc123",
      "timestamp": "2026-03-15T10:30:00.000Z"
    },
    {
      "id": "act_002",
      "type": "proposal_created",
      "ctx_path": "src/db/.ctx",
      "summary": "Auto-update proposal for stale entries",
      "session_id": "sess_def456",
      "timestamp": "2026-03-15T10:28:00.000Z"
    }
  ],
  "total": 2
}
```

**Example:**

```bash
curl "http://localhost:3742/api/v1/activity?limit=20&types=ctx_modified,proposal_created"
```

### GET /activity/stream

Real-time activity feed using Server-Sent Events (SSE).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `types` | string | no | Comma-separated event types filter |

**Response:** SSE stream with `text/event-stream` content type.

```
event: ctx_modified
data: {"id":"act_003","type":"ctx_modified","ctx_path":"src/auth/.ctx","summary":"Version bumped to 8","timestamp":"2026-03-15T10:31:00.000Z"}

event: proposal_applied
data: {"id":"act_004","type":"proposal_applied","ctx_path":"src/db/.ctx","summary":"Applied auto-update proposal","timestamp":"2026-03-15T10:31:05.000Z"}
```

**Example:**

```bash
curl -N http://localhost:3742/api/v1/activity/stream
```

---

## Bootstrap

### POST /bootstrap

Analyze a repository and generate `.ctx` file proposals.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_root` | string | yes | Absolute path to the repository root |
| `mode` | string | no | Analysis mode: `"quick"` or `"full"` (default: `"quick"`) |
| `skip_existing` | boolean | no | Skip directories with existing `.ctx` files (default: false) |
| `min_files` | number | no | Minimum source files threshold (default: 3) |
| `dry_run` | boolean | no | Preview without writing (default: false) |

**Response (200):**

```json
{
  "proposals": [
    {
      "ctx_path": ".ctx",
      "summary": "TypeScript monorepo for context memory system",
      "key_files_count": 5,
      "contracts_count": 0,
      "tags": ["typescript", "monorepo"]
    },
    {
      "ctx_path": "src/auth/.ctx",
      "summary": "Authentication and authorization module",
      "key_files_count": 3,
      "contracts_count": 2,
      "tags": ["auth", "security", "jwt"]
    }
  ],
  "applied": true,
  "index_generated": true,
  "total_files": 8
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "repo_root": "/path/to/repo",
    "mode": "full",
    "skip_existing": true
  }'
```

---

## Spec-Kit

### POST /speckit/import

Import Spec-Kit documents into `.ctx` files.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_path` | string | yes | Path to the Spec-Kit document or directory |
| `target_dir` | string | no | Target directory for generated `.ctx` files |
| `dry_run` | boolean | no | Preview without writing (default: false) |

**Response (200):**

```json
{
  "imported": {
    "decisions": 5,
    "contracts": 3,
    "gotchas": 2
  },
  "files_created": 2,
  "files_updated": 1,
  "applied": true
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/speckit/import \
  -H "Content-Type: application/json" \
  -d '{"source_path": "/path/to/constitution.yaml"}'
```

### POST /speckit/validate

Validate `.ctx` files against a Spec-Kit constitution.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `constitution_path` | string | yes | Path to the constitution document |
| `strict` | boolean | no | Treat SHOULD violations as errors (default: false) |

**Response (200):**

```json
{
  "valid": true,
  "files_checked": 12,
  "principles_checked": 8,
  "violations": []
}
```

**Response (200, with violations):**

```json
{
  "valid": false,
  "files_checked": 12,
  "principles_checked": 8,
  "violations": [
    {
      "ctx_path": "src/auth/.ctx",
      "clause_id": "CONST-003",
      "clause_text": "All endpoints SHALL implement rate limiting",
      "reason": "No matching contract found in scope"
    }
  ]
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/speckit/validate \
  -H "Content-Type: application/json" \
  -d '{"constitution_path": "/path/to/constitution.yaml", "strict": true}'
```

### POST /speckit/sync

Bidirectional sync between `.ctx` files and Spec-Kit documents.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_path` | string | yes | Path to Spec-Kit documents directory |
| `direction` | string | no | Sync direction: `"spec-to-ctx"`, `"ctx-to-spec"`, or `"both"` (default: `"both"`) |
| `pick` | string | no | Resolve conflicts: `"spec"` or `"ctx"` |
| `dry_run` | boolean | no | Preview without writing (default: false) |

**Response (200):**

```json
{
  "ctx_updates": 1,
  "spec_updates": 1,
  "conflicts": 1,
  "applied": true
}
```

**Example:**

```bash
curl -X POST http://localhost:3742/api/v1/speckit/sync \
  -H "Content-Type: application/json" \
  -d '{"source_path": "/path/to/specs/", "direction": "both"}'
```

---

## PR Context

### POST /pr-context/generate

Generate a pull request description from session data.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `branch` | string | no | Branch name (default: current branch) |
| `session_id` | string | no | Specific session ID (default: auto-detected) |
| `format` | string | no | Output format: `"md"`, `"json"`, or `"gh"` (default: `"md"`) |

**Response (200, format=json):**

```json
{
  "summary": "Refactored the authentication module to support MFA.",
  "prompt_chain": [
    {
      "index": 1,
      "text": "Add multi-factor authentication support to the login flow",
      "timestamp": "2026-03-15T10:00:00.000Z"
    }
  ],
  "decisions": [
    {
      "description": "Used otplib for TOTP generation",
      "rationale": "lightweight, no native dependencies"
    }
  ],
  "file_changes": [
    {
      "path": "src/auth/mfa.ts",
      "action": "created",
      "lines_added": 142,
      "lines_removed": 0
    }
  ],
  "context_used": [
    {
      "source": "src/auth/.ctx",
      "section": "contracts",
      "entry_id": "auth-security",
      "score": 0.95,
      "reason_codes": ["CONTRACT_REQUIRED"]
    }
  ],
  "stats": {
    "session_id": "sess_abc123",
    "duration_seconds": 720,
    "request_count": 3,
    "tokens_used": 8420,
    "tokens_budget": 12000,
    "files_changed": 4,
    "ctx_files_updated": 1
  }
}
```

**Response (200, format=md or format=gh):**

```json
{
  "content": "## Summary\n\nRefactored the authentication module...\n\n## Prompt Chain\n\n1. ...",
  "format": "md"
}
```

**Example:**

```bash
# Generate markdown PR context
curl -X POST http://localhost:3742/api/v1/pr-context/generate \
  -H "Content-Type: application/json" \
  -d '{"branch": "feature/auth-refactor", "format": "md"}'

# Generate GitHub PR body
curl -X POST http://localhost:3742/api/v1/pr-context/generate \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess_abc123", "format": "gh"}'
```
