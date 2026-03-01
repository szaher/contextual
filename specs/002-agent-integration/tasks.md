# Tasks: CtxKit Agent Integration

**Input**: Design documents from `/specs/002-agent-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included per constitution requirement (E2E + Integration First). Tests are placed after implementation within each user story phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo packages**: `packages/<name>/src/`
- **Tests**: `tests/integration/`, `tests/e2e/`
- **New packages**: `packages/mcp/`, `packages/claude-plugin/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize new packages and install dependencies for the agent integration feature

- [X] T001 Create `@ctxl/mcp` package with package.json, tsconfig.json in `packages/mcp/`
- [X] T002 [P] Create `@ctxl/claude-plugin` package with package.json, tsconfig.json in `packages/claude-plugin/`
- [X] T003 Install `@modelcontextprotocol/sdk` ^1.27 and `zod` ^3.25 as dependencies in `packages/mcp/package.json`
- [X] T004 [P] Update root `pnpm-workspace.yaml` to include `packages/mcp` and `packages/claude-plugin`
- [X] T005 [P] Create shared hook types (HookInput, HookOutput) in `packages/core/src/types/hook.ts` and export from `@ctxl/core`; create MCP-specific types (ToolEvent, CompactionSpine, AgentsMdSection) in `packages/mcp/src/types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the daemon API with endpoints required by MCP tools and hooks. Build the shared daemon HTTP client.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Extend `request_events` table schema: add `event_type`, `tool_name`, `tool_input`, `tool_response`, `exit_code`, `duration_ms` columns in `packages/daemon/src/store/db.ts`
- [X] T007 Add `insertToolEvent` and `getToolEventsBySession` functions in `packages/daemon/src/store/events.ts`
- [X] T008 [P] Create events route (`POST /api/v1/sessions/:id/events`) for tool event logging in `packages/daemon/src/routes/events.ts`
- [X] T009 [P] Create config route (`GET /api/v1/config`, `POST /api/v1/config/validate`) using `loadProfile` from `@ctxl/core` in `packages/daemon/src/routes/config.ts`
- [X] T010 [P] Create memory search route (`GET /api/v1/memory/search`) using `mergeCtxHierarchy` + scoring from `@ctxl/core` in `packages/daemon/src/routes/memory.ts`
- [X] T011 Register new routes (events, config, memory) in `packages/daemon/src/server.ts`
- [X] T012 Create daemon API HTTP client with `fetch()` wrapper, error handling, and health check in `packages/mcp/src/client.ts`
- [X] T050 Add hook-specific config settings (`hooks.preToolUse.enabled`, `hooks.preToolUse.allowlist`, `hooks.preToolUse.budget`, `hooks.sessionEnd.close`, `hooks.sessionEnd.propose_final_update`, `hooks.sessionEnd.propose_scope`) to WorkspaceProfile type in `packages/core/src/types/config.ts`
- [X] T051 [P] Update `loadProfile` in `packages/core/src/config/loader.ts` to parse and merge hook-specific settings with defaults

**Checkpoint**: Daemon API extended with all required endpoints. HTTP client ready for MCP tools and hooks. Hook config settings available via `loadProfile`.

---

## Phase 3: User Story 1 — Shared MCP Server for Agent Tools (Priority: P1) 🎯 MVP

**Goal**: A stdio-based MCP server that exposes all CtxKit capabilities as structured JSON-RPC tools. Any MCP-compatible agent can discover and invoke these tools.

**Independent Test**: Spawn the MCP server over stdio, send `initialize` + `tools/list` + `tools/call` JSON-RPC messages, verify correct responses for all 10 tools.

### Implementation for User Story 1

- [X] T013 [US1] Create McpServer instance with name "ctxkit-mcp" and version, configure stdio transport in `packages/mcp/src/server.ts`
- [X] T014 [US1] Create entry point that connects server to StdioServerTransport in `packages/mcp/src/index.ts`
- [X] T015 [P] [US1] Register `ctxkit.context_pack` tool with Zod input schema and daemon API call in `packages/mcp/src/tools/context-pack.ts`
- [X] T016 [P] [US1] Register `ctxkit.log_event` tool with Zod input schema and daemon API call in `packages/mcp/src/tools/events.ts`
- [X] T017 [P] [US1] Register `ctxkit.propose_update`, `ctxkit.apply_proposal`, `ctxkit.reject_proposal` tools in `packages/mcp/src/tools/proposals.ts`
- [X] T018 [P] [US1] Register `ctxkit.sessions.list` and `ctxkit.sessions.show` tools in `packages/mcp/src/tools/sessions.ts`
- [X] T019 [P] [US1] Register `ctxkit.policy.get` and `ctxkit.policy.validate` tools in `packages/mcp/src/tools/policy.ts`
- [X] T020 [P] [US1] Register `ctxkit.memory.search` tool in `packages/mcp/src/tools/memory.ts`
- [X] T021 [US1] Add daemon-unavailable error handling: return structured McpError with start instructions across all tools in `packages/mcp/src/client.ts`
- [X] T022 [US1] Add `bin` entry to `packages/mcp/package.json` so `ctxkit-mcp` is a runnable command
- [X] T023 [US1] Integration test: MCP server init handshake, tools/list returns all 10 tools, each tool call with valid and invalid inputs, validate response schemas match contracts/mcp-tools.md definitions in `tests/integration/mcp/server.test.ts`
- [X] T024 [US1] E2E test: start daemon + MCP server over stdio, create session, build context pack, log event, propose update, verify end-to-end data flow in `tests/e2e/mcp-server.test.ts`

**Checkpoint**: MCP server fully functional. All 10 tools respond correctly over stdio. Ready for Claude Code and Codex adapters to build on.

---

## Phase 4: User Story 2 — Claude Code Plugin with Automatic Context Injection (Priority: P1)

**Goal**: A Claude Code plugin that automatically injects project context into every conversation turn and tool invocation via hooks, with no manual developer action required.

**Independent Test**: Simulate hook events by piping JSON to each hook handler script, verify JSON output matches hook-io contract. E2E: run full SessionStart→prompts→tools→TaskCompleted→SessionEnd lifecycle.

### Implementation for User Story 2

- [X] T025 [US2] Create shared hook utilities: stdin JSON reader, stdout JSON writer, graceful error handler, timeout enforcement, and non-git-directory detection in `packages/claude-plugin/src/utils.ts`; import daemon HTTP client from `@ctxl/mcp/client` (no duplicate client)
- [X] T026 [US2] Implement `SessionStart` hook: check daemon health, start daemon if needed, create session, write env vars to `CLAUDE_ENV_FILE`, return bootstrap context in `packages/claude-plugin/scripts/session-start.ts`
- [X] T027 [US2] Implement `SessionEnd` hook: close session via `PATCH /sessions/:id`, optionally trigger final proposal based on config and activity thresholds in `packages/claude-plugin/scripts/session-end.ts`
- [X] T028 [US2] Implement `UserPromptSubmit` hook: build context pack for prompt text, format as inject text with pack ID header, return as additionalContext in `packages/claude-plugin/scripts/user-prompt-submit.ts`
- [X] T029 [US2] Implement `PreToolUse` hook: build tool-specific context pack using tool_name + tool_input, return as additionalContext in `packages/claude-plugin/scripts/pre-tool-use.ts`
- [X] T030 [P] [US2] Implement `PostToolUse` hook: log tool name, inputs, outputs, file paths, exit code to session timeline via daemon events API in `packages/claude-plugin/scripts/post-tool-use.ts`
- [X] T031 [P] [US2] Implement `PostToolUseFailure` hook: log failed tool invocations with error details to session timeline in `packages/claude-plugin/scripts/post-tool-use-failure.ts`
- [X] T032 [US2] Implement `TaskCompleted` hook: trigger `.ctx` proposal via daemon proposals API, return proposal ID and summary as additionalContext in `packages/claude-plugin/scripts/task-completed.ts`
- [X] T033 [US2] Implement `PreCompact` hook: build compaction spine (session ID, env vars, active proposals, key .ctx paths), return as additionalContext in `packages/claude-plugin/scripts/pre-compact.ts`
- [X] T034 [US2] Write `hooks.json` configuration with all 8 hook event registrations, matchers, and timeouts in `packages/claude-plugin/hooks/hooks.json`
- [X] T035 [P] [US2] Write `plugin.json` manifest with name, version, description, hooks, skills, and mcpServers references in `packages/claude-plugin/.claude-plugin/plugin.json`
- [X] T036 [P] [US2] Write `.mcp.json` for MCP server registration within the Claude Code plugin in `packages/claude-plugin/.mcp.json`
- [X] T037 [US2] Add build script to compile TypeScript hook handlers to dist/ with shebang for Node.js execution in `packages/claude-plugin/package.json`
- [X] T038 [US2] Integration test: pipe JSON stdin to each hook handler, verify stdout JSON matches hook-io contract for all 8 hooks in `tests/integration/hooks/hook-handlers.test.ts`
- [X] T039 [US2] E2E test: start daemon, simulate full hook lifecycle (SessionStart → UserPromptSubmit → PreToolUse → PostToolUse → TaskCompleted → PreCompact → SessionEnd), verify session timeline and context injection, include non-git-directory graceful degradation scenario and determinism check (same prompt → same context pack content) in `tests/e2e/claude-plugin.test.ts`

**Checkpoint**: Claude Code plugin fully functional. All 8 hooks fire correctly, context is injected, tool activity is logged.

---

## Phase 5: User Story 3 — Claude Code Interactive Skill `/ctxkit` (Priority: P2)

**Goal**: Developers can type `/ctxkit` in Claude Code to manually interact with CtxKit — inspect context, search memory, manage proposals, check policies.

**Independent Test**: Invoke `/ctxkit` in Claude Code session, verify each subcommand (inject, sessions, memory search, propose, apply, policy) produces correct output.

### Implementation for User Story 3

- [X] T040 [US3] Write `SKILL.md` defining `/ctxkit` skill with subcommands (inject, sessions, memory search, propose, apply, policy), MCP-first approach, CLI fallback instructions in `packages/claude-plugin/skills/ctxkit/SKILL.md`

**Checkpoint**: `/ctxkit` skill is available in Claude Code. All subcommands documented with MCP-first + CLI-fallback pattern.

---

## Phase 6: User Story 4 — Codex MCP Tool Integration (Priority: P2)

**Goal**: Codex can discover and call CtxKit MCP tools after registration via `codex mcp add ctxkit`.

**Independent Test**: Register MCP server with Codex config format, verify tools appear, issue test tool calls.

### Implementation for User Story 4

- [X] T041 [US4] Create Codex best-practice instruction template (directs Codex to call context_pack before responding, log_event after tools, propose_update when learning) in `packages/mcp/templates/codex-instructions.md`
- [X] T042 [US4] Integration test: verify MCP server stdio interface is compatible with Codex MCP registration format (command + args in config.toml style) in `tests/integration/mcp/codex-compat.test.ts`

**Checkpoint**: MCP server is registerable with Codex. Instruction template guides Codex usage.

---

## Phase 7: User Story 5 — Codex AGENTS.md Adapter (Priority: P3)

**Goal**: `ctxkit codex sync-agents` generates `AGENTS.md` files from `.ctx` hierarchy with redaction, markers, user content preservation, and idempotent updates.

**Independent Test**: Run `sync-agents` on a fixture repo, verify generated `AGENTS.md` files contain correct content, no secrets, CtxKit markers, and user content is preserved. Re-run for zero-diff idempotency.

### Implementation for User Story 5

- [X] T043 [US5] Create AGENTS.md generator service: walk .ctx hierarchy, summarize content, apply redaction, manage markers, preserve user sections, enforce token budget in `packages/cli/src/services/agents-md.ts`
- [X] T044 [US5] Implement `ctxkit codex sync-agents` command with --repo-root, --budget, --dry-run flags in `packages/cli/src/commands/codex.ts`
- [X] T045 [US5] Register codex command group in CLI entry point in `packages/cli/src/index.ts`
- [X] T046 [US5] Integration test: AGENTS.md generation from .ctx fixtures — content correctness, secret redaction, marker handling, user content preservation in `tests/integration/agents-md.test.ts`
- [X] T047 [US5] E2E test: run sync-agents on fixture repo, verify file output, re-run for zero-diff idempotency in `tests/e2e/codex-sync.test.ts`

**Checkpoint**: `ctxkit codex sync-agents` generates correct, redacted, idempotent `AGENTS.md` files.

---

## Phase 8: User Story 6 — Codex CLI Fallback (Priority: P3)

**Goal**: CtxKit CLI commands with `--json` output work as a fallback when MCP is unavailable in Codex.

**Independent Test**: Run `ctxkit inject "..." --json`, `ctxkit sessions list --json` and verify valid JSON output matching context pack and session schemas.

### Implementation for User Story 6

- [X] T048 [US6] Verify and document CLI `--json` output compatibility for `inject`, `sessions list`, and `propose` commands; add `--json` flag if missing in `packages/cli/src/commands/inject.ts`, `packages/cli/src/commands/sessions.ts`, `packages/cli/src/commands/propose.ts`
- [X] T049 [US6] E2E test: run CLI commands with `--json` flag, verify output matches MCP tool response schemas in `tests/e2e/cli-json-output.test.ts`

**Checkpoint**: CLI --json output provides equivalent data to MCP tools for Codex fallback.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Config extensions, cross-cutting quality checks, and validation

- [X] T052 [P] Secret redaction verification: ensure no secrets in injected context, logged events, or generated AGENTS.md across all paths in `tests/e2e/secret-redaction.test.ts`
- [X] T053 [P] Performance validation: hook response times < 500ms, graceful degradation < 2s, skill response < 3s in `tests/e2e/performance.test.ts`
- [X] T054 Run full quickstart.md validation: execute all 7 scenarios from quickstart.md and verify expected outcomes
- [X] T055 Build and lint validation: ensure all new packages build clean (`pnpm build`), lint passes (`pnpm lint`), and existing tests still pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 MCP Server (Phase 3)**: Depends on Phase 2 (daemon extensions + HTTP client)
- **US2 Claude Code Plugin (Phase 4)**: Depends on Phase 2 (daemon client) + Phase 3 (MCP server for .mcp.json)
- **US3 /ctxkit Skill (Phase 5)**: Depends on Phase 4 (plugin package exists)
- **US4 Codex MCP (Phase 6)**: Depends on Phase 3 (MCP server)
- **US5 AGENTS.md (Phase 7)**: Depends on Phase 2 only (uses @ctxl/core directly)
- **US6 CLI Fallback (Phase 8)**: Depends on Phase 2 only (uses existing CLI)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — No dependencies on other stories
- **US2 (P1)**: Can start after Phase 2 — Depends on US1 for MCP server reference in .mcp.json, but hook handlers call daemon directly (not through MCP)
- **US3 (P2)**: Can start after US2 — SKILL.md goes in the claude-plugin package
- **US4 (P2)**: Can start after US1 — Only needs the MCP server to exist
- **US5 (P3)**: Can start after Phase 2 — Independent of MCP server and Claude Code plugin
- **US6 (P3)**: Can start after Phase 2 — Independent of all other stories

### Within Each User Story

- Models/types before services
- Services before tool registrations
- Core implementation before integration
- Tests after implementation (integration first, then E2E)
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T002, T004, T005 can run in parallel after T001
- **Phase 2**: T008, T009, T010 can run in parallel after T006+T007; T050+T051 can run in parallel with T008–T012
- **Phase 3**: T015–T020 (all tool registrations) can run in parallel after T013+T014
- **Phase 4**: T030+T031 (PostToolUse/Failure) can run in parallel; T035+T036 (plugin.json + .mcp.json) can run in parallel
- **Phase 5+6**: US3, US4, US5, US6 are largely independent and can run in parallel after their dependencies are met

---

## Parallel Example: User Story 1

```bash
# After T013+T014 (server + entry point), launch all tool files in parallel:
Task T015: "Register ctxkit.context_pack tool in packages/mcp/src/tools/context-pack.ts"
Task T016: "Register ctxkit.log_event tool in packages/mcp/src/tools/events.ts"
Task T017: "Register proposal tools in packages/mcp/src/tools/proposals.ts"
Task T018: "Register session tools in packages/mcp/src/tools/sessions.ts"
Task T019: "Register policy tools in packages/mcp/src/tools/policy.ts"
Task T020: "Register memory.search tool in packages/mcp/src/tools/memory.ts"
```

## Parallel Example: User Story 2

```bash
# After T025 (shared utils), hook handlers can partially parallelize:
# T030+T031 (PostToolUse + PostToolUseFailure) are independent
# T035+T036 (plugin.json + .mcp.json) are independent
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational daemon extensions (T006–T012)
3. Complete Phase 3: MCP Server — US1 (T013–T024)
4. **STOP and VALIDATE**: Test MCP server independently
5. Complete Phase 4: Claude Code Plugin — US2 (T025–T039)
6. **STOP and VALIDATE**: Test plugin with simulated hooks
7. Deploy/demo: MCP server + Claude Code plugin working end-to-end

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (MCP Server) → Test independently → **MVP: Any MCP client can use CtxKit**
3. Add US2 (Claude Code Plugin) → Test independently → **Primary value: automatic context injection**
4. Add US3 (/ctxkit Skill) → Test → **Power user control**
5. Add US4 (Codex MCP) → Test → **Codex MCP integration**
6. Add US5 (AGENTS.md) → Test → **Zero-friction Codex**
7. Add US6 (CLI Fallback) → Test → **Universal fallback**
8. Polish → Final validation → **Feature complete**

### Parallel Team Strategy

With multiple developers after Phase 2 is complete:
- **Developer A**: US1 (MCP Server) → US2 (Claude Code Plugin) → US3 (Skill)
- **Developer B**: US5 (AGENTS.md Adapter) → US6 (CLI Fallback) → US4 (Codex MCP)
- Both developers' work merges for Phase 9 Polish

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Constitution requires at least one integration or E2E test per feature — included in each story
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All hooks MUST use `console.error()` for logging (never `console.log()` in stdio-based processes)
- Hook handlers MUST exit 0 on success/graceful-failure and never block the agent
