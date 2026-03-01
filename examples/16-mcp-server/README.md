# Example 16: MCP Server Setup

## What This Demonstrates

How to register and use the CtxKit MCP server with any MCP-compatible agent.
The MCP server exposes ctxl's full feature set -- context packs, memory,
sessions, proposals, and event logging -- as 10 callable tools that any
agent can invoke through the Model Context Protocol.

## Prerequisites

- The ctxl daemon must be running (`ctxkit daemon start`)
- `ctxkit-mcp` must be on your PATH (installed with the `@ctxl/mcp` package)

## Starting the MCP Server

The MCP server runs as a stdio transport, meaning the agent process spawns
it as a child process and communicates over stdin/stdout:

```bash
ctxkit-mcp
```

You do not need to start it manually. The agent launches it based on its
MCP configuration (see registration examples below).

## Daemon Dependency

The MCP server requires a running ctxl daemon. If the daemon is not running,
all tool calls will return an error with a clear message:

```bash
# Start the daemon first
ctxkit daemon start

# Verify it is running
ctxkit daemon status
```

The MCP server connects to the daemon over its local HTTP API
(default `http://localhost:3742`).

## Registering the MCP Server

### Claude Code (via .mcp.json)

Create a `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "ctxkit": {
      "command": "ctxkit-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

Claude Code reads this file on startup and spawns the MCP server
automatically.

### Codex (via codex mcp add)

```bash
codex mcp add ctxkit -- ctxkit-mcp
```

This registers the MCP server with Codex's internal registry. Codex
spawns it when a session begins.

### Other MCP-Compatible Agents

Any agent that supports the MCP stdio transport can use the server.
The registration pattern is the same: point the agent at the
`ctxkit-mcp` command.

## Available Tools

The MCP server exposes 10 tools:

| Tool | Description |
|------|-------------|
| `ctxkit.context_pack` | Build a context pack for a given request, working directory, and budget. |
| `ctxkit.inject` | Inject a context pack into a prompt string and return the augmented text. |
| `ctxkit.validate` | Validate `.ctx` files in a directory and return any errors. |
| `ctxkit.drift` | Check for stale references in `.ctx` files. |
| `ctxkit.propose_update` | Generate a `.ctx` update proposal based on observed changes. |
| `ctxkit.apply_proposal` | Apply an approved `.ctx` update proposal by ID. |
| `ctxkit.log_event` | Log a tool call or other event to the current session. |
| `ctxkit.session_info` | Get information about the current or a specific session. |
| `ctxkit.memory.search` | Search the memory store by query, tags, or time range. |
| `ctxkit.memory.store` | Store a new memory entry (insight, decision, or observation). |

## Example Tool Call Flows

### Building a Context Pack

An agent requests a context pack for the current task:

```json
{
  "tool": "ctxkit.context_pack",
  "arguments": {
    "request_text": "fix the auth endpoint error format",
    "working_dir": "/path/to/repo/src/auth",
    "budget_tokens": 6000,
    "touched_files": ["src/auth/handler.ts"]
  }
}
```

Response:

```json
{
  "session_id": "sess_m1n2",
  "context_pack": {
    "total_tokens": 2340,
    "budget_tokens": 6000,
    "items": [
      {
        "source": "src/auth/.ctx",
        "section": "contracts",
        "name": "auth-security",
        "reason_code": "CONTRACT_REQUIRED",
        "tokens": 280,
        "content": "All auth endpoints MUST validate JWT tokens..."
      },
      {
        "source": "src/auth/.ctx",
        "section": "key_files",
        "name": "handler.ts",
        "reason_code": "LOCALITY_HIGH",
        "tokens": 45,
        "content": "Main authentication request handler"
      }
    ],
    "omitted": [
      {
        "source": ".ctx",
        "section": "gotchas",
        "name": "gotchas/0",
        "reason_code": "LOW_SCORE",
        "score": 0.22
      }
    ]
  }
}
```

### Logging a Tool Event

After the agent calls a tool (for example, editing a file), it logs the
event so ctxl can track what happened during the session:

```json
{
  "tool": "ctxkit.log_event",
  "arguments": {
    "session_id": "sess_m1n2",
    "event_type": "tool_call",
    "tool_name": "edit_file",
    "tool_args": {
      "path": "src/auth/handler.ts",
      "operation": "replace"
    },
    "timestamp": "2026-03-01T10:16:00Z"
  }
}
```

Response:

```json
{
  "event_id": "evt_p3q4",
  "status": "recorded"
}
```

### Proposing a .ctx Update

After the agent finishes a task, it can ask ctxl to propose updates
to `.ctx` files based on what changed:

```json
{
  "tool": "ctxkit.propose_update",
  "arguments": {
    "session_id": "sess_m1n2",
    "working_dir": "/path/to/repo",
    "changed_files": ["src/auth/handler.ts", "src/auth/middleware.ts"]
  }
}
```

Response:

```json
{
  "proposals": [
    {
      "id": "prop_005",
      "file": "src/auth/.ctx",
      "section": "key_files",
      "type": "re-verification",
      "diff": "  - path: handler.ts\n-    verified_at: \"d4e5f6a\"\n+    verified_at: \"g7h8i9j\"",
      "locked": false
    }
  ]
}
```

### Searching Memory

An agent can search the memory store for relevant past observations,
decisions, or insights:

```json
{
  "tool": "ctxkit.memory.search",
  "arguments": {
    "query": "auth token refresh",
    "tags": ["auth", "jwt"],
    "limit": 5
  }
}
```

Response:

```json
{
  "results": [
    {
      "id": "mem_r5s6",
      "type": "insight",
      "content": "Refresh token rotation was added in session sess_c3d4. The implementation uses single-use tokens stored in the sessions table.",
      "tags": ["auth", "jwt", "refresh"],
      "created_at": "2026-02-28T15:45:00Z",
      "session_id": "sess_c3d4",
      "relevance_score": 0.92
    }
  ]
}
```

## Example .mcp.json Configuration

A complete `.mcp.json` with environment overrides:

```json
{
  "mcpServers": {
    "ctxkit": {
      "command": "ctxkit-mcp",
      "args": [],
      "env": {
        "CTXL_DAEMON_PORT": "3742",
        "CTXL_LOG_LEVEL": "info"
      }
    }
  }
}
```

Place this file in your project root. It will be picked up by any
MCP-compatible agent that scans for `.mcp.json`.

## Best Practices

- **Start the daemon before the agent session**: The MCP server requires
  the daemon. Start it once with `ctxkit daemon start` and leave it
  running.

- **Use context_pack over inject for programmatic agents**: The
  `context_pack` tool returns structured JSON that an agent can reason
  about. The `inject` tool returns a flat string, which is better for
  prompt-based workflows.

- **Log events for full observability**: Call `log_event` after each
  significant tool call so that session inspection and proposals work
  accurately.

- **Search memory before starting a task**: Use `memory.search` to check
  whether the codebase has relevant history from past sessions. This
  avoids repeating mistakes or rediscovering known patterns.

- **Let the agent propose updates**: After a task completes, call
  `propose_update` so that `.ctx` files stay current. Review proposals
  with `ctxkit propose` from the CLI.
