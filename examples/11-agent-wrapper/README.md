# Example 11: Agent Wrapper

## What This Demonstrates

How to use `ctxkit run` to wrap any existing coding agent with context
injection. The wrapper intercepts agent prompts, builds a Context Pack,
injects it transparently, and records the session -- all without modifying
the agent itself.

## Basic Usage

### Wrap any CLI agent

```bash
ctxkit run -- your-agent-command "fix the auth bug"
```

This command:
1. Starts a new session in the ctxl daemon
2. Builds a Context Pack based on the request and current directory
3. Injects the Context Pack into the agent's input
4. Launches the agent with the augmented prompt
5. Records the request event with full attribution
6. Ends the session when the agent exits

### Example with a real agent

```bash
# Wrap Claude Code
ctxkit run -- claude "fix the login handler bug in src/auth/"

# Wrap any other CLI agent
ctxkit run -- aider "add pagination to the user list endpoint"

# Wrap a custom script
ctxkit run -- python my_agent.py "refactor the database layer"
```

## How Context Injection Works

### Without ctxkit run

The agent receives only the user's request:

```
fix the auth bug in the login handler
```

### With ctxkit run

The agent receives the request plus a Context Pack:

```
--- Context Pack (2,340 / 4,000 tokens) ---

[CONTRACT_REQUIRED] Security Requirements (from src/auth/.ctx):
  All auth endpoints MUST validate JWT tokens.
  Never store raw passwords; use bcrypt with cost 12.

[LOCALITY_HIGH] Key File (from src/auth/.ctx):
  src/auth/handler.ts - Main authentication request handler

[TAG_MATCH] Gotcha (from src/auth/.ctx):
  The auth middleware silently swallows errors from expired
  tokens. Check handler.ts:42.

[PINNED] Decision (from .ctx):
  d001: Use JWT for session tokens (accepted, 2025-02-15)

--- End Context Pack ---

fix the auth bug in the login handler
```

The agent now has critical project knowledge before it starts working.

## Configuration Options

### Specify an agent identity

```bash
ctxkit run --agent claude -- claude "fix the bug"
```

The `--agent` flag tells ctxl which agent configuration to use from
`.ctxl/config.yaml`. This determines the token budget and mode:

```yaml
# .ctxl/config.yaml
agents:
  claude:
    budget_tokens: 8000
  copilot:
    budget_tokens: 2000
```

### Override the token budget

```bash
ctxkit run --budget 6000 -- claude "fix the bug"
```

Per-request budget overrides take precedence over agent and profile
defaults.

### Specify the working directory

```bash
ctxkit run --cwd src/auth -- claude "fix the auth bug"
```

The working directory determines which `.ctx` files are loaded and how
locality scoring works. By default, the current directory is used.

### Specify touched files

```bash
ctxkit run --touched src/auth/handler.ts,src/auth/middleware.ts \
  -- claude "fix the auth bug"
```

Explicitly listing touched files helps ctxl trigger the right contracts
and score entries more accurately.

### Dry run mode

```bash
ctxkit run --dry-run -- claude "fix the auth bug"
```

Shows what would be injected without actually launching the agent:

```
DRY RUN -- Agent would receive:

Context Pack (2,340 / 4,000 tokens)

Included (5 items):
  1. [CONTRACT_REQUIRED] src/auth/.ctx -> contracts/auth-security (280 tok)
  2. [LOCALITY_HIGH]     src/auth/.ctx -> key_files/handler.ts (45 tok)
  3. [TAG_MATCH]         src/auth/.ctx -> gotchas/0 (80 tok)
  4. [LOCALITY_HIGH]     src/.ctx -> key_files/auth/ (30 tok)
  5. [PINNED]            .ctx -> decisions/adr-001 (95 tok)

Omitted (2 items):
  - .ctx -> gotchas/0 (score: 0.22, reason: LOW_SCORE)
  - .ctx -> key_files/scripts/ (score: 0.15, reason: LOW_SCORE)

Agent command: claude "fix the auth bug"
Agent NOT launched (dry run mode).
```

## Session Recording

Every `ctxkit run` invocation creates a session:

```bash
# List sessions
ctxkit sessions

# Output:
# ID           AGENT    STATUS      REQUESTS  STARTED              CWD
# sess_a1b2    claude   completed   1         2026-03-01 10:15    src/auth
# sess_c3d4    aider    active      3         2026-03-01 09:30    src/api
```

Inspect a session to see what context was injected:

```bash
ctxkit sessions show sess_a1b2
```

Output:

```
Session: sess_a1b2
Agent: claude
Status: completed
Working directory: /path/to/repo/src/auth
Started: 2026-03-01 10:15:00 UTC
Ended: 2026-03-01 10:18:42 UTC

Request #1 at 10:15:00:
  Text: "fix the auth bug in the login handler"
  Context Pack: 2,340 / 4,000 tokens
  Included items:
    1. [CONTRACT_REQUIRED] auth-security-requirements (280 tok)
    2. [LOCALITY_HIGH]     key_files/handler.ts (45 tok)
    3. [TAG_MATCH]         gotchas/0 (80 tok)
    4. [LOCALITY_HIGH]     key_files/auth/ (30 tok)
    5. [PINNED]            decisions/adr-001 (95 tok)
  Omitted items:
    - gotchas/0 (score: 0.22)
    - key_files/scripts/ (score: 0.15)
```

## HTTP/Socket API for Custom Agents

For agents that are not CLI-based, ctxl provides a local HTTP API:

### Request a Context Pack

```bash
curl -X POST http://localhost:3742/api/v1/context-pack \
  -H "Content-Type: application/json" \
  -d '{
    "request_text": "fix the auth bug",
    "working_dir": "/path/to/repo/src/auth",
    "touched_files": ["src/auth/handler.ts"],
    "budget_tokens": 4000,
    "agent_id": "custom-agent"
  }'
```

Response:

```json
{
  "session_id": "sess_e5f6",
  "event_id": "evt_a1b2",
  "context_pack": {
    "total_tokens": 2340,
    "budget_tokens": 4000,
    "items": [
      {
        "source": "src/auth/.ctx",
        "section": "contracts",
        "name": "auth-security-requirements",
        "reason_code": "CONTRACT_REQUIRED",
        "tokens": 280,
        "content": "..."
      }
    ],
    "omitted": [...]
  }
}
```

### Report session events

```bash
curl -X POST http://localhost:3742/api/v1/sessions/sess_e5f6/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "tool_call",
    "tool": "read_file",
    "args": {"path": "src/auth/handler.ts"},
    "timestamp": "2026-03-01T10:16:00Z"
  }'
```

### End a session

```bash
curl -X POST http://localhost:3742/api/v1/sessions/sess_e5f6/end
```

## Best Practices

- **Start with --dry-run**: Before wrapping an agent for the first time,
  use `--dry-run` to see what context would be injected. Adjust your
  `.ctx` files and budget if needed.

- **Use agent-specific budgets**: Configure different budgets for
  different agents in `.ctxl/config.yaml`. Complex agents benefit from
  more context; quick-completion agents work better with less.

- **Specify touched files when known**: If you know which files the
  agent will work on, pass them with `--touched`. This triggers the
  right contracts and improves scoring accuracy.

- **Review sessions after complex tasks**: Use `ctxkit sessions show`
  to review what context was injected. This helps you tune your `.ctx`
  files for better results next time.

- **Use the HTTP API for IDE integration**: If you build an IDE plugin,
  use the local HTTP API to request Context Packs and report events.
  The CLI wrapper is for terminal-based agents.
