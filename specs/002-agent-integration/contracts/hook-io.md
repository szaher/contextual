# Hook I/O Contracts: CtxKit Claude Code Plugin

**Feature**: 002-agent-integration
**Date**: 2026-03-01

All hooks receive JSON on stdin and return JSON on stdout. Exit code 0 = success, exit code 2 = blocking error.

---

## Common Input Fields (all events)

```typescript
interface HookInputBase {
  session_id: string;       // Claude Code session ID
  transcript_path: string;  // Path to conversation JSONL
  cwd: string;              // Current working directory
  permission_mode: string;  // "default" | "plan" | "acceptEdits" | "dontAsk" | "bypassPermissions"
  hook_event_name: string;  // Event name that triggered this hook
}
```

## Common Output Fields (all events)

```typescript
interface HookOutputBase {
  continue?: boolean;         // false = stop Claude entirely (default: true)
  stopReason?: string;        // Message shown when continue=false
  suppressOutput?: boolean;   // Hide stdout from verbose mode
  systemMessage?: string;     // Warning message shown to user
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string; // Injected into conversation
  };
}
```

---

## SessionStart

**Matcher**: `"startup|resume"`
**Can Block**: No

**Input** (extends HookInputBase):
```typescript
{
  source: "startup" | "resume" | "clear" | "compact";
  model: string;  // e.g., "claude-sonnet-4-6"
}
```

**Output**:
```typescript
{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: string  // Bootstrap context
  }
}
```

**Hook Actions**:
1. Check daemon health (`GET /api/v1/health`)
2. Start daemon if not running (`ctxkit daemon start`)
3. Create session (`POST /api/v1/sessions`)
4. Write env vars to `$CLAUDE_ENV_FILE`:
   - `CTXKIT_SESSION_ID`
   - `CTXKIT_API`
   - `CTXKIT_REPO_ROOT`
5. Return bootstrap context string

---

## SessionEnd

**Matcher**: `"prompt_input_exit|other"`
**Can Block**: No

**Input** (extends HookInputBase):
```typescript
{
  reason: "clear" | "logout" | "prompt_input_exit" | "bypass_permissions_disabled" | "other";
}
```

**Output**:
```typescript
{}  // No context injection on session end
```

**Hook Actions**:
1. Read `CTXKIT_SESSION_ID` from environment
2. Close session (`PATCH /api/v1/sessions/:id` with `status: "completed"`)
3. If `hooks.sessionEnd.propose_final_update` is enabled and activity thresholds met:
   - Trigger `POST /api/v1/proposals`
4. Log session closure

---

## UserPromptSubmit

**Matcher**: None (fires for all prompts)
**Can Block**: Yes

**Input** (extends HookInputBase):
```typescript
{
  prompt: string;  // The user's prompt text
}
```

**Output**:
```typescript
{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: string  // Context pack text
  }
}
```

**Hook Actions**:
1. Read `CTXKIT_SESSION_ID` and `CTXKIT_API` from environment
2. Call daemon: `POST /api/v1/context-pack` with:
   - `session_id`, `request_text: prompt`, `working_dir: cwd`, `mode: "turn"`
3. Format context pack as inject text with header:
   ```
   [CtxKit Pack: <pack_id> | <token_count> tokens]
   <context items>
   ```
4. Return as `additionalContext`

---

## PreToolUse

**Matcher**: `"Bash|Edit|Write|NotebookEdit|Agent"` (configurable via `hooks.preToolUse.allowlist`)
**Can Block**: Yes

**Input** (extends HookInputBase):
```typescript
{
  tool_name: string;       // "Bash", "Edit", "Write", etc.
  tool_input: {            // Varies by tool
    command?: string;      // Bash
    file_path?: string;    // Edit, Write, Read
    content?: string;      // Write
    old_string?: string;   // Edit
    new_string?: string;   // Edit
    pattern?: string;      // Glob, Grep
    // ... other tool-specific fields
  };
  tool_use_id: string;
}
```

