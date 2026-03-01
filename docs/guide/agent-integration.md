# Agent Integration

CtxKit provides multiple integration paths so that any AI coding agent can receive project context automatically. You can choose the path that best fits your agent and workflow: an MCP server for structured tool access, a Claude Code plugin for fully automatic injection, Codex adapters for native integration, or the `ctxkit run` wrapper as a universal fallback.

## Integration Paths Overview

| Path | Agent | Method | Setup Required | Context Injection |
|------|-------|--------|----------------|-------------------|
| MCP Server | Any MCP agent | JSON-RPC tools | Register MCP server | On-demand (agent calls tools) |
| Claude Code Plugin | Claude Code | Hooks | Install plugin | Automatic (every turn + tool) |
| Codex MCP | Codex | MCP registration | `codex mcp add` | On-demand (agent calls tools) |
| Codex AGENTS.md | Codex | File-based | `ctxkit codex sync-agents` | Passive (Codex reads files) |
| CLI Fallback | Any agent | Shell commands | None | On-demand (`--json` output) |
| Agent Wrapper | Any CLI agent | Environment vars | None | Automatic (`ctxkit run`) |

---

## MCP Server

The MCP server (`ctxkit-mcp`) is the shared substrate that both the Claude Code and Codex adapters build on. It translates MCP protocol messages into CtxKit daemon API calls, exposing all CtxKit capabilities as structured JSON-RPC tools.

### Setup

`ctxkit-mcp` is a stdio-based MCP server. Register it with your agent by pointing to the server binary or entry point.

**Claude Code** (via plugin or manual registration):

```json
{
  "mcpServers": {
    "ctxkit": {
      "command": "ctxkit-mcp",
      "args": [],
      "transport": "stdio"
    }
  }
}
```

**Codex**:

```bash
codex mcp add ctxkit -- ctxkit-mcp
```

**Generic MCP client** (testing via stdio):

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | ctxkit-mcp
```

The server communicates exclusively over stdio (stdin/stdout) using the MCP JSON-RPC protocol. No HTTP port or network configuration is required for the MCP server itself.

### Available Tools (10)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ctxkit.context_pack` | Build a Context Pack for a request or tool invocation | `session_id`, `cwd`, `request`, `mode` (turn/tool), `token_budget` |
| `ctxkit.log_event` | Record a tool call or session event to the timeline | `session_id`, `event_type`, `payload` |
| `ctxkit.propose_update` | Generate a `.ctx` update proposal from session activity | `session_id`, `scope` (cwd/repo), `learned_facts` |
| `ctxkit.apply_proposal` | Apply an approved `.ctx` update proposal | `proposal_id` |
| `ctxkit.reject_proposal` | Reject a pending `.ctx` update proposal | `proposal_id` |
| `ctxkit.sessions.list` | List CtxKit sessions | `status`, `repo_path`, `limit` |
| `ctxkit.sessions.show` | Get details for a specific session | `session_id` |
| `ctxkit.policy.get` | Return the effective merged configuration for the workspace | `cwd`, `repo_root` |
| `ctxkit.policy.validate` | Validate configuration schema correctness | `config` |
| `ctxkit.memory.search` | Search `.ctx` entries by query text | `query`, `cwd`, `limit` |

### Tool Usage Patterns

**Context injection** -- call `ctxkit.context_pack` before responding to a user prompt:

```json
{
  "name": "ctxkit.context_pack",
  "arguments": {
    "session_id": "ses_abc123",
    "cwd": "/path/to/repo/src",
    "request": "explain the auth flow",
    "mode": "turn",
    "token_budget": 4000
  }
}
```

The response includes `inject_text` (ready to prepend to the conversation), `items` (with source paths, reason codes, and scores), and `omitted` entries.

**Event logging** -- call `ctxkit.log_event` after tool invocations:

```json
{
  "name": "ctxkit.log_event",
  "arguments": {
    "session_id": "ses_abc123",
    "event_type": "tool_success",
    "payload": {
      "tool_name": "Bash",
      "tool_input": { "command": "npm test" },
      "tool_response": { "exit_code": 0 },
      "duration_ms": 3200
    }
  }
}
```

