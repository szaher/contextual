# Data Model: CtxKit Agent Integration

**Feature**: 002-agent-integration
**Date**: 2026-03-01

## Overview

This feature introduces no new persistent storage entities. It wraps the existing daemon data model (sessions, events, diffs/proposals, audit entries, config) through two new interface layers: MCP tools and Claude Code hooks. The only new "data" is the generated `AGENTS.md` files (filesystem artifacts, not database records).

## Existing Entities (from Feature 001, used by this feature)

### Session
- **Store**: `sessions` table in better-sqlite3
- **Fields**: `id`, `repo_path`, `working_dir`, `branch`, `agent_id`, `agent_config`, `status` (active/completed), `started_at`, `ended_at`
- **Used by**: MCP tools (`sessions.list`, `sessions.show`), SessionStart hook (create), SessionEnd hook (close)

### RequestEvent
- **Store**: `request_events` table
- **Fields**: `id`, `session_id`, `request_text`, `context_pack`, `omitted_items`, `token_count`, `budget`, `deep_read`, `created_at`
- **Used by**: MCP tool (`log_event`), PostToolUse/PostToolUseFailure hooks
- **Extension needed**: Add `event_type` field to distinguish request events from tool events. Values: `request` (existing), `tool_success`, `tool_failure`, `session_close`, `proposal_trigger`

### MemoryDiff (Proposal)
- **Store**: `memory_diffs` table
- **Fields**: `id`, `session_id`, `event_id`, `ctx_path`, `diff_content`, `provenance`, `status` (proposed/approved/rejected/applied), `created_at`, `resolved_at`, `resolved_by`
- **Used by**: MCP tools (`propose_update`, `apply_proposal`, `reject_proposal`), TaskCompleted hook

### AuditEntry
- **Store**: `audit_log` table
- **Fields**: `id`, `ctx_path`, `change_type`, `diff_content`, `initiated_by`, `reason`, `created_at`
- **Used by**: Proposal apply flow (existing)

### ContextPack (runtime, not persisted)
- **Type**: `ContextPackResult` from `@ctxl/core`
- **Fields**: `pack` (items, omitted, total_tokens, budget_tokens), `deep_read`, `event_id`
- **Used by**: MCP tool (`context_pack`), UserPromptSubmit hook, PreToolUse hook

### LoadedProfile (runtime, not persisted)
- **Type**: `LoadedProfile` from `@ctxl/core`
- **Fields**: workspace profile, global profile, effective merged config (budgets, scoring, agent, ignore patterns)
- **Used by**: MCP tools (`policy.get`, `policy.validate`)

## New Runtime Types (not persisted)

### ToolEvent
Extends RequestEvent for tool lifecycle logging.

```typescript
interface ToolEvent {
  session_id: string;
  event_type: 'tool_success' | 'tool_failure';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  error?: string;
  file_paths?: string[];
  exit_code?: number;
  duration_ms?: number;
  created_at: string;
}
```

### HookInput (per event type)
JSON received on stdin by each hook handler. Common fields across all events:

```typescript
interface HookInputBase {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
}
```

### HookOutput
JSON returned on stdout by hook handlers:

```typescript
interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
  };
}
```

### CompactionSpine
Minimal context payload for PreCompact hook:

```typescript
interface CompactionSpine {
  session_id: string;
  active_proposals: Array<{ id: string; ctx_path: string; summary: string }>;
  key_ctx_paths: string[];
  last_context_pack_id: string | null;
  environment: {
    CTXKIT_SESSION_ID: string;
    CTXKIT_API: string;
    CTXKIT_REPO_ROOT: string;
  };
}
```

### AgentsMdSection
Generated section for AGENTS.md files:

```typescript
interface AgentsMdSection {
  directory: string;
  ctx_summary: string;
  usage_policy: string;
  token_count: number;
}
```

## Entity Relationships

```text
Session (1) ──── (N) RequestEvent / ToolEvent
Session (1) ──── (N) MemoryDiff (Proposal)
MemoryDiff (1) ── (0..1) AuditEntry (on apply)
LoadedProfile ──── references ──── IgnorePolicy[]
ContextPack ──── contains ──── PackItem[] + OmittedItem[]

MCP Server ──── wraps ──── Daemon API (all entities above)
Hook Handler ──── calls ──── Daemon API (via HTTP client)
AGENTS.md ──── generated from ──── .ctx files (via merger + redaction)
```

## Schema Migrations

### RequestEvent extension
Add `event_type` column to `request_events` table:

```sql
ALTER TABLE request_events ADD COLUMN event_type TEXT DEFAULT 'request';
ALTER TABLE request_events ADD COLUMN tool_name TEXT;
ALTER TABLE request_events ADD COLUMN tool_input TEXT;
ALTER TABLE request_events ADD COLUMN tool_response TEXT;
ALTER TABLE request_events ADD COLUMN exit_code INTEGER;
ALTER TABLE request_events ADD COLUMN duration_ms INTEGER;
```

This is a backwards-compatible extension — existing events get `event_type = 'request'` by default.
