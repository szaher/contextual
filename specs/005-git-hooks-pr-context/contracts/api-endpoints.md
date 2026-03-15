# API Endpoint Contracts: Commit Context

Base path: `/api/v1`

## GET `/commit-context`

Query commits with ctxkit trailers from git history.

**Query parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cwd` | string | required | Repository root path |
| `session_id` | string | optional | Filter by session ID |
| `since` | ISO 8601 | optional | Commits after this date |
| `until` | ISO 8601 | optional | Commits before this date |
| `limit` | number | 50 | Max commits to return |
| `has_trailers` | boolean | true | Only return commits with ctxkit trailers |

**Response 200**:
```json
{
  "commits": [
    {
      "hash": "a1b2c3d4e5f6...",
      "subject": "fix: update auth flow",
      "author": "Jane Dev <jane@example.com>",
      "date": "2026-03-15T14:30:00Z",
      "trailers": {
        "session_id": "sess_7d2f4a1b",
        "files": ["src/auth/.ctx", "src/auth/oauth/.ctx"],
        "entries": 3,
        "timestamp": "2026-03-15T14:30:00Z"
      }
    }
  ],
  "total": 42,
  "has_more": false
}
```

**Response 400**: `{ "error": { "code": "BAD_REQUEST", "message": "cwd is required" } }`

---

## GET `/commit-context/:hash`

Get parsed trailer details for a specific commit.

**Response 200**:
```json
{
  "hash": "a1b2c3d4e5f6...",
  "subject": "fix: update auth flow",
  "author": "Jane Dev <jane@example.com>",
  "date": "2026-03-15T14:30:00Z",
  "body": "Full commit message body...",
  "trailers": {
    "session_id": "sess_7d2f4a1b",
    "files": ["src/auth/.ctx", "src/auth/oauth/.ctx"],
    "entries": 3,
    "timestamp": "2026-03-15T14:30:00Z"
  },
  "session": {
    "id": "sess_7d2f4a1b",
    "status": "completed",
    "started_at": "2026-03-15T13:00:00Z",
    "ended_at": "2026-03-15T15:00:00Z"
  }
}
```

**Response 404**: `{ "error": { "code": "NOT_FOUND", "message": "Commit not found or has no ctxkit trailers" } }`

---

## GET `/hooks/status`

Check hook installation status for a repository.

**Query parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cwd` | string | required | Repository root path |

**Response 200**:
```json
{
  "prepare_commit_msg": { "status": "installed", "version": "0.2.0", "chained": false },
  "pre_commit": { "status": "installed", "version": "0.2.0" },
  "post_commit": { "status": "installed", "version": "0.2.0" },
  "other_hooks": ["commit-msg"]
}
```