**Memory updates** -- call `ctxkit.propose_update` when the agent learns new facts:

```json
{
  "name": "ctxkit.propose_update",
  "arguments": {
    "session_id": "ses_abc123",
    "scope": "cwd",
    "learned_facts": ["auth.ts uses JWT for session tokens"],
    "evidence_paths": ["src/auth.ts", "src/config.ts"]
  }
}
```

**Session management** -- call `ctxkit.sessions.list` and `ctxkit.sessions.show` to inspect sessions:

```json
{
  "name": "ctxkit.sessions.list",
  "arguments": {
    "status": "active",
    "limit": 5
  }
}
```

### Daemon Dependency

The MCP server does not store data itself. It connects to the CtxKit daemon over HTTP (`http://localhost:3742` by default) to perform all operations. If the daemon is not running, every tool call returns a structured error:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "DAEMON_UNAVAILABLE: Cannot connect to CtxKit daemon at http://localhost:3742. Start the daemon with: ctxkit daemon start"
    }
  ]
}
```

Start the daemon before using the MCP server:

```bash
ctxkit daemon start
```

---

## Claude Code Plugin

The `ctxkit-claude-plugin` provides fully automatic context injection for Claude Code. Once installed, it injects relevant project context into every conversation turn and tool invocation with no manual action required.

### How It Works

The plugin uses Claude Code's hook system to intercept lifecycle events and inject context via `additionalContext`. It also registers the MCP server for structured tool access and provides a `/ctxkit` skill for manual control.

The plugin automatically:
- Creates a CtxKit session when Claude Code starts
- Injects a Context Pack on every user prompt
- Provides tool-specific context before modifying tools (Bash, Edit, Write, etc.)
- Logs all tool activity to the session timeline
- Proposes `.ctx` updates when tasks complete
- Preserves memory pointers during context compaction

### Hook Lifecycle

The plugin registers 8 hooks that fire in this order during a typical session:

**1. SessionStart** -- Creates session, sets env vars, returns bootstrap context.

Fires on `startup` or `resume`. Starts the daemon if needed, creates a CtxKit session, and persists environment variables via `CLAUDE_ENV_FILE`:

```
CTXKIT_SESSION_ID=ses_abc123
CTXKIT_API=http://localhost:3742
CTXKIT_REPO_ROOT=/path/to/repo
```

Returns bootstrap context: `"CtxKit session active: ses_abc123. Use /ctxkit for help."`

**2. UserPromptSubmit** -- Builds context pack for the prompt, injects as `additionalContext`.

Fires on every user prompt. Calls the daemon to build a context pack using the prompt text, working directory, and configured budget. Returns the pack as `additionalContext` with a compact header:

```
[CtxKit Pack: pack_def456 | 1200 tokens]
## Key Files
- auth.ts — Main authentication module (locality, recency)
...
```

**3. PreToolUse** -- Builds tool-specific context for Bash, Edit, Write, NotebookEdit, Agent.

Fires before tools on the allowlist (read-only tools like Read, Glob, and Grep are excluded by default since turn-level context already covers exploratory operations). Builds a targeted context pack using `tool_name` and `tool_input`:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "[CtxKit Tool Context] ...",
    "permissionDecision": "allow"
  }
}
```

**4. PostToolUse** -- Logs tool name, inputs, outputs, file paths to session timeline (async).

Fires after every tool completes successfully. Runs asynchronously to avoid adding latency. Extracts file paths from tool input and exit codes from tool response.

**5. PostToolUseFailure** -- Logs failed tool invocations with error details (async).

Fires when a tool fails. Records the error message and optionally returns recovery context.

**6. TaskCompleted** -- Triggers `.ctx` update proposal, returns proposal ID.

Fires when Claude Code marks a task complete. Calls the daemon to generate a `.ctx` diff proposal and surfaces it as `additionalContext`:

```
[CtxKit Proposal: diff_ghi789]
Summary: Added key_files entry for new auth module
Review: /ctxkit apply diff_ghi789
```

**7. PreCompact** -- Builds compaction spine to preserve memory during context compression.

Fires before Claude Code compresses the conversation context. Returns a minimal "spine" that ensures essential CtxKit pointers survive compaction:

