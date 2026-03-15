# Data Model: Git Hooks PR Context & Embedded UI

**Feature**: 005-git-hooks-pr-context
**Date**: 2026-03-15

## Entities

### Context Trailer

A set of git trailers appended to a commit message by the ctxkit `prepare-commit-msg` hook.

| Field | Type | Description |
|-------|------|-------------|
| session_id | string (nullable) | Active ctxkit session ID, e.g., `sess_7d2f4a1b`. Null if no active session. |
| files | string[] | List of .ctx file paths changed in this commit |
| entries | number | Count of context entries relevant to the commit |
| timestamp | ISO 8601 string | When the trailer was injected |

**Format**: Standard git trailers with `Ctxkit-` prefix. Each field is a single `Key: value` line after a blank separator in the commit message.

**Validation rules**:
- `session_id` must match pattern `sess_[a-f0-9]{8}` or be absent
- `files` must be valid relative paths within the repo
- `entries` must be a non-negative integer
- `timestamp` must be valid ISO 8601

### Commit Context Record

A parsed representation of a context trailer, stored in the daemon's SQLite database for dashboard queries.

| Field | Type | Description |
|-------|------|-------------|
| commit_hash | string (PK) | Git commit SHA (full 40-char hex) |
| session_id | string (nullable, FK → sessions) | Links to the ctxkit session that produced this commit |
| files_changed | JSON array | List of .ctx file paths from trailer |
| entry_count | number | Context entry count from trailer |
| trailer_timestamp | ISO 8601 string | Timestamp from trailer |
| author | string | Git commit author |
| message_subject | string | First line of commit message |
| indexed_at | ISO 8601 string | When this record was parsed and stored |

**Relationships**:
- Many-to-one with `sessions` table (via `session_id`)
- Standalone if `session_id` is null (commit had .ctx changes but no active session)

**Lifecycle**:
1. Created: When dashboard or API parses a commit with `Ctxkit-*` trailers from git log
2. Updated: Re-indexed if git history is rewritten (force push)
3. No deletion: Records persist as long as the commit exists in git history

### Hook Policy

Per-repository or global configuration for automatic hook installation behavior.

| Field | Type | Description |
|-------|------|-------------|
| mode | enum: `auto` \| `prompt` \| `skip` | How the Claude Code plugin handles hook installation |
| installed_at | ISO 8601 string (nullable) | When the hook was last installed |
| declined_at | ISO 8601 string (nullable) | When the user last declined installation |
| hook_version | string (nullable) | Version of the installed hook script |

**Storage**: In `.ctxl` config file (per-repo) or `~/.ctxl/config.yaml` (global default).

**State transitions**:
- `not_installed` → `installed` (via CLI command or plugin auto-install)
- `installed` → `not_installed` (via CLI uninstall command)
- `not_installed` → `declined` (user says no to plugin prompt)
- `declined` → `installed` (user manually installs via CLI)

### Hook Installation Status

Read-only status returned by the `ctxkit hooks status` command.

| Field | Type | Description |
|-------|------|-------------|
| prepare_commit_msg | enum: `installed` \| `outdated` \| `not_installed` \| `chained` | Status of the prepare-commit-msg hook |
| pre_commit | enum: `installed` \| `outdated` \| `not_installed` | Status of the pre-commit hook (existing) |
| post_commit | enum: `installed` \| `outdated` \| `not_installed` | Status of the post-commit hook (existing) |
| has_other_hooks | boolean | Whether non-ctxkit hooks exist in .git/hooks/ |

## Database Schema Extension

New table `commit_context` added to the daemon's SQLite database:

```sql
CREATE TABLE IF NOT EXISTS commit_context (
  commit_hash TEXT PRIMARY KEY,
  session_id TEXT,
  files_changed TEXT NOT NULL DEFAULT '[]',   -- JSON array
  entry_count INTEGER NOT NULL DEFAULT 0,
  trailer_timestamp TEXT NOT NULL,
  author TEXT NOT NULL,
  message_subject TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_commit_context_session ON commit_context(session_id);
CREATE INDEX idx_commit_context_timestamp ON commit_context(trailer_timestamp);
```
