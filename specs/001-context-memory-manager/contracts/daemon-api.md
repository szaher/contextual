# Daemon API Contract v1

**Base URL**: `http://localhost:3742/api/v1`
**Transport**: HTTP/JSON (local only, no TLS)
**Auth**: None (localhost binding only)

---

## Sessions

### POST /sessions

Create a new agent session.

**Request**:
```json
{
  "repo_path": "/path/to/repo",
  "working_dir": "/path/to/repo/src/auth",
  "branch": "main",
  "agent_id": "claude",
  "agent_config": {
    "budget_tokens": 8000
  }
}
```

**Response** `201`:
```json
{
  "id": "sess_abc123",
  "status": "active",
  "started_at": "2026-02-28T10:00:00Z"
}
```

### GET /sessions

List sessions.

**Query params**: `?status=active&repo_path=/path&limit=50&offset=0`

**Response** `200`:
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
      "request_count": 3,
      "started_at": "2026-02-28T10:00:00Z",
      "ended_at": null
    }
  ],
  "total": 1
}
```

### GET /sessions/:id

Get session details with timeline.

**Response** `200`:
```json
{
  "id": "sess_abc123",
  "repo_path": "/path/to/repo",
  "working_dir": "/path/to/repo/src/auth",
  "branch": "main",
  "agent_id": "claude",
  "status": "active",
  "started_at": "2026-02-28T10:00:00Z",
  "events": [
    {
      "id": "evt_001",
      "request_text": "fix the auth bug",
      "token_count": 2340,
      "budget": 4000,
      "deep_read": null,
      "created_at": "2026-02-28T10:01:00Z"
    }
  ]
}
```

### PATCH /sessions/:id

End a session.

**Request**:
```json
{
  "status": "completed"
}
```

---

## Context Pack

### POST /context-pack

Build a Context Pack for a request.

**Request**:
```json
{
  "session_id": "sess_abc123",
  "request_text": "fix the auth bug in login handler",
  "working_dir": "/path/to/repo/src/auth",
  "touched_files": ["src/auth/handler.ts"],
  "budget_tokens": 4000
}
```

**Response** `200`:
```json
{
  "event_id": "evt_001",
  "pack": {
    "version": 1,
    "items": [
      {
        "content": "Auth API Contract: All auth endpoints...",
        "source": "src/auth/.ctx",
        "section": "contracts",
        "entry_id": "Auth API Contract",
        "score": 0.95,
        "tokens": 120,
        "reason_codes": ["LOCALITY_HIGH", "CONTRACT_REQUIRED"],
        "staleness": {
          "verified_at": "abc1234",
          "is_stale": false
        }
      }
    ],
    "omitted": [
      {
        "content_preview": "Database connection pooling...",
        "source": ".ctx",
        "section": "gotchas",
        "score": 0.22,
        "tokens": 80,
        "reason": "BUDGET_EXCEEDED"
      }
    ],
    "total_tokens": 2340,
    "budget_tokens": 4000,
    "budget_used_pct": 58.5
  },
  "deep_read": null
}
```

### GET /context-pack/preview

Preview without recording an event.

**Query params**: `?request=fix+auth+bug&cwd=/path&budget=4000`

**Response**: Same structure as POST, but `event_id` is null.

---

## Memory Diffs (Proposals)

### POST /proposals

Create a .ctx update proposal.

**Request**:
```json
{
  "session_id": "sess_abc123",
  "event_id": "evt_001",
  "ctx_path": "src/auth/.ctx",
  "diff_content": "--- a/src/auth/.ctx\n+++ b/src/auth/.ctx\n@@ ...",
  "provenance": {
    "source_file": "src/auth/handler.ts",
    "commit": "def4567",
    "trigger": "symbol_renamed"
  }
}
```

**Response** `201`:
```json
{
  "id": "diff_001",
  "status": "proposed",
  "created_at": "2026-02-28T10:02:00Z"
}
```

### GET /proposals

List proposals.

**Query params**: `?status=proposed&ctx_path=src/auth/.ctx`

### PATCH /proposals/:id

Approve, reject, or edit a proposal.

**Request**:
```json
{
  "status": "approved",
  "edited_diff": null
}
```

**Response** `200`:
```json
{
  "id": "diff_001",
  "status": "approved",
  "resolved_at": "2026-02-28T10:03:00Z"
}
```

### POST /proposals/:id/apply

Apply an approved proposal to the .ctx file.

**Response** `200`:
```json
{
  "id": "diff_001",
  "status": "applied",
  "audit_id": "aud_001"
}
```

---

## Drift Detection

### GET /drift

Check drift for .ctx files.

**Query params**: `?ctx_path=src/auth/.ctx` (optional; all if omitted)

**Response** `200`:
```json
{
  "results": [
    {
      "ctx_path": "src/auth/.ctx",
      "stale_entries": [
        {
          "section": "key_files",
          "entry_id": "src/auth/login.ts",
          "verified_at": "abc1234",
          "current_commit": "ghi7890",
          "reason": "file_renamed",
          "details": "renamed to src/auth/sign-in.ts"
        }
      ],
      "total_stale": 1
    }
  ]
}
```

---

## Audit Log

### GET /audit

Query the audit log.

**Query params**:
`?ctx_path=src/auth/.ctx&from=2026-02-01&to=2026-02-28&limit=50`

**Response** `200`:
```json
{
  "entries": [
    {
      "id": "aud_001",
      "ctx_path": "src/auth/.ctx",
      "change_type": "update",
      "diff_content": "--- a/...\n+++ b/...",
      "initiated_by": "sess_abc123",
      "reason": "symbol_renamed: loginHandler → signInHandler",
      "created_at": "2026-02-28T10:03:00Z"
    }
  ],
  "total": 1
}
```

---

## Health

### GET /health

**Response** `200`:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime_seconds": 3600,
  "active_sessions": 2,
  "db_size_bytes": 1048576
}
```

---

## Error Format

All errors return:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Session sess_xyz not found"
  }
}
```

**Error codes**: `BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`,
`LOCKED`, `INTERNAL_ERROR`

---

## CLI Commands → API Mapping

| CLI Command | API Call |
|-------------|----------|
| `ctxkit inject --request "..." --cwd "..."` | POST /context-pack |
| `ctxkit inject --preview --request "..."` | GET /context-pack/preview |
| `ctxkit sessions` | GET /sessions |
| `ctxkit sessions show <id>` | GET /sessions/:id |
| `ctxkit propose --ctx "..." --diff "..."` | POST /proposals |
| `ctxkit apply <id>` | POST /proposals/:id/apply |
| `ctxkit drift [path]` | GET /drift |
| `ctxkit init [path]` | (local, no API) |
| `ctxkit validate [path]` | (local, no API) |
| `ctxkit run -- <cmd>` | POST /sessions + wrapper logic |