```
[CtxKit Compaction Spine]
Session: ses_abc123 | API: http://localhost:3742 | Root: /path/to/repo
Active proposals: diff_ghi789 (src/.ctx)
Key .ctx: src/.ctx, docs/.ctx, .ctx
Last pack: pack_def456
```

**8. SessionEnd** -- Closes session, optionally triggers final proposal.

Fires when the Claude Code session ends. Closes the CtxKit session (marks status as `completed`, records `ended_at` and termination reason). If `hooks.sessionEnd.propose_final_update` is enabled and activity thresholds are met (files modified, commands run, errors encountered, or minimum session duration), triggers a final `.ctx` update proposal.

### The /ctxkit Skill

The `/ctxkit` skill provides an interactive "operator UI" inside the Claude Code chat. It supports these subcommands:

```
/ctxkit                           Show help and available subcommands
/ctxkit inject "explain auth"     Show the current Context Pack with items, scores, and reasons
/ctxkit sessions                  List recent sessions
/ctxkit memory search "auth"      Search .ctx entries matching the query
/ctxkit propose                   Generate a .ctx update proposal
/ctxkit apply <proposal_id>       Apply a pending proposal
/ctxkit policy                    Show the effective configuration with sources
```

The skill uses an MCP-first approach: it prefers calling MCP tools when the server is available. If MCP is unavailable, it falls back to Bash CLI calls (e.g., `ctxkit inject "..." --json`).

### Configuration

Hook behavior is configurable via `.ctxl/config.yaml`:

```yaml
# .ctxl/config.yaml
hooks:
  preToolUse:
    enabled: true
    allowlist:
      - Bash
      - Edit
      - Write
      - NotebookEdit
      - Agent
    budget: 2000  # Token budget for tool-specific packs (often smaller than turn budget)
  sessionEnd:
    close: true                     # Close session on exit (default: true)
    propose_final_update: false     # Trigger final .ctx proposal (default: false)
    propose_scope: cwd              # Scope for final proposal: cwd or repo
```

All hooks have configurable timeouts (default 5 seconds for most hooks, 10 seconds for `SessionStart` and `TaskCompleted`). Hooks never block the agent on failure -- if a hook errors out or times out, Claude Code continues normally.

---

## Codex Integration

Codex supports three complementary integration paths. You can use any combination.

### Option A: MCP Registration

Register the CtxKit MCP server so Codex can call tools during sessions:

```bash
codex mcp add ctxkit -- ctxkit-mcp
```

Verify the registration by typing `/mcp` in the Codex TUI. You should see `ctxkit (connected)` with all 10 tools listed.

