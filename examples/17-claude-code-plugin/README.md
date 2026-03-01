# Example 17: Claude Code Plugin

## What This Demonstrates

How the CtxKit Claude Code plugin provides automatic context injection
via hooks. Once installed, the plugin runs transparently during every
Claude Code session -- injecting context packs into prompts, logging
tool activity, proposing `.ctx` updates, and preserving memory across
compaction. No manual `ctxkit run` or `ctxkit inject` commands are needed.

## Plugin Structure

The plugin lives in a directory with the following layout:

```
ctxkit-claude-code-plugin/
  plugin.json          # Plugin metadata (name, version, description)
  hooks.json           # Hook definitions (8 hooks)
  .mcp.json            # MCP server registration for tool access
  scripts/
    session-start.sh   # SessionStart hook script
    prompt-inject.sh   # UserPromptSubmit hook script
    pre-tool.sh        # PreToolUse hook script
    post-tool.sh       # PostToolUse hook script (async)
    post-tool-fail.sh  # PostToolUseFailure hook script (async)
    task-complete.sh    # TaskCompleted hook script
    pre-compact.sh     # PreCompact hook script
    session-end.sh     # SessionEnd hook script
  skills/
    ctxkit.md           # Interactive /ctxkit skill definition
```

## Hooks

The plugin registers 8 hooks that cover the full lifecycle of a
Claude Code session.

### 1. SessionStart

**Trigger**: When a new Claude Code session begins.

**What it does**:
- Creates a ctxl session via the daemon API
- Exports `CTXL_SESSION_ID` and `CTXL_REPO_ROOT` as environment variables
  for subsequent hooks
- Returns bootstrap context (project summary, active contracts, recent
  decisions) as the initial system prompt addition

```bash
# scripts/session-start.sh
SESSION=$(ctxkit sessions create --agent claude-code --json)
export CTXL_SESSION_ID=$(echo "$SESSION" | jq -r '.id')
export CTXL_REPO_ROOT=$(git rev-parse --show-toplevel)

# Return bootstrap context to Claude Code
ctxkit inject --preview --budget 2000 --json
```

### 2. UserPromptSubmit

**Trigger**: Every time the user submits a prompt.

**What it does**:
- Builds a context pack based on the user's prompt text and current
  working directory
- Injects the context pack into the prompt so Claude Code receives
  relevant `.ctx` knowledge with every request

```bash
# scripts/prompt-inject.sh
ctxkit inject \
  --session "$CTXL_SESSION_ID" \
  --request "$USER_PROMPT" \
  --cwd "$PWD" \
  --agent claude-code \
  --json
```

### 3. PreToolUse

**Trigger**: Before Claude Code calls Bash, Edit, Write, NotebookEdit,
or Agent tools.

**What it does**:
- Provides tool-specific context based on the files about to be touched
- For Bash: injects relevant commands and gotchas
- For Edit/Write: injects contracts that scope-match the target file
- For NotebookEdit: injects data pipeline conventions
- For Agent: injects delegation guidelines and memory spine

```bash
# scripts/pre-tool.sh
TOOL_NAME="$1"
TOOL_ARGS="$2"

ctxkit inject \
  --session "$CTXL_SESSION_ID" \
  --tool "$TOOL_NAME" \
  --tool-args "$TOOL_ARGS" \
  --cwd "$PWD" \
  --json
```

### 4. PostToolUse

**Trigger**: After a tool call completes successfully (runs async).

**What it does**:
- Logs the tool call to the session timeline (tool name, arguments,
  files touched, duration)
- Runs asynchronously so it does not block Claude Code's response

```bash
# scripts/post-tool.sh (async)
ctxkit log-event \
  --session "$CTXL_SESSION_ID" \
  --type tool_call \
  --tool "$TOOL_NAME" \
  --args "$TOOL_ARGS" \
  --result success \
  --async
```

### 5. PostToolUseFailure

**Trigger**: After a tool call fails (runs async).

**What it does**:
- Logs the failed tool call with the error message
- Records the failure for pattern analysis (e.g., repeated failures
  may indicate a stale gotcha or missing contract)

```bash
# scripts/post-tool-fail.sh (async)
ctxkit log-event \
  --session "$CTXL_SESSION_ID" \
  --type tool_call \
  --tool "$TOOL_NAME" \
  --args "$TOOL_ARGS" \
  --result failure \
  --error "$ERROR_MSG" \
  --async
```

### 6. TaskCompleted

**Trigger**: When Claude Code finishes a task.

**What it does**:
- Triggers a `.ctx` proposal based on the files modified during the
  session
- The proposal is stored in the daemon and can be reviewed with
  `ctxkit propose`

```bash
# scripts/task-complete.sh
ctxkit propose \
  --session "$CTXL_SESSION_ID" \
  --auto-detect \
  --json
```

### 7. PreCompact

**Trigger**: Before Claude Code compacts (summarizes) the conversation
to free up context window space.

**What it does**:
- Extracts the "memory spine" -- a compact summary of key decisions,
  file changes, and unresolved issues from the current session
- Returns this spine so it is preserved through compaction, preventing
  loss of critical session state

```bash
# scripts/pre-compact.sh
ctxkit memory spine \
  --session "$CTXL_SESSION_ID" \
  --budget 1500 \
  --json
```

### 8. SessionEnd

**Trigger**: When the Claude Code session ends.

**What it does**:
- Closes the ctxl session
- Flushes any pending event logs
- Records final session statistics (duration, tool calls, proposals
  generated)

```bash
# scripts/session-end.sh
ctxkit sessions end "$CTXL_SESSION_ID" --json
```

## The /ctxkit Interactive Skill

