# Daemon API Contracts: ctxl v2

**Branch**: `004-ctxl-v2` | **Date**: 2026-03-15

All endpoints are under `/api/v1/`. The daemon binds to `127.0.0.1:3742`.

---

## Index Endpoints

### POST /api/v1/index/generate

Generate or regenerate the .ctxl index.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "force": false
}
```

**Response 200**:
```json
{
  "index_path": "/path/to/repo/.ctxl",
  "entries_count": 12,
  "total_tokens": 8400,
  "dependencies_found": 5,
  "generated_at": "2026-03-15T10:30:00Z"
}
```

**Response 400**: `{ "error": { "code": "BAD_REQUEST", "message": "repo_root is required" } }`

### POST /api/v1/index/select

Select .ctx files for a task.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "prompt": "Fix authentication bug",
  "cwd": "/path/to/repo/src/auth",
  "budget_tokens": 4000,
  "touched_files": ["src/auth/middleware.ts"],
  "pinned": [],
  "excluded": []
}
```

**Response 200**:
```json
{
  "selected": [ ... ScoredEntry[] ... ],
  "omitted": [ ... OmittedEntry[] ... ],
  "budget_used": { "contracts": 200, "local_ctx": 1200, "related_ctx": 800, "history": 300, "reserve": 0, "total": 2500 }
}
```

### GET /api/v1/index

Read the current .ctxl index.

**Query params**: `repo_root` (required)

**Response 200**: Full CtxlIndex object
**Response 404**: `{ "error": { "code": "NOT_FOUND", "message": "No .ctxl index found" } }`

---

## History Endpoints

### GET /api/v1/history

Get version history for a .ctx file.

**Query params**:
- `ctx_path` (required): Path to .ctx file
- `repo_root` (required): Repository root
- `count` (optional, default 20): Number of entries
- `include_archived` (optional, default false): Include archived entries

**Response 200**:
```json
{
  "path": "src/auth/.ctx",
  "current_version": 8,
  "entries": [ ... HistoryEntry[] ... ],
  "has_more": true
}
```

### GET /api/v1/history/diff

Get diff between two versions.

**Query params**:
- `ctx_path` (required): Path to .ctx file
- `repo_root` (required): Repository root
- `from_version` (required): Starting version
- `to_version` (required): Ending version

**Response 200**:
```json
{
  "from_version": 5,
  "to_version": 8,
  "sections": [
    { "section": "key_files", "type": "added", "entries": ["src/auth/jwt.ts"] },
    { "section": "contracts", "type": "modified", "entries": ["auth-policy"] }
  ],
  "summary": "+1 key_file, ~1 contract"
}
```

---

## Conflict Endpoints

### GET /api/v1/conflicts

List all files with unresolved conflicts.

**Query params**: `repo_root` (required)

**Response 200**:
```json
{
  "files": [
    {
      "path": "src/auth/.ctx",
      "conflict_count": 2,
      "conflicts": [
        { "section": "contracts", "key": "auth-policy", "ours_author": "agent:opus", "theirs_author": "agent:sonnet" }
      ]
    }
  ],
  "total_conflicts": 2
}
```

### POST /api/v1/conflicts/resolve

Resolve a specific conflict.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "ctx_path": "src/auth/.ctx",
  "section": "contracts",
  "key": "auth-policy",
  "choice": "pick_ours",
  "author": "developer:szaher"
}
```

**Response 200**:
```json
{
  "resolved": true,
  "new_version": 10,
  "remaining_conflicts": 1
}
```

**Response 400**: Invalid choice or missing required fields
**Response 404**: Conflict not found

---

## Bootstrap Endpoints

### POST /api/v1/bootstrap/analyze

Analyze a directory and generate .ctx proposals.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "target_path": "src/auth",
  "mode": "quick",
  "skip_existing": true,
  "min_files": 3
}
```

**Response 200**:
```json
{
  "proposals": [ ... BootstrapProposal[] ... ],
  "skipped": [ { "path": "...", "reason": "..." } ]
}
```

