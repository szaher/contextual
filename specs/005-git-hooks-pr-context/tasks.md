# Tasks: Git Hooks PR Context & Embedded UI

**Input**: Design documents from `/specs/005-git-hooks-pr-context/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create the new module structure and shared types needed by all user stories

- [x] T001 Create git utilities module directory and index at `packages/core/src/git/index.ts` — export all git module functions
- [x] T002 [P] Define trailer types (TrailerData, ParsedTrailer, CommitContextRecord) in `packages/core/src/git/types.ts` per data-model.md entities
- [x] T003 Define hook policy types (HookPolicy, HookInstallStatus) in `packages/core/src/git/types.ts` per data-model.md entities

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core trailer parsing/formatting and database schema that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement trailer formatter in `packages/core/src/git/trailer-formatter.ts` — function `formatTrailers(data: TrailerData): string` that produces `Ctxkit-Session`, `Ctxkit-Files`, `Ctxkit-Entries`, `Ctxkit-Timestamp` git trailer lines per `contracts/trailer-format.md`. Apply `redactSecrets()` from `packages/core/src/redact/secrets.ts` to all values before formatting.
- [x] T005 Implement trailer parser in `packages/core/src/git/trailer-parser.ts` — function `parseTrailers(commitMessage: string): ParsedTrailer | null` that extracts `Ctxkit-*` trailers from commit messages. Parse `Ctxkit-Files` by splitting on `, `. Return null if no `Ctxkit-*` trailers found. Follow parsing rules in `contracts/trailer-format.md`.
- [x] T006 Implement git log querying in `packages/core/src/git/commit-log.ts` — function `queryCommitsWithTrailers(cwd: string, options: { since?: string, until?: string, limit?: number, sessionId?: string }): CommitContextRecord[]` that runs `git log --format` and parses trailers from each commit using the parser from T005.
- [x] T007 Export all git module functions from `packages/core/src/index.ts` — add `export * from './git/index.js'`
- [x] T008 Add `commit_context` table to daemon SQLite schema in `packages/daemon/src/store/db.ts` — CREATE TABLE with columns: `commit_hash TEXT PRIMARY KEY`, `session_id TEXT`, `files_changed TEXT`, `entry_count INTEGER`, `trailer_timestamp TEXT`, `author TEXT`, `message_subject TEXT`, `indexed_at TEXT`. Add indexes on `session_id` and `trailer_timestamp` per data-model.md schema.

**Checkpoint**: Foundation ready — trailer formatting, parsing, git log querying, and database schema are in place

---

## Phase 3: User Story 1 — Install Git Hooks via CLI (Priority: P1) 🎯 MVP

**Goal**: Developer runs `ctxkit hooks init` and a `prepare-commit-msg` hook is installed that injects minimal context trailers into commit messages.

**Independent Test**: Run `ctxkit hooks init` in a test repo, make a commit with a staged .ctx file, verify the commit message contains `Ctxkit-*` trailers.

### Implementation for User Story 1

- [x] T009 [US1] Create the `prepare-commit-msg` hook shell script template in `packages/cli/src/hooks/prepare-commit-msg.sh` — POSIX shell script that: (1) checks if ctxkit CLI is available, (2) checks `$2` arg and skips injection for non-interactive commits (rebase, squash, amend) per spec edge cases, (3) calls `ctxkit hooks inject-trailers "$1"` passing the commit message file path, (4) exits 0 on failure (never block commits). Must complete within 500ms per FR-007.
- [x] T010 [US1] Implement `ctxkit hooks inject-trailers <msg-file>` subcommand in `packages/cli/src/commands/hooks-cmd.ts` — reads the commit message file, queries daemon for active session (200ms timeout per FR-007), checks git staging area for .ctx files, formats trailers using `formatTrailers()` from T004, appends trailers to the message file. If appending trailers would exceed 72KB (GitHub soft limit), truncate `Ctxkit-Files` list and append `(truncated, see session sess_XXX)`. No-op if no active session and no .ctx files staged (FR-005).
- [x] T011 [US1] Extend `ctxkit hooks init` in `packages/cli/src/commands/hooks-cmd.ts` to install the `prepare-commit-msg` hook — detect existing hooks and chain with them (rename original to `prepare-commit-msg.ctxkit-original`, create wrapper that calls original first then appends trailers) per research.md R8. Set file permissions to 755.
- [x] T012 [US1] Implement `ctxkit hooks status` subcommand in `packages/cli/src/commands/hooks-cmd.ts` — check `.git/hooks/` for `pre-commit`, `post-commit`, `prepare-commit-msg` hooks. Report installed/outdated/not_installed/chained status. Support `--json` output per `contracts/cli-commands.md`.
- [x] T013 [US1] Add integration test for trailer formatting and redaction in `tests/integration/trailer-parsing.test.ts` — test `formatTrailers()` produces correct git trailer format, test redaction strips secrets from trailer values, test round-trip (format → parse → compare).
- [x] T014 [US1] Add E2E test for hook install and commit in `tests/e2e/git-hooks.test.ts` — create temp git repo, run `ctxkit hooks init`, stage a .ctx file, make a commit, verify commit message contains `Ctxkit-Timestamp` trailer. Test hook chaining with pre-existing hook. Test no-op when no .ctx files staged.

**Checkpoint**: User Story 1 complete — `ctxkit hooks init` installs the prepare-commit-msg hook, commits include context trailers

---

## Phase 4: User Story 2 — Auto Hook Install via Claude Code Plugin (Priority: P2)

**Goal**: The Claude Code plugin automatically checks for and installs the ctxkit git hook at session start based on configurable policy.

**Independent Test**: Start a Claude Code session in a repo without hooks installed, verify the plugin installs the prepare-commit-msg hook automatically.

### Implementation for User Story 2

- [x] T015 [US2] Add hook policy configuration support to `packages/core/src/config/loader.ts` — extend the ctxl config schema to include `hooks.auto_install` field with values `auto | prompt | skip`, defaulting to `prompt`. Read from `.ctxl` config file or `~/.ctxl/config.yaml`.
- [x] T016 [US2] Extend the SessionStart hook script in `packages/claude-plugin/src/scripts/session-start.ts` — at session start, check if `prepare-commit-msg` hook is installed (by reading `.git/hooks/prepare-commit-msg`). If not installed, check hook policy: if `auto` → install silently, if `prompt` → output a systemMessage suggesting installation, if `skip` → do nothing. Track declined status per FR-009 acceptance scenario 3.
- [x] T017 [US2] Add integration test for plugin hook auto-install in `tests/integration/plugin-hook-install.test.ts` — test auto-install creates hook, test prompt mode returns systemMessage, test skip mode is no-op, test declined preference is respected.

**Checkpoint**: User Story 2 complete — Claude Code plugin auto-installs hooks based on policy

---

## Phase 5: User Story 3 — Dashboard Commit History View (Priority: P2)

**Goal**: The dashboard UI displays a commit history view that parses context trailers from git log and presents them in a browsable format with filtering.

**Independent Test**: Open the dashboard with commits containing ctxkit trailers, verify the commit history page displays parsed trailer data with session linking and filtering.

### Implementation for User Story 3

- [x] T018 [US3] Create commit context API routes in `packages/daemon/src/routes/commit-context-routes.ts` — implement `GET /commit-context` (list commits with trailers, support `cwd`, `session_id`, `since`, `until`, `limit`, `has_trailers` query params) and `GET /commit-context/:hash` (single commit detail with linked session data) per `contracts/api-endpoints.md`. Use `queryCommitsWithTrailers()` from T006. Cache results in `commit_context` table from T008.
- [x] T019 [US3] Create hooks status API route in `packages/daemon/src/routes/hooks-routes.ts` — implement `GET /hooks/status` that checks hook installation status for a given `cwd` per `contracts/api-endpoints.md`.
- [x] T020 [US3] Register new routes in `packages/daemon/src/server.ts` — import and mount `commitContextRoutes` and `hooksRoutes` under `/api/v1`.
- [x] T021 [P] [US3] Add commit context API client functions in `packages/ui/src/services/api.ts` — add `listCommitContext(params)`, `getCommitContext(hash)`, and `getHooksStatus(cwd)` functions following the existing fetch wrapper pattern.
- [x] T022 [US3] Create CommitHistoryPage component in `packages/ui/src/pages/CommitHistoryPage.tsx` — display a timeline of commits with parsed trailer data. Show commit hash, subject, author, date, and trailer fields (session ID as clickable link to `/sessions/:id`, .ctx file list, entry count). Support filtering by session ID, date range, and trailers-only toggle per FR-011.
- [x] T023 [US3] Add `/commits` route in `packages/ui/src/App.tsx` — add route for CommitHistoryPage. Add navigation link in the sidebar/header.
- [x] T024 [US3] Add integration test for commit context API in `tests/integration/commit-context-api.test.ts` — test list endpoint returns commits with trailers, test filtering by session ID, test single commit detail includes linked session, test empty results when no trailers.
- [x] T025 [US3] Add E2E test for dashboard commit view in `tests/e2e/dashboard-commits.test.ts` — create repo with commits containing trailers, start daemon, query commit-context API, verify response structure matches contract.

**Checkpoint**: User Story 3 complete — dashboard shows browsable commit history with parsed trailer data

---

## Phase 6: User Story 4 — Serve Dashboard from CLI (Priority: P3)

**Goal**: Developer runs `ctxkit dashboard` and a local web server starts serving the dashboard UI, connecting to the daemon if available or reading from git history directly.

**Independent Test**: Run `ctxkit dashboard` in a repo, verify the dashboard loads in the browser with commit context data.

### Implementation for User Story 4

- [x] T026 [US4] Create dashboard CLI command in `packages/cli/src/commands/dashboard-cmd.ts` — implement `ctxkit dashboard [--port <port>] [--no-open]` per `contracts/cli-commands.md`. Start the daemon if not already running (reuse logic from `daemon.ts`), configure Hono to serve `@ctxkit/ui` dist files as static assets, open the default browser unless `--no-open` is passed.
- [x] T027 [US4] Register dashboard command in `packages/cli/src/index.ts` — import and register `dashboardCommand` in the Commander program.
- [x] T028 [US4] Add static file serving middleware to `packages/daemon/src/server.ts` — add Hono `serveStatic` middleware that serves the UI build output when the dashboard is requested. Only activate when invoked via the dashboard command (not the regular daemon start).
- [x] T029 [US4] Add E2E test for CLI dashboard in `tests/e2e/cli-dashboard.test.ts` — start dashboard via CLI command, verify HTTP response on the configured port returns HTML, verify `/api/v1/health` is accessible.

**Checkpoint**: User Story 4 complete — `ctxkit dashboard` serves the full UI from the CLI

---

## Phase 7: User Story 5 — Remove Git Hooks (Priority: P3)

**Goal**: Developer can cleanly remove the ctxkit prepare-commit-msg hook without affecting other hooks.

**Independent Test**: Install hook, verify it works, remove it, verify commits are no longer modified and any chained original hook is restored.

### Implementation for User Story 5

- [x] T030 [US5] Implement `ctxkit hooks remove` subcommand in `packages/cli/src/commands/hooks-cmd.ts` — support `--all` (remove all ctxkit hooks) and `--context-trailers` (remove only prepare-commit-msg) flags per `contracts/cli-commands.md`. When removing a chained hook, restore the original from `prepare-commit-msg.ctxkit-original`. Delete the ctxkit hook file and set proper permissions on restored hook.
- [x] T031 [US5] Add E2E test for hook removal in `tests/e2e/git-hooks.test.ts` — extend existing test file: install hook, make commit with trailers, remove hook, make another commit, verify second commit has no trailers. Test chained hook restoration.

**Checkpoint**: User Story 5 complete — hooks can be cleanly removed with original hooks restored

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, build verification, and final quality checks

- [x] T032 [P] Add MCP tool for commit context querying in `packages/mcp/src/index.ts` — add `ctxkit_commit_context` tool that wraps the commit context query functionality for MCP-compatible agents
- [x] T033 [P] Update README.md with git hooks documentation — add section describing `ctxkit hooks init`, trailer format, and dashboard usage
- [x] T034 [P] Update `docs/guide/` with git hooks guide page — describe installation, trailer format, dashboard viewing, and Claude Code integration
- [x] T035 Verify full build passes (`pnpm build`) and all existing tests still pass (`pnpm test && pnpm test:e2e`)
- [x] T036 Run `quickstart.md` validation — execute each command from quickstart.md in a test repo and verify expected outputs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phases 3–7)**: All depend on Foundational phase completion
  - US1 (P1): Can start immediately after Phase 2
  - US2 (P2): Depends on US1 (uses the hook installation logic)
  - US3 (P2): Independent of US1/US2 (uses only core trailer parser + daemon)
  - US4 (P3): Depends on US3 (serves the dashboard including commit history page)
  - US5 (P3): Depends on US1 (removes what US1 installs)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
  ├── US1 (Install Hooks) ──── MVP
  │     ├── US2 (Auto-Install via Plugin)
  │     └── US5 (Remove Hooks)
  └── US3 (Dashboard Commit History)
        └── US4 (Serve Dashboard from CLI)
```

