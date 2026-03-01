# /ctxkit — Interactive CtxKit Control

Use `/ctxkit` to manually interact with CtxKit context and memory management.

## Subcommands

### `/ctxkit inject`
Build and display the context pack for the current working directory.

**MCP-first approach**: Call `ctxkit.context_pack` tool with:
- `session_id`: from `$CTXKIT_SESSION_ID`
- `cwd`: current working directory
- `request`: describe what you need context for
- `mode`: "turn"

**CLI fallback**: `ctxkit inject "your request" --json`

### `/ctxkit sessions`
List and inspect CtxKit sessions.

**MCP-first approach**: Call `ctxkit.sessions.list` tool, then `ctxkit.sessions.show` for details.

**CLI fallback**: `ctxkit sessions list --json`

### `/ctxkit memory search <query>`
Search `.ctx` entries by keyword.

**MCP-first approach**: Call `ctxkit.memory.search` tool with:
- `query`: your search text
- `cwd`: current working directory

**CLI fallback**: `ctxkit memory search "query" --json`

### `/ctxkit propose`
Trigger a `.ctx` update proposal from the current session.

**MCP-first approach**: Call `ctxkit.propose_update` tool with:
- `session_id`: from `$CTXKIT_SESSION_ID`
- `scope`: "cwd" (default) or "repo"

**CLI fallback**: `ctxkit propose --json`

### `/ctxkit apply <proposal_id>`
Apply an approved `.ctx` update proposal.

**MCP-first approach**: Call `ctxkit.apply_proposal` tool with:
- `proposal_id`: the proposal ID to apply

**CLI fallback**: `ctxkit apply <proposal_id> --json`

### `/ctxkit policy`
Show the effective merged configuration for the current workspace.

**MCP-first approach**: Call `ctxkit.policy.get` tool with:
- `cwd`: current working directory

**CLI fallback**: `ctxkit config show --json`

## Usage Notes

- The MCP tools are the preferred interface — they go through the CtxKit daemon and provide structured responses.
- Fall back to CLI commands only if the MCP server is not available (e.g., `ctxkit-mcp` not registered).
- All CLI commands support `--json` for machine-readable output that matches the MCP tool response schemas.
- The `$CTXKIT_SESSION_ID` environment variable is set automatically by the SessionStart hook.