**Output**:
```typescript
{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext?: string,        // Tool-specific context
    permissionDecision?: "allow" | "deny" | "ask",
    permissionDecisionReason?: string,
  }
}
```

**Hook Actions**:
1. Check if tool is in allowlist (should already be filtered by matcher, but verify)
2. Call daemon: `POST /api/v1/context-pack` with:
   - `session_id`, `working_dir: cwd`, `mode: "tool"`, `tool_name`, `tool_input`
   - `budget_tokens` from `hooks.preToolUse.budget` config
3. Return tool-specific context as `additionalContext`

---

## PostToolUse

**Matcher**: `".*"` (all tools)
**Can Block**: No

**Input** (extends HookInputBase):
```typescript
{
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
  tool_use_id: string;
}
```

**Output**:
```typescript
{}  // No additional context needed
```

**Hook Actions**:
1. Call daemon: `POST /api/v1/sessions/:id/events` with:
   - `event_type: "tool_success"`, `tool_name`, `tool_input`, `tool_response`
   - Extract `file_paths` from tool_input (file_path, pattern, etc.)
   - Extract `exit_code` from tool_response if present

---

## PostToolUseFailure

**Matcher**: `".*"` (all tools)
**Can Block**: No

**Input** (extends HookInputBase):
```typescript
{
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  error: string;
  is_interrupt: boolean;
}
```

**Output**:
```typescript
{
  hookSpecificOutput?: {
    hookEventName: "PostToolUseFailure",
    additionalContext?: string  // Optional recovery context
  }
}
```

**Hook Actions**:
1. Call daemon: `POST /api/v1/sessions/:id/events` with:
   - `event_type: "tool_failure"`, `tool_name`, `tool_input`, `error`

---

## TaskCompleted

**Matcher**: None
**Can Block**: Yes (exit code 2 only)

**Input** (extends HookInputBase):
```typescript
{
  task_id: string;
  task_subject: string;
  task_description: string;
}
```

**Output**:
```typescript
{
  hookSpecificOutput: {
    hookEventName: "TaskCompleted",
    additionalContext: string  // Proposal info
  }
}
```

**Hook Actions**:
1. Call daemon: `POST /api/v1/proposals` with:
   - `session_id`, scope from config, `provenance: { task_id, task_subject }`
2. Return proposal summary as `additionalContext`:
   ```
   [CtxKit Proposal: <proposal_id>]
   Summary: <summary>
   Review: /ctxkit apply <proposal_id>
   ```

---

## PreCompact

**Matcher**: `"manual|auto"`
**Can Block**: No

**Input** (extends HookInputBase):
```typescript
{
  trigger: "manual" | "auto";
  custom_instructions: string;
}
```

**Output**:
```typescript
{
  hookSpecificOutput: {
    hookEventName: "PreCompact",
    additionalContext: string  // Compaction spine
  }
}
```

**Hook Actions**:
1. Build compaction spine:
   - Session ID + environment variables
   - Active/pending proposal IDs and summaries
   - Key `.ctx` file paths for the current working directory
   - Last context pack ID
2. Format as compact text block:
   ```
   [CtxKit Compaction Spine]
   Session: <id> | API: <url> | Root: <path>
   Active proposals: <id1> (<path>), <id2> (<path>)
   Key .ctx: src/.ctx, docs/.ctx, .ctx
   Last pack: <pack_id>
   ```

---

## hooks.json Configuration

```json
{
  "description": "CtxKit automatic context injection and event logging",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.js",
            "timeout": 10,
            "statusMessage": "Starting CtxKit session..."
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "prompt_input_exit|other",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/session-end.js",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/user-prompt-submit.js",
            "timeout": 5,
            "statusMessage": "Injecting CtxKit context..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write|NotebookEdit|Agent",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/pre-tool-use.js",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/post-tool-use.js",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/post-tool-use-failure.js",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/task-completed.js",
            "timeout": 10,
            "statusMessage": "Generating CtxKit proposal..."
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "manual|auto",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/pre-compact.js",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```