The plugin includes an interactive skill accessible via `/ctxkit` in
Claude Code. It provides subcommands for on-demand interaction with
the context system:

```
/ctxkit status          Show current session info, injected context summary
/ctxkit memory search   Search the memory store interactively
/ctxkit memory store    Store a new memory entry from the conversation
/ctxkit propose         Manually trigger a .ctx update proposal
/ctxkit drift           Check for stale .ctx references
/ctxkit validate        Validate all .ctx files in the current repo
/ctxkit budget          Show current token budget and usage
/ctxkit inspect         Show the last injected context pack in detail
```

Example usage in a Claude Code session:

```
> /ctxkit status

Session: sess_x1y2
Agent: claude-code
Uptime: 12m 30s
Tool calls logged: 8
Context packs injected: 3
Pending proposals: 1

> /ctxkit memory search "auth token rotation"

Found 2 results:
  1. [insight] Refresh token rotation uses single-use tokens (sess_c3d4, 2026-02-28)
  2. [decision] JWT with refresh rotation chosen over session cookies (ADR-003)

> /ctxkit drift

All .ctx references are current. No drift detected.
```

## Configuration

The plugin reads configuration from `.ctxl/config.yaml`. The following
options control hook behavior:

```yaml
# .ctxl/config.yaml
version: 1
budget:
  default_tokens: 6000

agents:
  claude-code:
    budget_tokens: 8000
    mode: lexical

hooks:
  session_start:
    bootstrap_budget: 2000        # Tokens for initial context
  user_prompt_submit:
    enabled: true                 # Set to false to disable auto-injection
    budget_tokens: null           # null = use agent default
  pre_tool_use:
    enabled: true
    tools: [Bash, Edit, Write, NotebookEdit, Agent]  # Which tools trigger
  post_tool_use:
    enabled: true
    async: true                   # Always async to avoid blocking
  task_completed:
    auto_propose: true            # Automatically generate proposals
  pre_compact:
    spine_budget: 1500            # Tokens reserved for memory spine
```

## Example: A Developer Session with the Plugin Active

Here is what a typical session looks like with the plugin installed:

### Step 1: Start Claude Code

```bash
cd /path/to/my-project
claude
```

The SessionStart hook fires. The plugin creates a ctxl session,
detects the project's `.ctx` files, and injects bootstrap context:

```
[ctxkit] Session sess_x1y2 created
[ctxkit] Bootstrap context: 1,840 / 2,000 tokens
         - Project summary (150 tok)
         - 2 active contracts (520 tok)
         - 3 key files (180 tok)
         - 1 recent decision (160 tok)
```

### Step 2: Submit a prompt

```
> Fix the auth endpoint that returns wrong error format
```

The UserPromptSubmit hook fires. The plugin builds a context pack
tailored to the prompt and injects it transparently:

```
[ctxkit] Context pack injected: 2,340 / 8,000 tokens
         - auth-security contract (CONTRACT_REQUIRED)
         - api-error-format contract (CONTRACT_REQUIRED)
         - handler.ts key file (LOCALITY_HIGH)
         - auth gotcha (TAG_MATCH)
```

Claude Code now has the relevant contracts and file knowledge before
it begins working.

### Step 3: Claude Code reads and edits files

When Claude Code calls the Edit tool to modify `src/auth/handler.ts`:

- **PreToolUse** fires: injects the auth-security contract and
  handler.ts key file entry as tool-specific context
- **PostToolUse** fires (async): logs the edit event to the session
  timeline

### Step 4: Task completes

The TaskCompleted hook fires. The plugin detects that
`src/auth/handler.ts` was modified and generates a proposal:

```
[ctxkit] Proposal prop_005 generated:
         - Re-verify key_files/handler.ts in src/auth/.ctx
```

### Step 5: Compaction occurs (if the conversation is long)

If the conversation grows long enough that Claude Code triggers
compaction, the PreCompact hook fires:

```
[ctxkit] Memory spine preserved: 1,200 / 1,500 tokens
         - Files modified: src/auth/handler.ts
         - Contracts checked: auth-security, api-error-format
         - Open issue: error format in orders.ts also needs fix
```

The spine survives compaction, so Claude Code does not lose track
of what it was doing.

### Step 6: Session ends

```
> /exit
```

The SessionEnd hook fires:

```
[ctxkit] Session sess_x1y2 closed
         Duration: 18m 42s
         Tool calls: 12
         Context packs: 3
         Proposals: 1 (pending review)
```

Review the proposal later:

```bash
ctxkit propose
ctxkit sessions show sess_x1y2
```

## Installation

Install the plugin in your project:

```bash
# Add the plugin to your Claude Code configuration
cp -r ctxkit-claude-code-plugin/ .claude/plugins/ctxkit/

# Or install globally
cp -r ctxkit-claude-code-plugin/ ~/.claude/plugins/ctxkit/
```

The plugin is activated automatically when Claude Code detects the
`plugin.json` file in the plugins directory.

## Best Practices

- **Leave hooks enabled by default**: The async design means hooks add
  negligible latency. Disable individual hooks only if you have a
  specific reason.

- **Tune the bootstrap budget**: If your project has many contracts,
  increase `bootstrap_budget` so the initial context covers all
  critical rules.

- **Use /ctxkit inspect after unexpected behavior**: If Claude Code
  does something unexpected, run `/ctxkit inspect` to see what context
  it received. Missing context is the most common cause.

- **Review proposals at session end**: The TaskCompleted hook generates
  proposals but does not apply them automatically. Run `ctxkit propose`
  after each session to keep `.ctx` files current.

- **Customize pre_tool_use tools**: If your project does not use
  NotebookEdit, remove it from the tools list to reduce unnecessary
  context lookups.
