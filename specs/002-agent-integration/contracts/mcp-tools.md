# MCP Tool Contracts: CtxKit Agent Integration

**Feature**: 002-agent-integration
**Date**: 2026-03-01

All tools are exposed via `@modelcontextprotocol/sdk` over stdio JSON-RPC transport.

---

## ctxkit.context_pack

Build a Context Pack for a request or tool invocation.

**Input Schema**:
```typescript
{
  session_id: z.string().describe("Active CtxKit session ID"),
  repo_root: z.string().optional().describe("Repository root path (auto-detected if omitted)"),
  cwd: z.string().describe("Current working directory"),
  request: z.string().describe("User request text or tool intent description"),
  mode: z.enum(["turn", "tool"]).describe("Context mode: 'turn' for user prompts, 'tool' for tool-specific"),
  token_budget: z.number().positive().optional().describe("Max tokens for context pack"),
  tool_intent: z.object({
    tool_name: z.string(),
    tool_input: z.record(z.unknown()),
  }).optional().describe("Tool name and input for mode=tool"),
  touched_files: z.array(z.string()).optional().describe("Recently modified file paths"),
}
```

**Output**:
```json
{
  "pack_id": "pack_abc123",
  "inject_text": "## CtxKit Context\n...",
  "token_estimate": 1200,
  "items": [
    {
      "source": "src/.ctx",
      "section": "key_files",
      "reason_codes": ["locality", "recency"],
      "score": 0.85,
      "token_count": 150
    }
  ],
  "omitted": [
    {
      "source": "docs/.ctx",
      "reason": "below_threshold",
      "score": 0.12
    }
  ],
  "deep_read": null
}
```

**Errors**:
- `InvalidParams`: Missing required fields
- `InternalError`: Daemon unreachable (include start instructions)

---

## ctxkit.log_event

Record a tool call or session event to the timeline.

**Input Schema**:
```typescript
{
  session_id: z.string().describe("Active CtxKit session ID"),
  event_type: z.enum(["tool_success", "tool_failure", "session_close", "proposal_trigger"])
    .describe("Type of event"),
  payload: z.object({
    tool_name: z.string().optional(),
    tool_input: z.record(z.unknown()).optional(),
    tool_response: z.record(z.unknown()).optional(),
    error: z.string().optional(),
    file_paths: z.array(z.string()).optional(),
    exit_code: z.number().optional(),
    duration_ms: z.number().optional(),
  }).describe("Event payload"),
}
```

**Output**:
```json
{
  "event_id": "evt_def456"
}
```

**Errors**:
- `InvalidParams`: Missing session_id or event_type
- `InternalError`: Daemon unreachable

---

## ctxkit.propose_update

Generate a `.ctx` update proposal from session activity.

**Input Schema**:
```typescript
{
  session_id: z.string().describe("Active CtxKit session ID"),
  scope: z.enum(["cwd", "repo"]).default("cwd").describe("Scope of the proposal"),
  learned_facts: z.array(z.string()).optional().describe("Facts learned during the session"),
  evidence_paths: z.array(z.string()).optional().describe("File paths that support the learned facts"),
}
```

**Output**:
```json
{
  "proposal_id": "diff_ghi789",
  "diff": "--- a/src/.ctx\n+++ b/src/.ctx\n@@ ...",
  "summary": "Added key_files entry for new auth module"
}
```

**Errors**:
- `InvalidParams`: Invalid session_id
- `InternalError`: Daemon unreachable

---

## ctxkit.apply_proposal

Apply an approved `.ctx` update proposal.

**Input Schema**:
```typescript
{
  proposal_id: z.string().describe("Proposal ID to apply"),
}
```

**Output**:
```json
{
  "applied": true,
  "audit_id": "aud_jkl012"
}
```

**Errors**:
- `InvalidParams`: Proposal not found
- `InternalError`: Proposal not in 'approved' status

---

## ctxkit.reject_proposal

Reject a pending `.ctx` update proposal.

**Input Schema**:
```typescript
{
  proposal_id: z.string().describe("Proposal ID to reject"),
}
```

**Output**:
```json
{
  "rejected": true
}
```

**Errors**:
- `InvalidParams`: Proposal not found or already resolved

---

## ctxkit.sessions.list

List CtxKit sessions.

**Input Schema**:
```typescript
{
  status: z.enum(["active", "completed"]).optional().describe("Filter by status"),
  repo_path: z.string().optional().describe("Filter by repository path"),
  limit: z.number().positive().optional().default(20).describe("Max results"),
}
```

**Output**:
```json
{
  "sessions": [
    {
      "id": "ses_abc123",
      "status": "active",
      "repo_path": "/path/to/repo",
      "started_at": "2026-03-01T10:00:00Z",
      "ended_at": null
    }
  ],
  "total": 5
}
```

---

## ctxkit.sessions.show

Get details for a specific session.

**Input Schema**:
```typescript
{
  session_id: z.string().describe("Session ID to retrieve"),
}
```

**Output**:
```json
{
  "id": "ses_abc123",
  "status": "active",
  "repo_path": "/path/to/repo",
  "working_dir": "/path/to/repo/src",
  "branch": "main",
  "agent_id": "claude-code",
  "started_at": "2026-03-01T10:00:00Z",
  "ended_at": null
}
```

---

## ctxkit.policy.get

Return the effective merged configuration for the current workspace.

**Input Schema**:
```typescript
{
  cwd: z.string().describe("Working directory for config resolution"),
  repo_root: z.string().optional().describe("Repository root (auto-detected if omitted)"),
}
```

**Output**:
```json
{
  "effective_config": {
    "budget_tokens": 4000,
    "scoring_mode": "balanced",
    "auto_approve": { "enabled": false },
    "ignore_patterns": ["node_modules/**", ".git/**"],
    "never_read": ["*.env", "*.key"],
    "never_log": ["*.pem"],
    "retention": { "sessions_days": 30, "audit_days": 90 }
  },
  "sources": [
    { "path": "~/.ctxl/config.yaml", "scope": "global" },
    { "path": "/repo/.ctxl/config.yaml", "scope": "workspace" }
  ]
}
```

---

## ctxkit.policy.validate

Validate configuration schema correctness.

**Input Schema**:
```typescript
{
  config: z.record(z.unknown()).describe("Configuration object to validate"),
}
```

**Output**:
```json
{
  "valid": true,
  "warnings": [
    { "path": "budget_tokens", "message": "Value 100 is below recommended minimum of 500" }
  ],
  "errors": []
}
```

---

## ctxkit.memory.search

Search `.ctx` entries by query text.

**Input Schema**:
```typescript
{
  query: z.string().describe("Search query text"),
  cwd: z.string().describe("Working directory for .ctx resolution"),
  repo_root: z.string().optional().describe("Repository root (auto-detected if omitted)"),
  limit: z.number().positive().optional().default(10).describe("Max results"),
}
```

**Output**:
```json
{
  "results": [
    {
      "source": "src/.ctx",
      "section": "key_files",
      "content": "auth.ts - Main authentication module",
      "score": 0.92,
      "reason_codes": ["keyword_match", "locality"]
    }
  ],
  "total": 3
}
```
