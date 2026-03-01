# Quickstart: CtxKit Agent Integration

**Feature**: 002-agent-integration
**Date**: 2026-03-01

## Prerequisites

- Node.js 20+
- pnpm 9+
- CtxKit daemon installed and working (Feature 001)
- A repository with `.ctx` files

---

## Scenario 1: MCP Server Standalone

Test the MCP server independently of any agent.

```bash
# Build the MCP package
cd packages/mcp
pnpm build

# Start the daemon (if not already running)
ctxkit daemon start

# Test the MCP server (send JSON-RPC messages via stdio)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js

# Create a session and build a context pack
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ctxkit.context_pack","arguments":{"session_id":"test-session","cwd":"/path/to/repo","request":"explain the auth flow","mode":"turn"}}}' | node dist/index.js
```

**Expected**: MCP server responds with initialize handshake, then returns a context pack with items, omitted entries, and token estimate.

---

## Scenario 2: Claude Code Plugin Installation

Install and test the Claude Code plugin with hooks.

```bash
# Build the plugin package
cd packages/claude-plugin
pnpm build

# Install the plugin into Claude Code
claude plugin add /path/to/packages/claude-plugin

# Start a Claude Code session — the SessionStart hook should:
# 1. Start the daemon
# 2. Create a CtxKit session
# 3. Set CTXKIT_SESSION_ID, CTXKIT_API, CTXKIT_REPO_ROOT env vars
# 4. Inject bootstrap context: "CtxKit session active: <id>"

# Submit a prompt — the UserPromptSubmit hook should:
# 1. Build a context pack for the prompt
# 2. Inject it as additionalContext

# Use a tool (e.g., Edit a file) — the PreToolUse hook should:
# 1. Build tool-specific context
# 2. Inject it as additionalContext
# Then PostToolUse hook logs the tool call
```

**Expected**: Context is automatically injected into prompts and tool calls. Tool activity is logged to the session timeline.

---

## Scenario 3: /ctxkit Skill Usage

Use the interactive skill within Claude Code.

```
# In a Claude Code session:

/ctxkit                           → Shows help and available subcommands
/ctxkit inject "explain auth"     → Shows context pack with items, scores, reasons
/ctxkit sessions                  → Lists recent sessions
/ctxkit memory search "auth"      → Searches .ctx entries for "auth"
/ctxkit propose                   → Generates a .ctx update proposal
/ctxkit apply diff_abc123         → Applies a proposal
/ctxkit policy                    → Shows effective config with sources
```

**Expected**: Each subcommand returns structured results. MCP tools are preferred; CLI fallback is used if MCP is unavailable.

---

## Scenario 4: Codex MCP Integration

Register the MCP server with Codex and use tools.

```bash
# Build the MCP package
cd packages/mcp
pnpm build

# Register with Codex
codex mcp add ctxkit -- node /path/to/packages/mcp/dist/index.js

# Verify registration
# In Codex TUI: type /mcp
# Should show: ctxkit (connected) with tools:
#   - ctxkit.context_pack
#   - ctxkit.log_event
#   - ctxkit.propose_update
#   - ctxkit.apply_proposal
#   - ctxkit.reject_proposal
#   - ctxkit.sessions.list
#   - ctxkit.sessions.show
#   - ctxkit.policy.get
#   - ctxkit.policy.validate
#   - ctxkit.memory.search

# In a Codex session, the agent can call:
# "Use ctxkit.context_pack to get context for my request"
```

**Expected**: Tools appear in `/mcp`, and Codex can call them to get context packs, log events, and manage proposals.

---

## Scenario 5: AGENTS.md Generation

Generate Codex-native instruction files from `.ctx` hierarchy.

```bash
# Ensure .ctx files exist in the repo
ls -la *.ctx src/.ctx docs/.ctx

# Generate AGENTS.md files
ctxkit codex sync-agents

# Verify output
cat AGENTS.md
# Should contain:
# - <!-- CTXKIT:BEGIN --> markers
# - Project context from .ctx files
# - CtxKit usage policy block
# - No secrets or redacted content

# Verify idempotency
ctxkit codex sync-agents --dry-run
# Should report: "0 files would be updated"

# Verify in Codex
# Start Codex in the repo — AGENTS.md content should be injected
# as user-role messages in the conversation
```

**Expected**: `AGENTS.md` files are generated with redacted `.ctx` summaries and usage policy. Re-running produces zero diffs.

---

## Scenario 6: Codex CLI Fallback

Use CtxKit directly from Codex via local shell.

```bash
# In a Codex session (without MCP configured):
# Ask Codex to run:

ctxkit inject "explain the auth flow" --json
# Returns JSON context pack

ctxkit sessions list --json
# Returns JSON session list

ctxkit propose --json
# Returns JSON proposal
```

**Expected**: CLI commands work when MCP is unavailable, providing the same data in JSON format.

---

## Scenario 7: Full Lifecycle E2E

Complete lifecycle test across all components.

```bash
# 1. Start daemon
ctxkit daemon start

# 2. Start MCP server (background)
node packages/mcp/dist/index.js &

# 3. Create session via MCP
# Send initialize + tools/call ctxkit.sessions.create

# 4. Build context pack via MCP
# Send tools/call ctxkit.context_pack

# 5. Log tool events via MCP
# Send tools/call ctxkit.log_event (tool_success)
# Send tools/call ctxkit.log_event (tool_failure)

# 6. Propose update via MCP
# Send tools/call ctxkit.propose_update

# 7. Apply proposal via MCP
# Send tools/call ctxkit.apply_proposal

# 8. Close session
# Send tools/call ctxkit.sessions.close

# 9. Verify audit trail
# GET /api/v1/audit should show all events
```

**Expected**: Full session lifecycle works end-to-end through the MCP server.