### Within Each User Story

- Core library code before CLI commands
- CLI commands before plugin integration
- API routes before UI components
- Implementation before tests (tests validate working code)

### Parallel Opportunities

- T002, T003 can run in parallel (different type definitions in same file)
- T004, T005 can run in parallel after T002/T003 (formatter and parser are independent)
- T021 can run in parallel with T018–T020 (UI client vs daemon routes)
- US3 can run in parallel with US1 (independent integration paths)
- T032, T033, T034, T035 can all run in parallel (different files)

---

## Parallel Example: User Story 1

```bash
# After Phase 2 completes, launch US1 tasks:
# Sequential (dependencies):
Task T009: "Create prepare-commit-msg hook shell script template"
Task T010: "Implement ctxkit hooks inject-trailers subcommand" (depends on T009)
Task T011: "Extend ctxkit hooks init with prepare-commit-msg" (depends on T009)
Task T012: "Implement ctxkit hooks status" (independent, can parallel with T010/T011)

# Then tests:
Task T013: "Integration test for trailer formatting" (parallel with T014)
Task T014: "E2E test for hook install and commit" (parallel with T013)
```

## Parallel Example: User Story 3

```bash
# After Phase 2 completes, launch US3 tasks:
# Backend (sequential):
Task T018: "Create commit context API routes"
Task T019: "Create hooks status API route" (parallel with T018)
Task T020: "Register new routes in server.ts" (after T018, T019)

# Frontend (can start after T018 contract is defined):
Task T021: "Add commit context API client functions" (parallel with T019/T020)
Task T022: "Create CommitHistoryPage component" (after T021)
Task T023: "Add /commits route in App.tsx" (after T022)

# Tests (after implementation):
Task T024: "Integration test for commit context API" (parallel with T025)
Task T025: "E2E test for dashboard commit view"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T008)
3. Complete Phase 3: User Story 1 (T009–T014)
4. **STOP and VALIDATE**: Install hook in a real repo, make a commit, verify trailers appear
5. Deploy/demo if ready — this alone provides permanent context traceability in git history

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Install Hooks) → Test → **MVP!** Context trailers in commits
3. Add US3 (Dashboard) → Test → Trailers are browsable in the UI
4. Add US2 (Plugin Auto-Install) → Test → Agents auto-install hooks
5. Add US4 (CLI Dashboard) → Test → Single command to view everything
6. Add US5 (Remove Hooks) → Test → Clean uninstall path
7. Polish → Docs, MCP tool, build validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Hook shell script must be POSIX-compatible (no bash-isms) for cross-platform support
- All trailer values must pass through `redactSecrets()` before writing
- Hook must complete within 500ms total, 200ms daemon timeout