### POST /api/v1/bootstrap/apply

Apply bootstrap proposals (write .ctx files).

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "proposals": [ ... BootstrapProposal[] ... ]
}
```

**Response 200**:
```json
{
  "written": ["src/auth/.ctx", "src/api/.ctx"],
  "index_updated": true
}
```

---

## Activity Endpoints

### GET /api/v1/activity

Get activity events.

**Query params**:
- `session_id` (optional): Filter by session
- `event_type` (optional): Filter by event type
- `ctx_path` (optional): Filter by .ctx path
- `limit` (optional, default 50): Max events to return
- `offset` (optional, default 0): Pagination offset

**Response 200**:
```json
{
  "events": [ ... ActivityEvent[] ... ],
  "total": 150,
  "has_more": true
}
```

### POST /api/v1/activity

Record an activity event.

**Request body**:
```json
{
  "session_id": "sess_abc123",
  "event_type": "SELECT",
  "ctx_path": "src/auth/.ctx",
  "agent_id": "agent:claude-opus",
  "details": { "score": 0.92, "reason": "TAG_MATCH" }
}
```

**Response 201**:
```json
{
  "id": "evt_xyz789",
  "created_at": "2026-03-15T10:30:00Z"
}
```

### GET /api/v1/activity/stream

Server-Sent Events stream for real-time activity.

**Query params**:
- `session_id` (optional): Filter by session
- `event_type` (optional): Filter by event type

**Response**: SSE stream
```
event: activity
data: {"id":"evt_xyz","event_type":"SELECT","ctx_path":"src/auth/.ctx","created_at":"..."}

event: activity
data: {"id":"evt_abc","event_type":"STALE","ctx_path":"src/api/.ctx","created_at":"..."}
```

---

## PR Context Endpoints

### POST /api/v1/pr-context/generate

Generate a PR context document.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "session_ids": ["sess_abc", "sess_def"],
  "git_range": "main..HEAD",
  "format": "markdown",
  "link_specs": false
}
```

**Response 200**:
```json
{
  "format": "markdown",
  "content": "## Change Context\n...",
  "stats": { "total_prompts": 4, "total_tool_calls": 19, "files_changed_count": 3 }
}
```

---

## Spec-Kit Bridge Endpoints

### POST /api/v1/speckit/import

Import spec-kit artifacts into .ctx files.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "constitution_path": ".specify/memory/constitution.md",
  "specs_dir": "specs/",
  "dry_run": false
}
```

**Response 200**:
```json
{
  "imported": {
    "decisions": 4,
    "contracts": 8,
    "gotchas": 3
  },
  "files_updated": ["root/.ctx", "src/auth/.ctx"]
}
```

### POST /api/v1/speckit/export

Export .ctx content to spec-kit format.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "output_dir": "specs/exported/",
  "format": "md"
}
```

**Response 200**:
```json
{
  "exported_files": ["specs/exported/auth.md", "specs/exported/api.md"]
}
```

### POST /api/v1/speckit/validate

Validate .ctx files against constitution.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "constitution_path": ".specify/memory/constitution.md"
}
```

**Response 200**:
```json
{
  "valid": false,
  "violations": [
    {
      "ctx_path": "src/auth/.ctx",
      "principle": "Local-First, Private-by-Default",
      "violation": "Contract 'api-auth' references external OAuth service without opt-in gate",
      "severity": "warning"
    }
  ]
}
```

### POST /api/v1/speckit/sync

Bidirectional sync between spec-kit and .ctx.

**Request body**:
```json
{
  "repo_root": "/path/to/repo",
  "dry_run": false,
  "force_direction": null
}
```

**Response 200**:
```json
{
  "synced": 5,
  "conflicts": 1,
  "direction_used": "bidirectional",
  "files_updated": ["src/auth/.ctx"],
  "specs_updated": ["specs/auth/spec.md"]
}
```
