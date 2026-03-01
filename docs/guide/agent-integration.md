# Agent Integration

ctxl integrates with any AI coding agent through the `ctxkit run` wrapper. This page covers how wrapping works, what environment variables are injected, and how to configure agent-specific behavior.

## How `ctxkit run` Works

The `ctxkit run` command wraps an agent command with context injection:

```bash
ctxkit run --agent claude --request "fix the auth bug" -- your-agent-command arg1 arg2
```

The execution flow has five steps:

### Step 1: Create Session

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

### Step 2: Build Context Pack

ctxl merges the `.ctx` hierarchy, scores entries against the request text, and assembles a budget-constrained Context Pack using the core library directly:

```typescript
const result = buildContextPack({
  workingDir,
  repoRoot,
  requestText: options.request || cmdArgs.join(' '),
  budgetTokens,
});
```

### Step 3: Record Event

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

### Step 4: Spawn Agent

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

### Step 5: End Session

When the wrapped command exits, ctxl ends the session:

```
PATCH http://localhost:3742/api/v1/sessions/sess_abc123
{ "status": "completed" }
```

## Environment Variables

The wrapped command receives these environment variables:

| Variable | Type | Description |
|----------|------|-------------|
| `CTXL_CONTEXT_PACK` | JSON string | The full Context Pack with items, omitted list, and budget accounting |
| `CTXL_SESSION_ID` | string | Session identifier (empty string if daemon unavailable) |
| `CTXL_DAEMON_URL` | string | Daemon URL for additional API calls (default: `http://localhost:3742`) |
| `CTXL_TOKENS_USED` | string (number) | Number of tokens in the injected pack |
| `CTXL_TOKENS_BUDGET` | string (number) | Declared token budget |

### Reading the Context Pack

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

### Making Additional API Calls

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

## CLI Options

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

## Agent-Specific Configuration

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

## Graceful Degradation

ctxl is designed to work even when the daemon is not running:

| Component | Daemon Running | Daemon Not Running |
|-----------|---------------|-------------------|
| Context Pack | Built and recorded | Built locally (not recorded) |
| Session tracking | Full tracking | Skipped with warning |
| Environment variables | All populated | `CTXL_SESSION_ID` is empty |
| Agent execution | Normal | Normal |

The warning message:

```
[ctxkit] Warning: Could not connect to daemon, running without session tracking
```

## Integration Patterns

### Wrapper Script

Create a shell script that wraps your agent:

```bash
#!/bin/bash
# run-with-context.sh
ctxkit run \
  --agent claude \
  --budget 8000 \
  --request "$1" \
  -- claude-code "$@"
```

### CI/CD Integration

Use `ctxkit run` in CI to inject context for automated agents:

```yaml
# GitHub Actions
- name: Run agent with context
  run: |
    ctxkit daemon start
    ctxkit run --agent ci-bot --request "review and fix linting issues" -- ./scripts/auto-fix.sh
    ctxkit daemon stop
```

### IDE Plugin Integration

IDE plugins can call the daemon HTTP API directly:

```typescript
// Fetch context for the current file and request
const response = await fetch('http://localhost:3742/api/v1/context-pack/preview?' +
  `request=${encodeURIComponent(request)}&cwd=${encodeURIComponent(workingDir)}&budget=4000`
);
const result = await response.json();
```

## Next Steps

- Configure [Profiles](/guide/profiles) for per-agent settings
- Learn about [Sessions](/guide/sessions) and session tracking
- Explore the [Dashboard](/guide/dashboard) for inspecting agent sessions
- See the full [HTTP API Reference](/api/http-api)
