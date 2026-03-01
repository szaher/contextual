# Feature Specification: CtxKit Agent Integration (Claude Code + Codex)

**Feature Branch**: `002-agent-integration`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "CtxKit Agent Integration Spec -- two first-class adapters (Claude Code plugin, Codex adapter) plus a shared MCP server so users can run CtxKit from inside Claude Code and Codex, with automatic context injection and traceability."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shared MCP Server for Agent Tools (Priority: P1)

A developer configures the CtxKit MCP server (`ctxkit-mcp`) so that any MCP-compatible coding agent can discover and invoke CtxKit capabilities as structured tools. The MCP server communicates over stdio and exposes tools for building context packs, logging events, proposing and applying `.ctx` updates, listing sessions, and querying policies. This is the foundation that both the Claude Code and Codex adapters build on.

**Why this priority**: The MCP server is the shared substrate. Without it, neither adapter can offer structured tool access to CtxKit. Building it first enables parallel development of both adapters and provides immediate value to any MCP-compatible agent.

**Independent Test**: Can be fully tested by spawning the MCP server over stdio, sending tool-call JSON messages, and verifying correct responses. Delivers value as a standalone integration point for any MCP client.

**Acceptance Scenarios**:

1. **Given** a developer has CtxKit installed, **When** they start `ctxkit-mcp` via stdio, **Then** the server responds to the MCP `initialize` handshake and advertises all registered tools.
2. **Given** the MCP server is running and the daemon is active, **When** a client sends a `ctxkit.context_pack` tool call with a session ID, working directory, and request text, **Then** the server returns a context pack containing items, omitted entries, token estimate, and pack ID.
3. **Given** the MCP server is running, **When** a client sends a `ctxkit.log_event` tool call with an event type and payload, **Then** the server records the event against the session and returns an event ID.
4. **Given** the MCP server is running, **When** a client sends a `ctxkit.propose_update` tool call with a session ID and scope, **Then** the server returns a proposal ID, diff content, and summary.
5. **Given** the MCP server is running, **When** a client sends a `ctxkit.apply_proposal` tool call with a proposal ID, **Then** the server applies the approved proposal and returns success confirmation.
6. **Given** the MCP server is running, **When** a client sends `ctxkit.sessions.list` or `ctxkit.sessions.show`, **Then** the server returns session data matching the existing daemon API behavior.
7. **Given** the daemon is not running, **When** a client sends any tool call, **Then** the server returns a clear error indicating the daemon must be started first.

---

### User Story 2 - Claude Code Plugin with Automatic Context Injection (Priority: P1)

A developer using Claude Code installs the `ctxkit-claude-plugin`, which automatically injects relevant project context into every conversation turn and tool invocation without any manual action. The plugin uses Claude Code hooks to: start a session on `SessionStart`, inject a Context Pack on every `UserPromptSubmit`, provide tool-specific context on `PreToolUse`, log tool activity on `PostToolUse`, propose memory updates on `TaskCompleted`, and preserve memory through compaction on `PreCompact`.

**Why this priority**: Claude Code is a primary target agent. Automatic, zero-friction context injection is the core value proposition -- developers get better AI responses without manually copying context. Co-priority with MCP because the plugin depends on MCP but also validates it.

**Independent Test**: Can be tested by installing the plugin into a Claude Code environment (or simulating hook events), running a session, and verifying that context is injected into prompts and tool calls are logged to the session timeline.

**Acceptance Scenarios**:

1. **Given** a developer has the ctxkit-claude-plugin installed, **When** a Claude Code session starts, **Then** the plugin starts the daemon (if needed), creates a CtxKit session, and sets `CTXKIT_SESSION_ID`, `CTXKIT_API`, and `CTXKIT_REPO_ROOT` as environment variables via `CLAUDE_ENV_FILE`.
2. **Given** a session is active, **When** the developer submits a prompt, **Then** the `UserPromptSubmit` hook calls CtxKit to build a context pack for the prompt text and returns it as `additionalContext`, prepended to the conversation turn.
3. **Given** a session is active, **When** Claude Code is about to invoke a tool on the allowlist (default: Bash, Edit, Write, NotebookEdit, Agent), **Then** the `PreToolUse` hook builds a tool-specific context pack using the tool name and tool input, and injects it as `additionalContext`. Read-only tools (Read, Glob, Grep) are excluded by default.
4. **Given** a session is active, **When** a tool completes (success or failure), **Then** the `PostToolUse` hook logs the tool name, inputs, outputs, file paths, and exit code to the CtxKit session timeline.
5. **Given** a session is active, **When** Claude Code marks a task as completed, **Then** the `TaskCompleted` hook triggers a `.ctx` update proposal and surfaces the proposal ID and summary as `additionalContext`.
6. **Given** a session is active and context compaction occurs, **When** the `PreCompact` hook fires, **Then** the plugin requests a "Compaction Spine" from CtxKit and injects it as `additionalContext` to preserve essential `.ctx` pointers.
7. **Given** the daemon is not running at session start, **When** the `SessionStart` hook fires, **Then** it automatically starts the daemon before creating the session.
8. **Given** a session is active, **When** the Claude Code session ends and the `SessionEnd` hook fires, **Then** the plugin closes the CtxKit session (marks completed, records end time) and optionally triggers a final `.ctx` update proposal if enabled in config and activity thresholds are met.

