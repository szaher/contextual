# Research: CtxKit Agent Integration

**Feature**: 002-agent-integration
**Date**: 2026-03-01

## 1. MCP SDK Selection

### Decision: `@modelcontextprotocol/sdk` v1.27.x

**Rationale**: The official TypeScript SDK is the only production-grade option. v1.x is the stable release recommended for production; v2 is pre-alpha (Q1 2026 anticipated). v1 will receive bug fixes and security updates for 6+ months after v2 ships.

**Alternatives considered**:
- `mcp-framework` (npm): Community wrapper. Rejected — adds unnecessary abstraction over the official SDK, smaller ecosystem.
- Building raw JSON-RPC: Rejected — reinventing the protocol layer provides no value and increases maintenance burden.

### Key Technical Details

- **Package**: `@modelcontextprotocol/sdk` ^1.27.1
- **Peer dependency**: `zod` ^3.25 (SDK internally uses `zod/v4` but is backwards-compatible)
- **Import paths**: `@modelcontextprotocol/sdk/server/mcp.js` (McpServer), `@modelcontextprotocol/sdk/server/stdio.js` (StdioServerTransport)
- **Tool registration**: Use `server.registerTool()` (recommended API) over legacy `server.tool()`
- **Input schema**: Pass raw Zod shapes (`{ a: z.number() }`), NOT `z.object({ ... })`
- **Logging**: MUST use `console.error()` — `console.log()` corrupts stdio JSON-RPC stream
- **Tool names**: 1–128 ASCII chars (letters, digits, underscore, hyphen, dot). Our names use dots: `ctxkit.context_pack`, etc.
- **Error handling**: Throw `McpError(ErrorCode, message)` for structured errors; return `{ isError: true }` for tool-level failures

### Server Setup Pattern

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "ctxkit-mcp", version: "0.1.0" });
// ... register tools ...
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Daemon API Client

The MCP server needs to call the daemon HTTP API. The daemon runs on `localhost:PORT` (configurable). We'll use Node's built-in `fetch()` (available in Node 20+) to call daemon endpoints. No additional HTTP client library needed.

**Daemon endpoints to wrap**:
| MCP Tool | Daemon Endpoint | Method |
|----------|----------------|--------|
| `ctxkit.context_pack` | `POST /api/v1/context-pack` | POST |
| `ctxkit.log_event` | `POST /api/v1/sessions/:id/events` (new) | POST |
| `ctxkit.propose_update` | `POST /api/v1/proposals` | POST |
| `ctxkit.apply_proposal` | `POST /api/v1/proposals/:id/apply` | POST |
| `ctxkit.reject_proposal` | `PATCH /api/v1/proposals/:id` | PATCH |
| `ctxkit.sessions.list` | `GET /api/v1/sessions` | GET |
| `ctxkit.sessions.show` | `GET /api/v1/sessions/:id` | GET |
| `ctxkit.policy.get` | `GET /api/v1/config` (new) | GET |
| `ctxkit.policy.validate` | `POST /api/v1/config/validate` (new) | POST |
| `ctxkit.memory.search` | `GET /api/v1/memory/search` (new) | GET |

**Note**: Some endpoints (`log_event`, `policy.get/validate`, `memory.search`) do not exist in the current daemon. These need to be added as new routes in `@ctxl/daemon`. This is a minor extension — the underlying functionality exists in `@ctxl/core` (events store, config loader, ctx merger).

---

## 2. Claude Code Hooks Implementation

### Decision: Shell scripts compiled from TypeScript, packaged as Claude Code plugin

**Rationale**: Claude Code hooks execute shell commands. We compile TypeScript hook handlers to standalone Node.js scripts that read JSON from stdin, call the daemon API, and write JSON to stdout. Packaging as a plugin provides the cleanest installation experience.

**Alternatives considered**:
- Pure bash scripts: Rejected — complex JSON parsing, no type safety, harder to test.
- Single binary (pkg/nexe): Rejected — adds build complexity; Node.js scripts are sufficient for local execution.

### Hook Event Details

#### SessionStart
- **Input**: `{ session_id, cwd, source, model, hook_event_name }`
- **Actions**: Check daemon health, start if needed, create session via `POST /api/v1/sessions`, write env vars to `CLAUDE_ENV_FILE`
- **Output**: `{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "CtxKit session active: <id>..." } }`