For best results, provide Codex with usage instructions. See the [codex-instructions.md](https://github.com/szaher/contextual/blob/main/packages/mcp/templates/codex-instructions.md) template for a ready-to-use directive that tells Codex to:
- Call `ctxkit.context_pack(mode=turn)` before responding to user prompts
- Call `ctxkit.context_pack(mode=tool)` before running shell or file operations
- Call `ctxkit.log_event` after each tool invocation
- Call `ctxkit.propose_update` when learning new project facts

### Option B: AGENTS.md Generation

Generate Codex-native instruction files from the `.ctx` hierarchy:

```bash
ctxkit codex sync-agents
```

This command walks the `.ctx` hierarchy and generates `AGENTS.md` files at each directory that contains `.ctx` files. Codex automatically discovers and injects `AGENTS.md` from repo root through the working directory, so context flows to the agent without any explicit tool calls.

**How it works:**

1. Reads all `.ctx` files starting from the repo root
2. Applies secret redaction (API keys, tokens, passwords are replaced with `[REDACTED]`)
3. Applies ignore policies (skips `never_read` paths)
4. Generates a summary within the token budget (default 8000 tokens per file)
5. Writes or updates `AGENTS.md` with CtxKit-managed content

**Marker protocol** -- CtxKit-managed content is delimited by markers:

```markdown
<!-- CTXKIT:BEGIN - Managed by CtxKit. Do not edit this section. -->
## CtxKit Project Context
...
## CtxKit Usage Policy
...
<!-- CTXKIT:END -->
```

Content outside the markers is user-written and always preserved. Content between the markers is fully managed by CtxKit and overwritten on sync.

**Idempotent re-runs** -- running `ctxkit codex sync-agents` on unchanged `.ctx` files produces zero-diff output. Use `--dry-run` to preview changes:

```bash
ctxkit codex sync-agents --dry-run
# 0 files would be updated

# After .ctx changes:
ctxkit codex sync-agents --dry-run
# 2 files would be updated: AGENTS.md, src/AGENTS.md
```

**CLI options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--repo-root <path>` | auto-detected | Repository root path |
| `--budget <tokens>` | `8000` | Max tokens per AGENTS.md file |
| `--dry-run` | `false` | Show what would be written without writing |

### Option C: CLI Fallback

All CtxKit commands support `--json` output for use from Codex's local shell tool:

```bash
ctxkit inject --request "explain the auth flow" --json
# Returns JSON context pack with items, scores, reason codes

ctxkit sessions list --json
# Returns JSON array of sessions

ctxkit propose .ctx --json
# Returns JSON proposal with diff and summary
```

This works regardless of whether MCP is configured. Codex can execute these commands via its local shell tool and parse the structured JSON output.

---

## Agent Wrapper (ctxkit run)

The `ctxkit run` command wraps any agent command with context injection via environment variables. This is the universal integration path for agents that do not support MCP or hooks.

### How It Works

```bash
ctxkit run --agent claude --request "fix the auth bug" -- your-agent-command arg1 arg2
```

The execution flow has five steps:

#### Step 1: Create Session

ctxl creates a session on the daemon (if running):

```
POST http://localhost:3742/api/v1/sessions
{
  "repo_path": "/path/to/repo",
  "working_dir": "/path/to/repo/src/auth",
  "branch": "main",
  "agent_id": "claude"
}
```

If the daemon is not running, ctxl logs a warning and continues without session tracking.

#### Step 2: Build Context Pack

ctxl merges the `.ctx` hierarchy, scores entries against the request text, and assembles a budget-constrained Context Pack using the core library directly:

```typescript
const result = buildContextPack({
  workingDir,
  repoRoot,
  requestText: options.request || cmdArgs.join(' '),
  budgetTokens,
});
```

#### Step 3: Record Event

If a session was created, the context pack is recorded on the daemon:

```
POST http://localhost:3742/api/v1/context-pack
{
  "session_id": "sess_abc123",
  "repo_path": "/path/to/repo",
  "working_dir": "/path/to/repo/src/auth",
  "request_text": "fix the auth bug",
  "budget_tokens": 4000
}
```

#### Step 4: Spawn Agent

The wrapped command is spawned as a child process with context injected via environment variables:

```typescript
spawn(cmd, args, {
  cwd: workingDir,
  stdio: ['pipe', 'inherit', 'inherit'],
  env: {
    ...process.env,
    CTXL_CONTEXT_PACK: contextJson,
    CTXL_SESSION_ID: sessionId,
    CTXL_DAEMON_URL: daemonUrl,
    CTXL_TOKENS_USED: String(result.pack.total_tokens),
    CTXL_TOKENS_BUDGET: String(result.pack.budget_tokens),
  },
});
```

#### Step 5: End Session

When the wrapped command exits, ctxl ends the session:

```
PATCH http://localhost:3742/api/v1/sessions/sess_abc123
{ "status": "completed" }
```

### Environment Variables

The wrapped command receives these environment variables:

| Variable | Type | Description |
|----------|------|-------------|
| `CTXL_CONTEXT_PACK` | JSON string | The full Context Pack with items, omitted list, and budget accounting |
| `CTXL_SESSION_ID` | string | Session identifier (empty string if daemon unavailable) |
| `CTXL_DAEMON_URL` | string | Daemon URL for additional API calls (default: `http://localhost:3742`) |
| `CTXL_TOKENS_USED` | string (number) | Number of tokens in the injected pack |
| `CTXL_TOKENS_BUDGET` | string (number) | Declared token budget |

#### Reading the Context Pack

In your agent or wrapper script, parse the context pack:

```javascript
const pack = JSON.parse(process.env.CTXL_CONTEXT_PACK || '{}');

for (const item of pack.items || []) {
  console.log(`[${item.reason_codes.join(', ')}] ${item.source} -> ${item.section}/${item.entry_id}`);
  console.log(`  ${item.content}`);
}
```

```python
import os, json

pack = json.loads(os.environ.get('CTXL_CONTEXT_PACK', '{}'))
for item in pack.get('items', []):
    print(f"[{', '.join(item['reason_codes'])}] {item['content'][:80]}")
```

#### Making Additional API Calls

The wrapped agent can interact with the daemon using the session ID:

```bash
# Request another context pack mid-session
curl -X POST "$CTXL_DAEMON_URL/api/v1/context-pack" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$CTXL_SESSION_ID\",
    \"request_text\": \"now fix the database connection pooling\",
    \"working_dir\": \"$(pwd)\",
    \"budget_tokens\": 4000
  }"

# Submit a proposal
curl -X POST "$CTXL_DAEMON_URL/api/v1/proposals" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$CTXL_SESSION_ID\",
    \"ctx_path\": \"src/auth/.ctx\",
    \"diff_content\": \"...\",
    \"provenance\": \"agent-discovered\"
  }"
```

### CLI Options

```bash
ctxkit run [options] <cmd...>
```

| Option | Default | Description |
|--------|---------|-------------|
| `--daemon <url>` | `http://localhost:3742` | Daemon URL for session tracking |
| `--cwd <path>` | Current directory | Working directory for context resolution |
| `--budget <tokens>` | `4000` | Token budget for the context pack |
| `--agent <id>` | `default` | Agent identifier (used for agent-specific config) |
| `--request <text>` | `""` | Initial request text (if empty, uses the command args) |

### Agent-Specific Configuration

Configure different budgets and modes per agent in the workspace profile:

```yaml
# .ctxl/config.yaml
agents:
  claude:
    budget_tokens: 12000
    mode: lexical
  copilot:
    budget_tokens: 4000
    mode: lexical
  cursor:
    budget_tokens: 6000
    mode: lexical
```

When `ctxkit run --agent claude` is invoked, the `claude` agent config is loaded and overrides the workspace defaults.

### Integration Patterns

**Wrapper script:**

```bash
#!/bin/bash
# run-with-context.sh
ctxkit run \
  --agent claude \
  --budget 8000 \
  --request "$1" \
  -- claude-code "$@"
```

**CI/CD integration:**

```yaml
# GitHub Actions
- name: Run agent with context
  run: |
    ctxkit daemon start
    ctxkit run --agent ci-bot --request "review and fix linting issues" -- ./scripts/auto-fix.sh
    ctxkit daemon stop
```

---

## Graceful Degradation

All integration paths are designed to work even when the daemon is not running. No path should block the agent's primary workflow.

| Integration Path | Daemon Running | Daemon Not Running |
|-----------------|---------------|-------------------|
| **MCP Server** | All tools return structured results | All tools return `DAEMON_UNAVAILABLE` error with start instructions |
| **Claude Code Hooks** | Context injected on every turn and tool use; full session timeline | Hooks return empty context and log a warning; agent continues normally |
| **Claude Code /ctxkit Skill** | MCP tools used for all subcommands | Falls back to CLI commands; returns error if CLI also fails |
| **Codex MCP** | Tools callable from Codex sessions | Tools return error; agent falls back to instructions in AGENTS.md |
| **Codex AGENTS.md** | N/A (file-based, no daemon needed) | N/A (file-based, no daemon needed) |
| **Codex CLI Fallback** | JSON output from all commands | Commands return connection error |
| **Agent Wrapper (ctxkit run)** | Context Pack built and recorded; full session tracking | Context Pack built locally (not recorded); `CTXL_SESSION_ID` is empty |

The warning message for hooks when the daemon is unavailable:

```
[ctxkit] Warning: Could not connect to daemon, running without session tracking
```

Hooks and MCP tools must fail gracefully within 2 seconds when the daemon is down. The agent's workflow is never blocked.

---

## Next Steps

- Configure [Profiles](/guide/profiles) for per-agent settings
- Learn about [Sessions](/guide/sessions) and session tracking
- Explore the [Dashboard](/guide/dashboard) for inspecting agent sessions
- See the full [HTTP API Reference](/api/http-api)