---

### User Story 3 - Claude Code Interactive Skill (`/ctxkit`) (Priority: P2)

A developer using Claude Code can type `/ctxkit` to manually interact with CtxKit capabilities from within the chat. The skill provides commands for viewing context packs, searching memory, managing sessions, proposing updates, and checking policies -- offering an "operator UI" inside the conversational interface.

**Why this priority**: While automatic injection (US2) handles most needs, power users want manual control to inspect what context is being injected, search memory, and manage proposals directly. This is important but not blocking for basic functionality.

**Independent Test**: Can be tested by invoking the `/ctxkit` skill in Claude Code and verifying each subcommand produces correct output by calling MCP tools (preferred) or falling back to CLI commands.

**Acceptance Scenarios**:

1. **Given** a developer is in a Claude Code session, **When** they type `/ctxkit`, **Then** the skill displays available subcommands and a brief help message.
2. **Given** a session is active, **When** the developer types `/ctxkit inject "explain auth flow"`, **Then** the skill shows the current Context Pack including items, scores, reason codes, and omitted entries.
3. **Given** a session is active, **When** the developer types `/ctxkit sessions`, **Then** the skill lists recent sessions with their IDs, status, and timestamps.
4. **Given** a session is active, **When** the developer types `/ctxkit memory search "authentication"`, **Then** the skill searches `.ctx` entries matching the query and displays results.
5. **Given** a pending proposal exists, **When** the developer types `/ctxkit apply <proposal_id>`, **Then** the skill applies the proposal and confirms the update.
6. **Given** the MCP server is unavailable, **When** the developer invokes any `/ctxkit` subcommand, **Then** the skill falls back to Bash-based CLI calls (e.g., `ctxkit inject ... --json`).

---

### User Story 4 - Codex MCP Tool Integration (Priority: P2)

A developer using Codex registers the CtxKit MCP server via `codex mcp add ctxkit`, enabling Codex to call CtxKit tools during sessions. The developer (or default instructions) can direct Codex to call `ctxkit.context_pack` before responding, `ctxkit.log_event` after tool runs, and `ctxkit.propose_update` when appropriate.

**Why this priority**: Codex is a second target agent. MCP integration provides the richest interaction but requires the shared MCP server (US1) to be complete first.

**Independent Test**: Can be tested by adding the MCP server to Codex, verifying tools appear in `/mcp`, and issuing tool calls from within a Codex session.

**Acceptance Scenarios**:

1. **Given** a developer has CtxKit installed, **When** they run `codex mcp add ctxkit -- ctxkit-mcp`, **Then** the MCP server is registered and its tools appear when running `/mcp` in Codex.
2. **Given** the MCP server is registered in Codex, **When** the developer (or instructions) directs Codex to call `ctxkit.context_pack`, **Then** Codex receives a structured context pack and can use it to inform its response.
3. **Given** the MCP server is registered, **When** Codex runs a tool and then calls `ctxkit.log_event`, **Then** the event is recorded in the CtxKit session timeline.
4. **Given** default instructions are provided, **When** Codex starts a session, **Then** it follows the best-practice directive to call `ctxkit.context_pack(mode=turn)` before responding and `ctxkit.log_event` after each tool use.

---

### User Story 5 - Codex AGENTS.md Adapter (Zero-Friction Memory Injection) (Priority: P3)

A developer runs `ctxkit codex sync-agents` to generate `AGENTS.md` files from the `.ctx` hierarchy. Codex automatically discovers and injects these files from repo root to working directory, giving Codex consistent "how to behave" instructions per directory without requiring MCP or any explicit tool calls.