#### UserPromptSubmit
- **Input**: `{ session_id, cwd, prompt, hook_event_name }`
- **Actions**: Call `POST /api/v1/context-pack` with session_id, prompt text, cwd, mode=turn
- **Output**: `{ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "<context pack text>" } }`

#### PreToolUse
- **Input**: `{ session_id, cwd, tool_name, tool_input, hook_event_name }`
- **Matcher**: `"Bash|Edit|Write|NotebookEdit|Agent"` (configurable allowlist)
- **Actions**: Call `POST /api/v1/context-pack` with mode=tool, tool_name, tool_input
- **Output**: `{ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "<tool context>" } }`

#### PostToolUse
- **Input**: `{ session_id, cwd, tool_name, tool_input, tool_response, hook_event_name }`
- **Actions**: Call `POST /api/v1/sessions/:id/events` with tool details
- **Output**: `{}` (no additional context needed)

#### PostToolUseFailure
- **Input**: `{ session_id, cwd, tool_name, tool_input, error, hook_event_name }`
- **Actions**: Call `POST /api/v1/sessions/:id/events` with error details
- **Output**: `{}` or optional recovery context

#### TaskCompleted
- **Input**: `{ session_id, cwd, task_id, task_subject, hook_event_name }`
- **Actions**: Call `POST /api/v1/proposals` with session context
- **Output**: `{ hookSpecificOutput: { hookEventName: "TaskCompleted", additionalContext: "Proposal <id> generated..." } }`

#### PreCompact
- **Input**: `{ session_id, cwd, trigger, hook_event_name }`
- **Actions**: Build compaction spine from session + active proposals + key `.ctx` pointers
- **Output**: `{ hookSpecificOutput: { hookEventName: "PreCompact", additionalContext: "<compaction spine>" } }`

#### SessionEnd
- **Input**: `{ session_id, cwd, reason, hook_event_name }`
- **Actions**: Close session via `PATCH /api/v1/sessions/:id`, optionally trigger final proposal
- **Output**: `{}` (no context injection on session end)

### Plugin Package Structure

```
packages/claude-plugin/
├── .claude-plugin/
│   └── plugin.json      # { "name": "ctxkit", "version": "0.1.0", ... }
├── hooks/
│   └── hooks.json       # Hook event registrations
├── scripts/             # Compiled hook handlers (built from TS)
├── skills/
│   └── ctxkit/
│       └── SKILL.md     # Skill definition
├── .mcp.json            # MCP server registration for Claude Code
└── package.json
```

### CLAUDE_ENV_FILE Pattern

```bash
# SessionStart hook writes:
echo "export CTXKIT_SESSION_ID=${SESSION_ID}" >> "$CLAUDE_ENV_FILE"
echo "export CTXKIT_API=http://localhost:${PORT}" >> "$CLAUDE_ENV_FILE"
echo "export CTXKIT_REPO_ROOT=${REPO_ROOT}" >> "$CLAUDE_ENV_FILE"
```

