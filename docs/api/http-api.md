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