**Why this priority**: This provides a passive, always-on integration path for Codex that works even without MCP. It is complementary to the MCP integration and adds value, but is not required for core functionality.

**Independent Test**: Can be tested by running `ctxkit codex sync-agents`, verifying `AGENTS.md` files are generated at appropriate directories, and confirming Codex injects them as expected.

**Acceptance Scenarios**:

1. **Given** a repository has `.ctx` files in the root and subdirectories, **When** the developer runs `ctxkit codex sync-agents`, **Then** `AGENTS.md` files are generated at corresponding directories, reflecting the `.ctx` content in Codex-native format.
2. **Given** `.ctx` files contain secrets or sensitive content, **When** `ctxkit codex sync-agents` runs, **Then** generated `AGENTS.md` files have all secrets redacted and respect ignore policies.
3. **Given** `AGENTS.md` files already exist, **When** `ctxkit codex sync-agents` runs again after `.ctx` changes, **Then** the files are updated with minimal diffs (not fully rewritten).
4. **Given** generated `AGENTS.md` files exist, **When** Codex starts a session in a subdirectory, **Then** Codex discovers and injects `AGENTS.md` from repo root through the working directory, providing layered project memory.
5. **Given** generated `AGENTS.md` includes a CtxKit usage policy block, **When** Codex processes the instructions, **Then** it follows the directive to prefer MCP tools and fall back to CLI commands.

---

### User Story 6 - Codex CLI Fallback (Priority: P3)

A developer using Codex can always invoke CtxKit directly via the local shell, regardless of whether MCP is configured. Commands like `ctxkit inject`, `ctxkit propose`, and `ctxkit sessions list` work because Codex can execute local commands in the user's environment.

**Why this priority**: This is a safety net, not a primary workflow. It ensures CtxKit is always usable even in degraded configurations.

**Independent Test**: Can be tested by requesting Codex to run `ctxkit inject "..." --json` and verifying the output is valid JSON matching the context pack schema.

**Acceptance Scenarios**:

1. **Given** Codex is running without MCP configured, **When** the developer asks Codex to run `ctxkit inject "explain the auth flow" --json`, **Then** Codex executes the command and receives a valid JSON context pack.
2. **Given** Codex is running, **When** the developer asks Codex to run `ctxkit sessions list --json`, **Then** Codex receives a JSON list of sessions from the daemon.

---

### Edge Cases

- What happens when the daemon is not running and a hook or MCP tool call is made? The system must return a clear error and, for hooks, attempt to start the daemon automatically.
- What happens when the MCP server process crashes mid-session? The agent should continue functioning without CtxKit context; errors must not block the agent's primary workflow.
- What happens when `ctxkit codex sync-agents` encounters `.ctx` files with circular refs? The sync command must break cycles and emit a warning, matching the core merger behavior.
- What happens when the context pack exceeds Codex or Claude Code's own context limits? The MCP server must respect the caller's budget and truncate appropriately.
- What happens when two concurrent sessions try to write proposals for the same `.ctx` file? The daemon's existing concurrency-safe proposal system handles this.
- What happens when hooks run in a directory that is not a git repository? Hooks must gracefully degrade, returning empty context rather than crashing.
- What happens when a `PreToolUse` hook takes too long to respond? The hook must have a timeout (configurable, default 5 seconds) to avoid blocking the agent.
- What happens when `AGENTS.md` files generated by CtxKit conflict with user-written `AGENTS.md` content? The sync command must preserve user-written sections (using markers to delineate CtxKit-managed content).

## Requirements *(mandatory)*

### Functional Requirements

**MCP Server**
- **FR-001**: System MUST expose a stdio-based MCP server (`ctxkit-mcp`) that implements the MCP protocol handshake and tool dispatch.
- **FR-002**: System MUST expose `ctxkit.context_pack` tool accepting session_id, repo_root, cwd, request, mode (turn/tool), token_budget, tool_intent, and touched_files as inputs.
- **FR-003**: System MUST expose `ctxkit.log_event` tool accepting session_id, event_type, and arbitrary payload.
- **FR-004**: System MUST expose `ctxkit.propose_update` tool accepting session_id, scope, learned_facts, and evidence_paths.
- **FR-005**: System MUST expose `ctxkit.apply_proposal` and `ctxkit.reject_proposal` tools accepting proposal_id.
- **FR-006**: System MUST expose `ctxkit.sessions.list` and `ctxkit.sessions.show` tools matching the existing daemon API behavior.
- **FR-007**: System MUST expose `ctxkit.policy.get` (returns the effective merged profile + ignore rules with source metadata) and `ctxkit.policy.validate` (validates config schema correctness, pattern validity, budget ranges, and reports warnings) tools. "Policy" is the existing profile/config system exposed under a user-facing name -- not a new rule engine.
- **FR-008**: System MUST expose `ctxkit.memory.search` tool for searching `.ctx` entries by query text.
- **FR-009**: All MCP tool responses MUST include structured output matching documented schemas (not free-form text).
- **FR-010**: The MCP server MUST return clear error objects when the daemon is unreachable, with instructions to start it.