**Important**: `CLAUDE_ENV_FILE` is only available in SessionStart hooks. Known issue: plugin-installed SessionStart hooks may receive an empty `CLAUDE_ENV_FILE` (GitHub issue #11649). Workaround: fallback to writing to a well-known temp file.

### Timeout & Error Handling

- All hooks default to 5-second timeout (configurable via profile).
- On timeout/error: return empty JSON `{}` (exit code 0) — never block the agent.
- Log errors to stderr (visible in Claude Code verbose mode).

---

## 3. Codex AGENTS.md Adapter

### Decision: CLI subcommand (`ctxkit codex sync-agents`) generating plain Markdown

**Rationale**: `AGENTS.md` is plain Markdown with no proprietary syntax. Codex discovers files from repo root to CWD, injecting each as a user-role message. Generation from `.ctx` files is a straightforward transformation.

**Alternatives considered**:
- Separate binary tool: Rejected — the CLI already exists and commander supports subcommands.
- Symlink to CLAUDE.md: Rejected — different tools have different conventions; generation is cleaner.

### AGENTS.md Discovery Rules

1. **Global scope**: `~/.codex/AGENTS.md` (or `AGENTS.override.md`)
2. **Project scope**: Walk from repo root to CWD, one file per directory
3. **Merge order**: Concatenated root-to-leaf, deeper overrides earlier
4. **Size limit**: 32 KiB combined default (`project_doc_max_bytes`)
5. **Injection**: Each file becomes a user-role message prefixed with `# AGENTS.md instructions for <directory>`

### Generation Strategy

The `ctxkit codex sync-agents` command:

1. Walk the `.ctx` hierarchy from repo root
2. For each directory with `.ctx` files:
   - Read and merge `.ctx` content
   - Apply secret redaction (`detectSecrets`, `redactSecrets`)
   - Apply ignore policies
   - Generate Markdown summary within token budget
3. Write `AGENTS.md` files with CtxKit-managed markers:
   ```markdown
   <!-- CTXKIT:BEGIN - Do not edit this section -->
   ## CtxKit Project Context
   ...generated content...

   ## CtxKit Usage Policy
   ...MCP tools and CLI fallback instructions...
   <!-- CTXKIT:END -->
   ```
4. Preserve user-written content outside markers
5. Minimal diffs: only update changed sections

### MCP Registration for Codex

```bash
codex mcp add ctxkit -- node /path/to/packages/mcp/dist/index.js
```

Or in `~/.codex/config.toml`:
```toml
[mcp_servers.ctxkit]
command = "node"
args = ["/path/to/packages/mcp/dist/index.js"]
```

---

## 4. Daemon API Extensions

### New Endpoints Required

| Endpoint | Purpose | Implementation |
|----------|---------|----------------|
| `POST /api/v1/sessions/:id/events` | Log tool events to session | New route, uses existing `insertRequestEvent` store (extended for tool events) |
| `GET /api/v1/config` | Return effective merged config | New route, uses existing `loadProfile` from `@ctxl/core` |
| `POST /api/v1/config/validate` | Validate config schema | New route, validates against config types |
| `GET /api/v1/memory/search` | Search `.ctx` entries by query | New route, uses existing `mergeCtxHierarchy` + scoring |

These are thin wrappers around existing `@ctxl/core` functionality. The total new code in `@ctxl/daemon` is estimated at ~200 lines across 3 new route files.

---

## 5. /ctxkit Skill Design

### Decision: SKILL.md with MCP-first, CLI-fallback pattern

The skill definition in `SKILL.md` instructs Claude Code to:
1. Prefer MCP tool calls when the MCP server is available
2. Fall back to `ctxkit <command> --json` via Bash when MCP is unavailable

### Subcommands

| Command | MCP Tool | CLI Fallback |
|---------|----------|--------------|
| `/ctxkit inject <text>` | `ctxkit.context_pack` | `ctxkit inject "<text>" --json` |
| `/ctxkit sessions` | `ctxkit.sessions.list` | `ctxkit sessions list --json` |
| `/ctxkit memory search <q>` | `ctxkit.memory.search` | `ctxkit memory search "<q>" --json` |
| `/ctxkit propose` | `ctxkit.propose_update` | `ctxkit propose --json` |
| `/ctxkit apply <id>` | `ctxkit.apply_proposal` | `ctxkit apply <id> --json` |
| `/ctxkit policy` | `ctxkit.policy.get` | `ctxkit policy --json` |

---

## 6. Testing Strategy

### Integration Tests (packages/mcp)
- Spawn MCP server, send JSON-RPC messages over stdio, verify responses
- Test each tool with valid inputs, invalid inputs, and daemon-unavailable scenarios
- Test error handling (McpError codes, timeout, malformed input)

### Integration Tests (hooks)
- Simulate hook invocations by piping JSON to handler scripts
- Verify JSON output matches expected schemas
- Test timeout behavior, graceful degradation, CLAUDE_ENV_FILE writes

### E2E Tests
- Full lifecycle: start daemon → start MCP server → create session → build context pack → log events → propose update → close session
- Claude Code plugin: simulate SessionStart → UserPromptSubmit → PreToolUse → PostToolUse → TaskCompleted → SessionEnd
- Codex sync: generate AGENTS.md from fixture .ctx files, verify content, re-run for idempotency

### Unit Tests (targeted)
- MCP message parsing and serialization
- Hook JSON I/O serialization/deserialization
- AGENTS.md marker parsing and preservation
- Token budget enforcement in AGENTS.md generation
