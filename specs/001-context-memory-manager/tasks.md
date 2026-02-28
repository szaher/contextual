# Tasks: Context & Memory Manager

**Input**: Design documents from `/specs/001-context-memory-manager/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/daemon-api.md, research.md, quickstart.md

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Includes exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/core/`, `packages/daemon/`, `packages/cli/`, `packages/ui/`
- **Tests**: `tests/integration/`, `tests/e2e/`, `tests/fixtures/`
- **Config**: `.ctxl/config.yaml` (per-repo), `~/.ctxl/config.yaml` (global)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize pnpm monorepo with 4 packages and shared tooling

- [ ] T001 Create root package.json with pnpm workspaces config and pnpm-workspace.yaml listing packages/*
- [ ] T002 [P] Initialize packages/core with package.json (name: @ctxl/core, deps: js-yaml, proper-lockfile) and tsconfig.json
- [ ] T003 [P] Initialize packages/daemon with package.json (name: @ctxl/daemon, deps: hono, better-sqlite3, @hono/node-server) and tsconfig.json
- [ ] T004 [P] Initialize packages/cli with package.json (name: @ctxl/cli, deps: commander, bin: ctxkit) and tsconfig.json
- [ ] T005 [P] Initialize packages/ui with package.json (name: @ctxl/ui, deps: react, react-dom), vite.config.ts (React plugin), and tsconfig.json
- [ ] T006 [P] Configure shared ESLint + Prettier at repository root with TypeScript rules
- [ ] T007 [P] Configure Vitest as test runner in root vitest.config.ts with workspace support

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, parsers, storage, and server skeleton that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T008 [P] Define .ctx file type interfaces in packages/core/src/types/ctx.ts (CtxFile, KeyFile, Contract, Decision, Gotcha, CtxRef, IgnorePolicy per data-model.md)
- [ ] T009 [P] Define Context Pack type interfaces in packages/core/src/types/pack.ts (ContextPack, PackItem, OmittedItem, ReasonCode enum per data-model.md)
- [ ] T010 [P] Define config/profile type interfaces in packages/core/src/types/config.ts (WorkspaceProfile, GlobalProfile, AgentConfig, profile precedence per data-model.md)
- [ ] T011 Create public API barrel export in packages/core/src/index.ts
- [ ] T012 Implement YAML parse/serialize for .ctx files in packages/core/src/ctx/parser.ts (js-yaml load + dump with type safety, version field required)
- [ ] T013 Implement .ctx schema validator in packages/core/src/ctx/validator.ts (required sections, field types, entry uniqueness rules per data-model.md)
- [ ] T014 [P] Implement secret pattern detection in packages/core/src/redact/secrets.ts (AWS keys, API tokens with high entropy, base64 secrets, PEM blocks, connection strings per research.md)
- [ ] T015 [P] Implement token estimation (Math.ceil(text.length / 4)) with pluggable interface in packages/core/src/packer/tokens.ts
- [ ] T016 Set up SQLite database with WAL mode, schema creation (sessions, request_events, memory_diffs, audit_log tables + all indexes per data-model.md) in packages/daemon/src/store/db.ts
- [ ] T017 Set up Hono HTTP server with JSON error format, localhost binding (127.0.0.1:3742), and /api/v1 prefix in packages/daemon/src/server.ts
- [ ] T018 Implement daemon entry point with graceful shutdown and bounded memory in packages/daemon/src/index.ts
- [ ] T019 [P] Implement GET /health endpoint (status, version, uptime, active_sessions, db_size per contract) in packages/daemon/src/routes/health.ts
- [ ] T020 Set up Commander.js CLI skeleton with top-level program and subcommand registration in packages/cli/src/index.ts
- [ ] T021 [P] Create test fixture repo scaffolding (simple/ with root .ctx, nested/ with hierarchical .ctx at root + src/ + src/auth/, minimal git init) in tests/fixtures/repos/ — T081 later adds deterministic git history
- [ ] T022 Implement hierarchical .ctx file merger in packages/core/src/ctx/merger.ts (load cwd → parent → root, follow refs with cycle detection and warning on circular references, apply merge rules: summary=replace, key_files/contracts/decisions=union child-overrides, gotchas=concat, tags=union, ignore=union per data-model.md)
- [ ] T022a [P] Implement audit_log store queries (insert entry, query by ctx_path/date range/initiator with pagination) in packages/daemon/src/store/audit.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Context Pack Assembly (Priority: P1) 🎯 MVP

**Goal**: Load .ctx files hierarchically, score entries for relevance, assemble deterministic Context Packs within token budgets, with full attribution and omitted-items list

**Independent Test**: Place sample .ctx files in test repo, issue request, verify Context Pack contains expected items in deterministic order within budget

### Implementation for User Story 1

- [ ] T023 [P] [US1] Implement directory distance scoring in packages/core/src/scorer/locality.ts (score based on directory depth from working_dir to .ctx file)
- [ ] T024 [P] [US1] Implement staleness-aware recency scoring in packages/core/src/scorer/recency.ts (score based on verified_at commit age, down-rank stale entries per FR-027)
- [ ] T025 [P] [US1] Implement tag matching scoring in packages/core/src/scorer/tags.ts (match request keywords against entry tags, return TAG_MATCH reason code)
- [ ] T026 [US1] Implement relevance scoring engine in packages/core/src/scorer/scorer.ts (combine locality + recency + tags + pins with deterministic tiebreakers for stable ordering per FR-004)
- [ ] T027 [US1] Implement token budgeting + priority-based truncation in packages/core/src/packer/budget.ts (respect 4000-token default ceiling, pinned items priority, budget overage warnings)
- [ ] T028 [US1] Implement Context Pack assembly in packages/core/src/packer/packer.ts (merge .ctx → score entries → budget allocation → build pack with per-item attribution + omitted list per FR-005/FR-006)
- [ ] T028a [US1] Implement deep-read fallback heuristic in packages/core/src/packer/packer.ts (bypass .ctx and read files directly when confidence is low: zero tag matches or top score < 0.3, .ctx missing/stale, or user intent signals deep analysis; log decision with rationale and minimal file set per FR-007)
- [ ] T029 [US1] Implement request event store queries (insert event with context_pack JSON, query by session_id) in packages/daemon/src/store/events.ts
- [ ] T030 [US1] Implement POST /context-pack endpoint (build pack, record event, return pack with event_id per contract) in packages/daemon/src/routes/context-pack.ts
- [ ] T031 [US1] Implement GET /context-pack/preview endpoint (preview without recording event, event_id=null per contract) in packages/daemon/src/routes/context-pack.ts
- [ ] T032 [US1] Implement `ctxkit inject` command with --preview, --request, --cwd, --budget flags in packages/cli/src/commands/inject.ts (format output per quickstart.md section 4)
- [ ] T033 [US1] Create golden Context Pack fixtures (expected deterministic output) in tests/fixtures/golden/simple-pack.json and tests/fixtures/golden/nested-pack.json
- [ ] T034 [US1] Integration test: context pack assembly with real filesystem + .ctx files + scoring verification in tests/integration/context-pack.test.ts
- [ ] T035 [US1] E2E test: single .ctx scenario (root .ctx only → inject → verify subset within budget) in tests/e2e/single-ctx.test.ts

**Checkpoint**: Context Pack assembly works end-to-end. Core value proposition delivered.

---

## Phase 4: User Story 2 — .ctx File Lifecycle (Priority: P2)

**Goal**: Initialize, validate, version-migrate, and manage .ctx files with lock/pin support, ownership tags, and cross-references

**Independent Test**: Initialize .ctx in sample repo, validate structure, lock an entry, confirm file remains human-readable and git-diffable

### Implementation for User Story 2

- [ ] T036 [US2] Implement .ctx version migration in packages/core/src/ctx/migrator.ts (detect version < CURRENT_VERSION, auto-migrate in-place, preserve user content, produce minimal diff per FR-017a)
- [ ] T037 [US2] Implement `ctxkit init` command in packages/cli/src/commands/init.ts (scan repo for README/package.json/tsconfig metadata, generate .ctx with summary + key_files + commands + tags, support subdirectory init per quickstart.md section 2)
- [ ] T038 [US2] Implement `ctxkit validate` command in packages/cli/src/commands/validate.ts (call validator, report structural errors + content warnings, check referenced files exist per FR-017)
- [ ] T039 [US2] E2E test: hierarchical .ctx merge scenario (nested .ctx files at root + src/ + src/auth/ → verify merge precedence + scoring picks correct items) in tests/e2e/hierarchical.test.ts

**Checkpoint**: Developers can create, validate, and manage .ctx files with full lifecycle support

---

## Phase 5: User Story 3 — Memory Update Proposals (Priority: P3)

**Goal**: Generate .ctx update proposals as reviewable diffs with provenance, approval flow, auto-approve toggle, concurrent write safety, and audit trail

**Independent Test**: Simulate function rename, verify system proposes .ctx diff, confirm diff not applied until user approves

### Implementation for User Story 3

- [ ] T040 [US3] Implement .ctx diff generation in packages/core/src/differ/differ.ts (compare old vs new .ctx content, produce unified diff, run secret redaction before output per FR-033)
- [ ] T040a [US3] Implement auto-pruning scan in packages/core/src/differ/differ.ts (scan .ctx entries for dead references — deleted files, renamed symbols — and generate removal/update proposals with justification per FR-020)
- [ ] T041 [P] [US3] Implement memory_diffs store queries (insert, query by status/ctx_path, update status/resolved_at/resolved_by) in packages/daemon/src/store/diffs.ts
- [ ] T043 [US3] Implement POST /proposals endpoint (create proposal with diff_content + provenance per contract) in packages/daemon/src/routes/proposals.ts
- [ ] T044 [US3] Implement GET /proposals endpoint (list proposals with status/ctx_path filter per contract) in packages/daemon/src/routes/proposals.ts
- [ ] T045 [US3] Implement PATCH /proposals/:id endpoint (approve/reject/edit proposal, respect locked entries + ownership review per FR-013/FR-023) in packages/daemon/src/routes/proposals.ts
- [ ] T046 [US3] Implement POST /proposals/:id/apply endpoint (apply approved diff to .ctx file using proper-lockfile for atomic writes, create audit_log entry per FR-021) in packages/daemon/src/routes/proposals.ts
- [ ] T047 [US3] Implement `ctxkit propose` command in packages/cli/src/commands/propose.ts (generate diff for specified .ctx, show interactive approve/edit/reject per quickstart.md section 7)
- [ ] T048 [US3] Implement `ctxkit apply` command in packages/cli/src/commands/apply.ts (approve + apply proposal by ID via daemon API per quickstart.md section 8)
- [ ] T049 [US3] Integration test: propose → approve → apply flow with .ctx file write verification + audit log entry in tests/integration/proposals.test.ts

**Checkpoint**: Memory stays current via reviewable, audited, diff-based updates

---

## Phase 6: User Story 4 — Session & Request Tracking (Priority: P4)

**Goal**: Record agent sessions with per-request timelines, expose via API and CLI, with configurable retention cleanup

**Independent Test**: Run agent session with multiple requests, query session tracker, verify all events recorded with correct context attribution

### Implementation for User Story 4

- [ ] T050 [US4] Implement session store queries (create with UUID, get by id with events, list with status/repo_path/limit/offset filters, end session) in packages/daemon/src/store/sessions.ts
- [ ] T051 [US4] Implement POST /sessions endpoint (create session with repo_path, working_dir, branch, agent_id, agent_config per contract) in packages/daemon/src/routes/sessions.ts
- [ ] T052 [US4] Implement GET /sessions and GET /sessions/:id endpoints (list with filters + detail with events timeline per contract) in packages/daemon/src/routes/sessions.ts
- [ ] T053 [US4] Implement PATCH /sessions/:id endpoint (end session by setting status=completed per contract) in packages/daemon/src/routes/sessions.ts
- [ ] T054 [US4] Implement GET /audit endpoint (query audit log with ctx_path/from/to/limit filters per contract) in packages/daemon/src/routes/audit.ts
- [ ] T055 [US4] Implement `ctxkit sessions` and `ctxkit sessions show <id>` commands in packages/cli/src/commands/sessions.ts (table format per quickstart.md section 6)
- [ ] T056 [US4] Implement retention cleanup scheduler (purge sessions > 30 days, audit > 90 days, memory_diffs with parent session, run on startup + daily interval per data-model.md) in packages/daemon/src/scheduler/retention.ts
- [ ] T057 [US4] Integration test: daemon API with session CRUD + event recording + audit query in tests/integration/daemon-api.test.ts

**Checkpoint**: Full observability into agent sessions and memory changes

---

## Phase 7: User Story 5 — Drift Detection (Priority: P5)

**Goal**: Detect when .ctx entries reference moved/renamed/deleted files, surface drift as proposals with clear justification, down-rank stale entries in scoring

**Independent Test**: Create .ctx referencing specific files, modify/delete those files, verify system flags stale references with actionable proposals

### Implementation for User Story 5

- [ ] T058 [US5] Implement git-based drift detection in packages/core/src/differ/drift.ts (compare verified_at commit vs current HEAD, detect file moves/renames/deletes via git log/diff, return stale_entries with reason + details per FR-024/FR-025/FR-027)
- [ ] T059 [US5] Implement GET /drift endpoint (check drift for specific ctx_path or all .ctx files, return results per contract) in packages/daemon/src/routes/drift.ts
- [ ] T060 [US5] Implement `ctxkit drift` command in packages/cli/src/commands/drift.ts (show stale entries with reasons and commit distance per quickstart.md section 7)
- [ ] T061 [US5] E2E test: drift detection flow (modify code so .ctx is stale → detect drift → propose update → approve → verify audit log) in tests/e2e/drift.test.ts

**Checkpoint**: .ctx files stay in sync with actual repository state

---

## Phase 8: User Story 6 — Local Inspection Dashboard (Priority: P6)

**Goal**: Visual web interface for browsing sessions, inspecting context packs, editing .ctx files with diff preview, viewing audit logs, and searching — all served locally with no network access

**Independent Test**: Start dashboard, navigate to session, inspect context pack, edit .ctx entry via UI, preview diff, apply change

### Implementation for User Story 6

- [ ] T062 [US6] Set up React app shell with React Router in packages/ui/src/main.tsx and packages/ui/src/App.tsx (routes: /, /sessions/:id, /ctx, /audit)
- [ ] T063 [P] [US6] Configure shadcn/ui with Tailwind CSS in packages/ui/ (install components: Table, Card, Button, Input, Dialog, Tabs, Badge, ScrollArea)
- [ ] T064 [US6] Implement daemon API client service with typed fetch wrappers for all daemon endpoints in packages/ui/src/services/api.ts
- [ ] T065 [P] [US6] Implement SessionList component (sortable table: id, agent, status, request count, started_at) in packages/ui/src/components/SessionList.tsx
- [ ] T066 [P] [US6] Implement SessionTimeline component (per-request timeline with context attribution, token counts, reason codes) in packages/ui/src/components/SessionTimeline.tsx
- [ ] T067 [P] [US6] Implement ContextPackView component (items with scores, reason codes, tokens, staleness indicators, omitted list) in packages/ui/src/components/ContextPackView.tsx
- [ ] T068 [P] [US6] Implement CtxEditor component (YAML editor with section navigation, lock/ownership badges) in packages/ui/src/components/CtxEditor.tsx
- [ ] T069 [P] [US6] Implement DiffViewer component (unified diff display with approve/reject/edit actions) in packages/ui/src/components/DiffViewer.tsx
- [ ] T070 [P] [US6] Implement AuditLog component (filterable table: ctx_path, change_type, initiated_by, reason, date) in packages/ui/src/components/AuditLog.tsx
- [ ] T071 [P] [US6] Implement SearchBar component (search across memories and sessions with highlighted results) in packages/ui/src/components/SearchBar.tsx
- [ ] T072 [US6] Implement Dashboard page (overview with SessionList + system stats) in packages/ui/src/pages/Dashboard.tsx
- [ ] T073 [P] [US6] Implement SessionDetail page (SessionTimeline + ContextPackView drill-down) in packages/ui/src/pages/SessionDetail.tsx
- [ ] T074 [P] [US6] Implement CtxBrowser page (browse/edit .ctx files with drift badges and DiffViewer) in packages/ui/src/pages/CtxBrowser.tsx
- [ ] T075 [P] [US6] Implement AuditPage (AuditLog with date range + ctx_path filters) in packages/ui/src/pages/AuditPage.tsx
- [ ] T076 [US6] Configure daemon to serve static UI build from packages/ui/dist/ in packages/daemon/src/server.ts
- [ ] T077 [US6] Add `ctxkit dashboard` subcommand to open browser at http://localhost:3742 in packages/cli/src/commands/daemon.ts
- [ ] T077a [US6] Integration test: dashboard serves static build, session list renders, context pack drill-down displays attribution, .ctx edit round-trips via UI API calls in tests/integration/dashboard.test.ts

**Checkpoint**: Visual inspection and management of all system state

---

## Phase 9: User Story 7 — Agent Integration Wrapper (Priority: P7)

**Goal**: Drop-in wrapper for existing coding agents that creates sessions, injects Context Packs, and records events transparently without requiring agent modification

**Independent Test**: Wrap sample agent command, issue request, verify Context Pack injected and session recorded

### Implementation for User Story 7

- [ ] T078 [US7] Implement `ctxkit run -- <cmd>` wrapper in packages/cli/src/commands/run.ts (create session → build context pack → inject into agent stdin/env → record events → end session on exit per quickstart.md section 5)
- [ ] T079 [US7] Implement `ctxkit daemon start` and `ctxkit daemon stop` commands in packages/cli/src/commands/daemon.ts (background process management with PID file at ~/.ctxl/daemon.pid, stdout/stderr logging)
- [ ] T079a [US7] E2E test: ctxkit daemon start → ctxkit run wraps sample echo agent → verify context pack injected in agent input → session recorded in daemon → ctxkit daemon stop in tests/e2e/agent-wrapper.test.ts

**Checkpoint**: Any existing coding agent can use the context system without modification

---

## Phase 10: User Story 8 — Replay & Regression Harness (Priority: P8)

**Goal**: Replay recorded sessions against fixed repository snapshots to verify determinism of context packs, budget adherence, reason code stability, and expected drift/proposal outputs

**Independent Test**: Record session, change scoring logic, replay, verify harness reports expected differences

### Implementation for User Story 8

- [ ] T080 [P] [US8] Create E2E test harness utilities (session recording/loading, replay runner, context pack diff comparison, pass/fail reporting with non-zero exit code) in tests/e2e/harness.ts
- [ ] T081 [P] [US8] Populate test fixture repos with deterministic .ctx content and git history (commits with known hashes) in tests/fixtures/repos/simple/ and tests/fixtures/repos/nested/
- [ ] T082 [US8] Create regression test scenarios using golden fixtures (replay sessions → compare packs against tests/fixtures/golden/*.json → report mismatches with reason codes) in tests/e2e/regression.test.ts

**Checkpoint**: Changes to scoring or .ctx files produce detectable, verifiable diffs

---

## Phase 11: User Story 9 — Workspace Profiles (Priority: P9)

**Goal**: Per-repository and global configuration for budgets, ignore rules, agent settings, auto-approve policies, and retention periods

**Independent Test**: Create two profiles with different budgets, switch between repos, verify each uses its configured profile

### Implementation for User Story 9

- [ ] T083 [US9] Implement profile loading with precedence chain (per-request → per-agent → repo .ctxl/config.yaml → global ~/.ctxl/config.yaml → system defaults: 4000 tokens, lexical mode per data-model.md) in packages/core/src/config/loader.ts
- [ ] T084 [US9] Integrate profile config into context pack assembly (budget override, scoring mode, auto-approve sections, excluded_owners per FR-045) in packages/core/src/packer/packer.ts
- [ ] T085 [US9] Implement ignore policy enforcement (never_read excludes paths from .ctx loading, never_log redacts from session events, deny-list grows monotonically up tree per data-model.md) in packages/core/src/ctx/merger.ts
- [ ] T085a [US9] Integration test: two repos with different .ctxl/config.yaml profiles (budget: 2000 vs 8000, different ignore rules) → verify context pack respects per-repo budget and ignore policies in tests/integration/profiles.test.ts

**Checkpoint**: Multi-repo developers have seamless per-project configuration

---

## Phase 12: User Story 10 — Context Contracts & Guardrails (Priority: P10)

**Goal**: Must-include contract blocks triggered by path glob + tag matching, with budget priority over non-contract items and warnings on budget stretch

**Independent Test**: Define security contract for src/auth/, make request touching auth files, verify contract in Context Pack with reason code CONTRACT_REQUIRED

### Implementation for User Story 10

- [ ] T086 [US10] Implement contract scope matching (path glob against scope.paths, tag intersection against scope.tags per data-model.md contracts section) in packages/core/src/scorer/scorer.ts
- [ ] T087 [US10] Implement contract budget priority (contracts always included before non-contract items, displace lower-scored items when budget tight, emit warning on budget stretch per FR-008) in packages/core/src/packer/budget.ts
- [ ] T088 [US10] Add CONTRACT_REQUIRED reason code handling and contract-specific attribution (contract name, scope, staleness) in packages/core/src/packer/packer.ts
- [ ] T088a [US10] Integration test: define contract with scope paths=["src/auth/*"] and tags=["security"] → request touches src/auth/handler.ts → verify CONTRACT_REQUIRED in pack, contract displaces lower items when budget tight in tests/integration/contracts.test.ts

**Checkpoint**: Critical project constraints are always present in context when relevant

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Performance optimization, end-to-end validation, security hardening, resource safety

- [ ] T089 [P] Performance: profile context pack assembly, optimize to ensure < 500ms for 100 .ctx files (SC-009a)
- [ ] T090 Validate quickstart.md scenario end-to-end: init → daemon start → inject preview → run agent → sessions → drift → propose → apply → dashboard → validate (SC-010)
- [ ] T091 [P] Security: scan all .ctx write paths and log outputs for secret detection coverage, verify no credentials in .ctx or logs (SC-008)
- [ ] T092 [P] Operations: verify daemon resource bounds — bounded memory < 100MB, graceful shutdown on SIGTERM/SIGINT, backpressure with request queue limit (SC-009)
- [ ] T093 Final validation: run all 3 E2E scenarios + all integration tests, verify determinism (SC-001), budget adherence (SC-002), zero silent rewrites (SC-007)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — delivers MVP
- **US2 (Phase 4)**: Depends on Foundational — can parallel with US1
- **US3 (Phase 5)**: Depends on US1 (context pack exists) and US2 (.ctx lifecycle)
- **US4 (Phase 6)**: Depends on Foundational — can parallel with US1/US2
- **US5 (Phase 7)**: Depends on US2 (.ctx files exist) and US4 (session tracking)
- **US6 (Phase 8)**: Depends on US1 (packs to display) and US4 (sessions to display)
- **US7 (Phase 9)**: Depends on US1 (inject logic) and US4 (session endpoints)
- **US8 (Phase 10)**: Depends on US1 (context packs) and US4 (session recording)
- **US9 (Phase 11)**: Depends on Foundational — can parallel with US1/US2
- **US10 (Phase 12)**: Depends on US1 (packer/scorer to extend)
- **Polish (Phase 13)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no story dependencies. **MVP target.**
- **US2 (P2)**: After Foundational — independent of US1 (merger moved to Foundational)
- **US3 (P3)**: After US1 + US2 — needs pack assembly and .ctx lifecycle (audit store in Foundational)
- **US4 (P4)**: After Foundational — independent of US1/US2
- **US5 (P5)**: After US2 + US4 — needs .ctx files and session tracking
- **US6 (P6)**: After US1 + US4 — needs data to display
- **US7 (P7)**: After US1 + US4 — needs inject + sessions
- **US8 (P8)**: After US1 + US4 — needs sessions to replay
- **US9 (P9)**: After Foundational — profiles are config, independent of features
- **US10 (P10)**: After US1 — extends scorer/packer with contract logic

### Within Each User Story

- Types and store queries before endpoints
- Core library logic (packages/core) before daemon routes (packages/daemon)
- Daemon routes before CLI commands (packages/cli)
- All implementation before integration/E2E tests
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T002–T007 all parallelizable (independent package inits + config)
- **Phase 2**: T008–T010 parallel (types), T014–T015 parallel (secrets/tokens), T019+T021 parallel
- **US1**: T023–T025 parallel (scoring sub-modules: locality, recency, tags)
- **US3**: T040a+T041 parallel (auto-pruning scan + diffs store queries)
- **US6**: T065–T071 parallel (all 7 UI components), T073–T075 parallel (3 pages)
- **US8**: T080–T081 parallel (harness utilities + fixture repos)
- **US9 + US10**: Should NOT run in parallel — both modify packer.ts and budget.ts (serialize US10 after US9)
- **After Phase 2**: US1, US2, US4, US9 can all start in parallel
- **After US1 + US2**: US3 can start
- **After US1 + US4**: US6, US7, US8 can start in parallel

---

## Parallel Example: User Story 1

```bash
# Launch scoring sub-modules in parallel (different files, no dependencies):
Task T023: "Implement locality scoring in packages/core/src/scorer/locality.ts"
Task T024: "Implement recency scoring in packages/core/src/scorer/recency.ts"
Task T025: "Implement tag matching in packages/core/src/scorer/tags.ts"

# Then sequentially:
Task T026: "Implement scorer engine (depends on T023–T025)"
Task T027: "Implement budget (depends on T015)"
Task T028: "Implement packer (depends on T026, T027, T022)"
```

## Parallel Example: User Story 6 (Dashboard)

```bash
# Launch all UI components in parallel (different files, no shared state):
Task T065: "SessionList component"
Task T066: "SessionTimeline component"
Task T067: "ContextPackView component"
Task T068: "CtxEditor component"
Task T069: "DiffViewer component"
Task T070: "AuditLog component"
Task T071: "SearchBar component"

# Then pages (partially parallel, each uses different component subset):
Task T073: "SessionDetail page"
Task T074: "CtxBrowser page"
Task T075: "AuditPage page"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — Context Pack Assembly
4. **STOP and VALIDATE**: Run E2E test, verify `ctxkit inject --preview` works
5. Demo: deterministic Context Pack with attribution and omitted-items list

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Context Pack Assembly) → Test independently → **MVP!**
3. US2 (.ctx Lifecycle) → `ctxkit init` + `ctxkit validate` working
4. US4 (Session Tracking) → Sessions API + CLI working
5. US3 (Memory Updates) → Propose/approve/apply flow working
6. US5 (Drift Detection) → Staleness checks working
7. US9 (Workspace Profiles) → Multi-repo config working
8. US10 (Context Contracts) → Guardrails enforced
9. US7 (Agent Wrapper) → Drop-in `ctxkit run` working
10. US6 (Dashboard) → Visual inspection layer
11. US8 (Replay Harness) → Regression safety
12. Polish → Performance, security, quickstart validation

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Context Pack Assembly) → US3 (Memory Updates) → US10 (Contracts)
   - Developer B: US2 (.ctx Lifecycle) → US5 (Drift Detection)
   - Developer C: US4 (Session Tracking) → US7 (Agent Wrapper) → US8 (Replay)
   - Developer D: US9 (Workspace Profiles) → US6 (Dashboard)
3. Final: Polish phase (all developers)

---

## Notes

- [P] tasks = different files, no dependencies — safe to run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Total**: 99 tasks across 13 phases (10 user stories + setup + foundational + polish)
- **MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) = 37 tasks
- **Task count per story**: US1=14, US2=4, US3=10, US4=8, US5=4, US6=17, US7=3, US8=3, US9=4, US10=4