**Claude Code Plugin**
- **FR-011**: System MUST provide a `SessionStart` hook that starts the daemon if needed, creates a session, and exports `CTXKIT_SESSION_ID`, `CTXKIT_API`, and `CTXKIT_REPO_ROOT` via `CLAUDE_ENV_FILE`.
- **FR-012**: System MUST provide a `UserPromptSubmit` hook that builds a context pack from the user's prompt text and returns it as `additionalContext`.
- **FR-013**: System MUST provide a `PreToolUse` hook that builds a tool-specific context pack using tool_name and tool_input, returning it as `additionalContext`. The hook MUST only fire for tools in a configurable allowlist (default: Bash, Edit, Write, NotebookEdit, Agent). Read-only tools (Read, Glob, Grep) are excluded by default since turn-level context from `UserPromptSubmit` already covers exploratory operations.
- **FR-014**: System MUST provide a `PostToolUse` hook that logs tool name, inputs, outputs, file paths, and exit codes to the session timeline.
- **FR-015**: System MUST provide a `PostToolUseFailure` hook that logs failed tool invocations with error details.
- **FR-016**: System MUST provide a `TaskCompleted` hook that triggers a `.ctx` update proposal and surfaces the proposal ID as `additionalContext`.
- **FR-017**: System MUST provide a `PreCompact` hook that requests a "Compaction Spine" from CtxKit and returns it as `additionalContext`.
- **FR-018**: System MUST provide a `/ctxkit` skill with subcommands: inject, sessions, memory search, propose, apply, policy.
- **FR-019**: The `/ctxkit` skill MUST prefer MCP tool calls and fall back to Bash CLI calls when MCP is unavailable.
- **FR-020**: All hooks MUST have configurable timeouts (default 5 seconds) and MUST NOT block the agent on failure.
- **FR-021**: All hooks MUST respect Claude Code's hook security model (safe scopes, managed hooks, allowlists).
- **FR-021a**: The profile/config MUST support hook-specific settings: `hooks.preToolUse.enabled` (boolean), `hooks.preToolUse.allowlist` (tool names, default: [Bash, Edit, Write, NotebookEdit, Agent]), `hooks.preToolUse.budget` (tokens, often smaller than turn budget).
- **FR-021b**: System MUST provide a `SessionEnd` hook that closes the CtxKit session (marks status as completed, persists `ended_at` and termination reason) and optionally triggers a final `.ctx` update proposal based on accumulated session activity.
- **FR-021c**: The profile/config MUST support SessionEnd settings: `hooks.sessionEnd.close` (boolean, default: true), `hooks.sessionEnd.propose_final_update` (boolean, default: false), `hooks.sessionEnd.propose_scope` (cwd|repo, default: cwd). Final proposals MUST only trigger when activity thresholds are met (files modified, commands run, errors encountered, or minimum session duration).

**Codex Adapter**
- **FR-022**: System MUST provide a `ctxkit codex sync-agents` CLI command that generates `AGENTS.md` files from the `.ctx` hierarchy.
- **FR-023**: Generated `AGENTS.md` files MUST contain a stable CtxKit usage policy block directing the agent to prefer MCP tools and fall back to CLI.
- **FR-024**: Generated `AGENTS.md` files MUST have all secrets redacted using the existing secret detection and redaction system.
- **FR-025**: The sync command MUST produce minimal diffs when re-run after `.ctx` changes (incremental updates, not full rewrites).
- **FR-026**: The sync command MUST preserve user-written content in `AGENTS.md` files by using clear markers to delineate CtxKit-managed sections.
- **FR-027**: Generated `AGENTS.md` files MUST respect token budgets to avoid overloading the agent's context window.

