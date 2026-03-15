# MCP Tool Contracts: ctxl v2

**Branch**: `004-ctxl-v2` | **Date**: 2026-03-15

6 new MCP tools, adding to the existing 10. All tools are prefixed with `ctxkit.`.

---

## ctxkit.index_generate

Generate or regenerate the .ctxl index for a repository.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| repo_root | string | yes | Absolute path to repository root |
| force | boolean | no | Regenerate from scratch (default: false) |

**Returns**:
```json
{
  "success": true,
  "index_path": "/path/to/.ctxl",
  "entries_count": 12,
  "total_tokens": 8400,
  "dependencies_found": 5,
  "generated_at": "2026-03-15T10:30:00Z"
}
```

**Error**:
```json
{
  "success": false,
  "error": "Not a git repository"
}
```

---

## ctxkit.index_select

Select relevant .ctx files for a task using the index-based scoring algorithm.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| prompt | string | yes | Task description for relevance scoring |
| cwd | string | yes | Current working directory |
| budget_tokens | integer | no | Token budget (default: from .ctxl or 4000) |
| touched_files | string[] | no | Files recently modified by the agent |
| pinned | string[] | no | .ctx paths to always include |
| excluded | string[] | no | .ctx paths to never include |

**Returns**:
```json
{
  "selected": [
    {
      "path": "src/auth/.ctx",
      "score": 0.92,
      "reasons": ["LOCALITY_HIGH", "TAG_MATCH"],
      "tokens": 450,
      "budget_category": "local_ctx"
    }
  ],
  "omitted": [
    {
      "path": "docs/.ctx",
      "score": 0.15,
      "exclusion_reason": "BELOW_THRESHOLD"
    }
  ],
  "budget_used": {
    "contracts": 200,
    "local_ctx": 1200,
    "related_ctx": 800,
    "history": 300,
    "reserve": 0,
    "total": 2500
  }
}
```

**Error**:
```json
{
  "success": false,
  "error": "No .ctxl index found. Run ctxkit.index_generate first."
}
```

---

## ctxkit.ctx_history

View version history for a .ctx file.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| ctx_path | string | yes | Path to .ctx file (absolute or relative to repo root) |
| count | integer | no | Number of entries to return (default: 20) |
| include_archived | boolean | no | Include archived entries (default: false) |

**Returns**:
```json
{
  "path": "src/auth/.ctx",
  "current_version": 8,
  "entries": [
    {
      "version": 8,
      "timestamp": "2026-03-15T10:30:00Z",
      "author": "agent:claude-opus:sess_abc",
      "reason": "Added auth middleware key_file",
      "checksum": "sha256:abc123...",
      "diff_summary": "+1 key_file"
    }
  ],
  "has_more": true,
  "archive_path": ".ctxl.history/src/auth/ctx-history.yaml"
}
```

---

## ctxkit.ctx_write

Write to a .ctx file with automatic locking, versioning, and conflict detection.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| ctx_path | string | yes | Path to .ctx file |
| updates | object | yes | Sections to update (partial .ctx content) |
| reason | string | yes | Why the change is being made (max 200 chars) |
| author | string | yes | Author identity |
| session_id | string | no | Current session ID |

**Returns** (success):
```json
{
  "success": true,
  "version": 9,
  "diff_summary": "+1 key_file, ~1 contract",
  "conflicts": [],
  "lock_held_ms": 45
}
```

**Returns** (conflict):
```json
{
  "success": true,
  "version": 10,
  "diff_summary": "+1 key_file, ~1 contract",
  "conflicts": [
    {
      "section": "contracts",
      "key": "auth-policy",
      "ours_author": "agent:claude-opus:sess_abc",
      "theirs_author": "agent:claude-sonnet:sess_def"
    }
  ],
  "merge_strategy": "three-way",
  "lock_held_ms": 120
}
```

**Error**:
```json
{
  "success": false,
  "error": "Lock acquisition failed after 3 retries"
}
```

---

## ctxkit.ctx_bootstrap

Analyze a directory and generate a .ctx file proposal.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| target_path | string | yes | Directory to analyze |
| mode | string | no | Analysis mode: "quick" or "full" (default: "quick") |
| dry_run | boolean | no | Preview without writing (default: true) |
| skip_existing | boolean | no | Skip if .ctx already exists (default: true) |
| min_files | integer | no | Minimum files to qualify (default: 3) |

**Returns**:
```json
{
  "proposals": [
    {
      "path": "src/auth/.ctx",
      "summary": "Authentication module with JWT middleware",
      "key_files": ["src/auth/middleware.ts", "src/auth/jwt.ts"],
      "tags": ["auth", "jwt", "middleware", "typescript"],
      "commands": { "test": "vitest run src/auth/" },
      "language": "typescript",
      "framework": "hono",
      "token_estimate": 320
    }
  ],
  "skipped": [
    { "path": "node_modules/", "reason": "matches ignore pattern" }
  ],
  "dry_run": true
}
```

---

## ctxkit.pr_generate

Generate a PR context document from session data.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| session_ids | string[] | no | Specific session IDs (if empty, uses branch) |
| git_range | string | no | Git range (e.g., "main..HEAD") |
| format | string | no | Output format: "markdown" or "json" (default: "markdown") |
| include_full_prompts | boolean | no | Include full prompt text (default: false) |
| link_specs | boolean | no | Cross-reference spec-kit artifacts (default: false) |

**Returns** (markdown format):
```json
{
  "format": "markdown",
  "content": "## Change Context\n\n**Sessions**: sess_abc, sess_def\n...",
  "stats": {
    "total_prompts": 4,
    "total_tool_calls": 19,
    "files_changed_count": 3,
    "lines_added": 245,
    "lines_removed": 12
  }
}
```

**Returns** (json format):
```json
{
  "format": "json",
  "content": { ... PrContext object ... },
  "stats": { ... }
}
```

**Error**:
```json
{
  "success": false,
  "error": "Daemon not running. Start with 'ctxkit daemon start'"
}
```
