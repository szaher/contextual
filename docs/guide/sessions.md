# Sessions

Sessions track agent interactions over time, recording what context was injected, what the agent asked, and what happened as a result. Every `ctxkit run` invocation creates a session that provides full observability.

## Session Lifecycle

```
created (active) --> requests happen --> ended (completed)
```

A session is created when:
- `ctxkit run -- agent-command` is executed
- A `POST /api/v1/sessions` request is made to the daemon

A session ends when:
- The wrapped agent process exits
- A `PATCH /api/v1/sessions/:id` request sets status to `completed`

## Session Data

Each session records:

| Field | Description |
|-------|-------------|
| `id` | Unique session identifier |
| `repo_path` | Absolute path to the repository root |
| `working_dir` | Working directory where the agent was invoked |
| `branch` | Git branch at session start (detected via `git rev-parse --abbrev-ref HEAD`) |
| `agent_id` | Identifier for the agent (e.g., "claude", "copilot") |
| `status` | `active` or `completed` |
| `started_at` | Timestamp when the session was created |
| `ended_at` | Timestamp when the session was completed (null if active) |
| `request_count` | Number of requests recorded in this session |

## Request Events

Each request within a session is recorded as an event containing:

| Field | Description |
|-------|-------------|
| `request_text` | The text of the agent's request |
| `context_pack` | The full Context Pack that was injected (JSON) |
| `omitted_items` | Items considered but excluded (JSON) |
| `token_count` | Total tokens in the injected pack |
| `budget` | The declared token budget |
| `deep_read` | Deep-read decision details if triggered (JSON) |
| `created_at` | Timestamp of the event |

## Using Sessions

### Creating a Session via `ctxkit run`

The most common way to create a session:

```bash
ctxkit run --agent claude --request "refactor the auth module" -- your-agent-command
```

This automatically:

1. Creates a session on the daemon with repo path, working directory, branch, and agent ID
2. Builds a Context Pack
3. Records the request event on the daemon
4. Spawns the agent with environment variables
5. Ends the session when the agent exits

### Listing Sessions

```bash
ctxkit sessions
```

Output:

```
ID               Agent      Status       Requests   Started
------------------------------------------------------------------------
sess_abc123      claude     active       3          2026-03-01T10:30:00Z
sess_def456      copilot    completed    7          2026-03-01T09:15:00Z
sess_ghi789      default    completed    1          2026-02-28T16:00:00Z

Total: 3
```

Filter by status:

```bash
ctxkit sessions --status active
ctxkit sessions --status completed
```

### Inspecting a Session

```bash
ctxkit sessions show sess_abc123
```

Output:

```
Session: sess_abc123
  Status: active
  Agent: claude
  Repo: /path/to/project
  Dir: /path/to/project/src/auth
  Branch: feature/auth-refactor
  Started: 2026-03-01T10:30:00Z
  Ended: -

  Timeline (3 requests):
  ------------------------------------------------------------
  1. [2026-03-01T10:30:15Z] refactor the auth module (2100/4000 tok)
  2. [2026-03-01T10:35:42Z] fix the login handler type err... (3200/4000 tok)
  3. [2026-03-01T10:40:01Z] add rate limiting to auth endp... (2800/4000 tok)
```

## Environment Variables

When `ctxkit run` wraps an agent, it injects these environment variables:

| Variable | Description |
|----------|-------------|
| `CTXL_CONTEXT_PACK` | Full Context Pack as JSON |
| `CTXL_SESSION_ID` | Session ID for this run |
| `CTXL_DAEMON_URL` | Daemon URL (default: `http://localhost:3742`) |
| `CTXL_TOKENS_USED` | Number of tokens in the injected pack |
| `CTXL_TOKENS_BUDGET` | Declared token budget |

Agents can read `CTXL_CONTEXT_PACK` to access the injected context, and use `CTXL_SESSION_ID` plus `CTXL_DAEMON_URL` to make further API calls to the daemon.

## Session Storage

Sessions are stored in the daemon's SQLite database at `~/.ctxl/data.db`. The database is created automatically when the daemon starts.

Retention is configurable via profiles:

```yaml
# .ctxl/config.yaml
retention:
  sessions_days: 30    # Keep sessions for 30 days (default)
  audit_days: 90       # Keep audit entries for 90 days (default)
```

## Daemon Connectivity

If the daemon is not running when `ctxkit run` is executed, the CLI falls back gracefully:

```
[ctxkit] Warning: Could not connect to daemon, running without session tracking
```

Context injection still works (it uses the core library directly), but session tracking and event recording are skipped. The agent still receives the `CTXL_CONTEXT_PACK` environment variable.

## API Reference

### Create a Session

```bash
curl -X POST http://localhost:3742/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "repo_path": "/path/to/repo",
    "working_dir": "/path/to/repo/src/auth",
    "branch": "main",
    "agent_id": "claude"
  }'
```

Response (201):

```json
{
  "id": "sess_abc123",
  "status": "active",
  "started_at": "2026-03-01T10:30:00.000Z"
}
```

### List Sessions

```bash
curl "http://localhost:3742/api/v1/sessions?status=active&limit=20&offset=0"
```

Response:

```json
{
  "sessions": [...],
  "total": 5
}
```

### Get Session Details

```bash
curl "http://localhost:3742/api/v1/sessions/sess_abc123"
```

Response includes full session data with the `events` timeline.

### End a Session

```bash
curl -X PATCH http://localhost:3742/api/v1/sessions/sess_abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

Response:

```json
{
  "id": "sess_abc123",
  "status": "completed",
  "ended_at": "2026-03-01T11:00:00.000Z"
}
```

## Next Steps

- Learn about [Agent Integration](/guide/agent-integration) for wrapping agents
- Explore the [Dashboard](/guide/dashboard) for visual session inspection
- Review the full [HTTP API Reference](/api/http-api)