**Cross-Cutting**
- **FR-028**: All context injected via hooks, MCP tools, or `AGENTS.md` MUST be traceable -- each injected item must include its source `.ctx` path, reason code, and pack ID.
- **FR-029**: The system MUST never write secrets to injected context, logged events, or generated files.
- **FR-030**: The system MUST provide default best-practice instruction templates for both Claude Code (hooks config) and Codex (AGENTS.md policy block).
- **FR-031**: The system MUST support graceful degradation -- if the daemon is down, hooks return empty context and log a warning rather than blocking the agent.

### Key Entities

- **MCP Server**: A stdio-based process that translates MCP protocol messages into CtxKit daemon API calls. Exposes tools as structured JSON-RPC endpoints.
- **Hook**: A shell script or executable invoked by Claude Code at specific lifecycle events (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, TaskCompleted, PreCompact, SessionEnd). Receives JSON input on stdin, returns JSON output on stdout.
- **Skill**: A Claude Code interactive command (invoked via `/ctxkit`) that provides manual access to CtxKit capabilities within the chat interface.
- **AGENTS.md**: A Codex-native instruction file placed at repo root and/or subdirectories. Codex automatically discovers and injects these into agent context. CtxKit generates and maintains the CtxKit-managed sections.
- **Compaction Spine**: A minimal context payload designed to survive Claude Code's context compaction, containing essential `.ctx` pointers, session ID, and active proposal references.
- **Tool Intent**: A structured representation of what an agent tool is about to do (tool name + input), used to generate more targeted context packs.
- **Policy**: The effective, merged configuration governing CtxKit behavior for a workspace. Composed of the loaded profile (`.ctxl/config.yaml` + global config) plus ignore rules. Includes budget limits, scoring mode, auto-approve rules, ignore/never-read/never-log patterns, and retention settings. Not a separate rule engine -- it is the existing config system exposed under a user-facing name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can set up the MCP server and verify all tools are accessible within 5 minutes of installation.
- **SC-002**: Context injection adds less than 500 milliseconds of latency to each user prompt in Claude Code (hook response time).
- **SC-003**: 100% of tool invocations during a Claude Code session are logged to the CtxKit timeline when hooks are active.
- **SC-004**: Developers can install the Claude Code plugin and have automatic context injection working within 3 minutes (no code changes required).
- **SC-005**: `ctxkit codex sync-agents` generates `AGENTS.md` files that pass Codex's built-in validation and are correctly injected.
- **SC-006**: When the daemon is unavailable, hooks and MCP tools fail gracefully within 2 seconds (no agent workflow blocked).
- **SC-007**: Context packs injected via hooks produce identical results to those built via the CLI for the same inputs (determinism preserved).
- **SC-008**: No secrets appear in any injected context, logged events, or generated `AGENTS.md` files (verified by the existing secret detection system).
- **SC-009**: The `/ctxkit` skill responds to all subcommands within 3 seconds.
- **SC-010**: Re-running `ctxkit codex sync-agents` on unchanged `.ctx` files produces zero-diff output.

## Clarifications

### Session 2026-03-01

- Q: What does "policy" mean in FR-007 -- existing profiles or a new rule engine? → A: Policy = the existing profile/config + ignore rules (no new data model). `policy.get` returns the effective merged config with source metadata. `policy.validate` checks schema correctness, pattern validity, and budget ranges. Not a new rule engine for v1.
- Q: Should PreToolUse inject context for all tool types or a targeted subset? → A: Fire only for modifying/execution tools by default (Bash, Edit, Write, NotebookEdit, Agent). Exclude read-only tools (Read, Glob, Grep). Configurable via `hooks.preToolUse.allowlist` in profile/config.
- Q: Should there be a SessionEnd hook to close CtxKit sessions? → A: Yes. SessionEnd hook closes the session (marks completed, records end time) and optionally triggers a final `.ctx` proposal if enabled and activity thresholds are met. Defaults: close=true, propose_final_update=false.

## Assumptions

- The CtxKit daemon (Feature 001) is implemented and provides all required APIs (sessions, context packs, proposals, drift, audit).
- Claude Code's hook system supports `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `TaskCompleted`, and `PreCompact` events with JSON stdin/stdout and `additionalContext` support.
- Claude Code supports `CLAUDE_ENV_FILE` for persisting environment variables across hook invocations within a session.
- Codex supports the MCP protocol via `codex mcp add` and exposes registered tools via `/mcp`.
- Codex automatically discovers and injects `AGENTS.md` files from repo root through the working directory hierarchy.
- The MCP protocol specification (stdio transport, JSON-RPC, tool schemas) is stable and compatible with both Claude Code and Codex.
- Performance target of 500ms hook response time is achievable given local daemon communication (no network calls).
