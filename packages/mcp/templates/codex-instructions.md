# CtxKit Integration Instructions for Codex

## Setup

Register the CtxKit MCP server:

```bash
codex mcp add ctxkit -- ctxkit-mcp
```

## Best Practices

### Before Responding to Prompts
Call `ctxkit.context_pack` with the user's request to get relevant project context:
- Set `mode: "turn"` for user prompts
- Set `mode: "tool"` for tool-specific context
- Use the returned context to inform your response

### After Tool Invocations
Call `ctxkit.log_event` to record tool usage:
- `event_type: "tool_success"` for successful tools
- `event_type: "tool_failure"` for failed tools
- Include `tool_name`, `tool_input`, and `tool_response`

### When Learning New Facts
Call `ctxkit.propose_update` when you discover important project information:
- Architecture decisions, coding conventions, key file purposes
- Set `scope: "cwd"` for directory-specific knowledge
- Set `scope: "repo"` for repository-wide knowledge
- Include `learned_facts` with specific statements

### Session Management
- Call `ctxkit.sessions.list` to see active sessions
- Call `ctxkit.sessions.show` for session details and timeline

### Configuration
- Call `ctxkit.policy.get` to check workspace settings
- Respect `budget_tokens` limits from the configuration
- Honor `never_read` and `never_log` ignore patterns

## Available Tools

| Tool | Purpose |
|------|---------|
| `ctxkit.context_pack` | Build context pack for requests |
| `ctxkit.log_event` | Record tool calls to timeline |
| `ctxkit.propose_update` | Generate .ctx update proposals |
| `ctxkit.apply_proposal` | Apply approved proposals |
| `ctxkit.reject_proposal` | Reject pending proposals |
| `ctxkit.sessions.list` | List sessions |
| `ctxkit.sessions.show` | Get session details |
| `ctxkit.policy.get` | Get effective configuration |
| `ctxkit.policy.validate` | Validate config schema |
| `ctxkit.memory.search` | Search .ctx entries |
