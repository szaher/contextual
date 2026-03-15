# Tasks: ctxl v2 — Index, Versioning, Conflicts, and Ecosystem

**Input**: Design documents from `/specs/004-ctxl-v2/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Integration and E2E tests included per constitution requirement (E2E + Integration First).

**Organization**: Tasks grouped by user story (US1–US9) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US9)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new type files, directories, and the @ctxkit/speckit-bridge package skeleton.

- [x] T001 [P] Create .ctxl index type definitions in packages/core/src/types/ctxl.ts (CtxlIndex, CtxlEntry, CtxlGraphNode, CtxlScoringConfig, CtxlBudgetConfig, CtxlPolicies)
- [x] T002 [P] Create history type definitions in packages/core/src/types/history.ts (HistoryEntry, CtxDiff, SectionDiff)
- [x] T003 [P] Create lock type definitions in packages/core/src/types/lock.ts (LockInfo, LockHandle)
- [x] T004 [P] Create conflict type definitions in packages/core/src/types/conflict.ts (ConflictEntry, MergeResult, MergeStrategy, ResolutionChoice, ResolutionRequest)
- [x] T005 [P] Create activity event type definitions in packages/core/src/types/activity.ts (ActivityEvent, ActivityEventType)
- [x] T006 [P] Create bootstrap type definitions in packages/core/src/types/bootstrap.ts (AnalysisResult, BootstrapOptions, BootstrapProposal)
- [x] T007 [P] Create PR context type definitions in packages/core/src/types/pr-context.ts (PrContext, PromptEntry, AgentDecision, ContextUsed, FileChange, CtxUpdate, SpecReference, PrStats)
- [x] T008 Initialize @ctxkit/speckit-bridge package with package.json, tsconfig.json, and src/index.ts skeleton in packages/speckit-bridge/
- [x] T009 Add @ctxkit/speckit-bridge to pnpm-workspace.yaml and add dependency references in packages/cli/package.json and packages/daemon/package.json
- [x] T010 Export all new types from packages/core/src/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T011 Extend CtxFile interface in packages/core/src/types/ctx.ts to add optional `_history: HistoryEntry[]` field and update version comment from "schema v1" to "schema v1/v2"
- [x] T012 Extend validator in packages/core/src/ctx/validator.ts — remove CURRENT_CTX_VERSION equality check, accept any positive integer for version field, add validation for _history entries (schema: version > 0, ISO 8601 timestamp, author matches agent:*/developer:*, reason ≤200 chars, checksum matches sha256:<64-hex>), validate _conflict markers have _versions array, validate checksum format when present
- [x] T013 Extend parseCtxFile in packages/core/src/ctx/parser.ts to parse `_history` array from YAML (normalize entries, preserve on serialize)
- [x] T014 Extend serializeCtxFile in packages/core/src/ctx/parser.ts to serialize `_history` array (place after ignore section, before EOF)
- [x] T015 Extend ScoringConfig in packages/core/src/types/config.ts to add configurable weight fields (locality_weight, recency_weight, tag_match_weight, dependency_bonus, contract_floor) with defaults
- [x] T016 Extend BudgetConfig in packages/core/src/types/config.ts to add category fields (contracts, local_ctx, related_ctx, history, reserve as fractions) with defaults
- [x] T017 Add new ReasonCode values (DEPENDENCY, CWD_ANCESTOR, WEIGHT_BOOST, PINNED_INDEX) to packages/core/src/types/pack.ts
- [x] T018 Add activity_events table to SQLite schema in packages/daemon/src/store/db.ts with columns (id, session_id, event_type, ctx_path, agent_id, details, created_at) and indexes
- [x] T019 Create activity event store operations in packages/daemon/src/store/activity.ts (insertEvent, listEvents, streamEvents)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — .ctxl Index & Context Selection (Priority: P1) 🎯 MVP

**Goal**: Generate a .ctxl index from existing .ctx files, then use it for fast, scored context selection within a token budget.

**Independent Test**: Generate index from a multi-.ctx repo, verify selector picks relevant files for a given prompt/cwd/budget, verify SessionStart hook reads index instead of walking directories.

### Implementation for User Story 1

- [x] T020 [US1] Create SHA-256 checksum module in packages/core/src/index/checksum.ts — compute checksum of .ctx content excluding _history section
- [x] T021 [US1] Create index generator in packages/core/src/index/generator.ts — walk repo finding .ctx files, compute checksums, estimate tokens, detect inter-directory dependencies from refs, build CtxlIndex YAML
- [x] T022 [US1] Create index selector in packages/core/src/index/selector.ts — implement scoring formula (locality * w_locality + tagMatch * w_tag + recency * w_recency + depBonus + cwdBonus + weight adjustment), greedy selection with category budgets (contracts first, then local_ctx, then related_ctx, then history)
- [x] T023 [US1] Create incremental index updater in packages/core/src/index/updater.ts — update a single entry (recalculate checksum, timestamp, token estimate) without re-scanning entire repo
- [x] T024 [US1] Extend scoreEntries in packages/core/src/scorer/scorer.ts to accept optional CtxlScoringConfig weights and CtxlIndex graph for dependency bonuses and cwd ancestor bonuses
- [x] T025 [US1] Extend buildContextPack in packages/core/src/packer/packer.ts to add index-based discovery path — if .ctxl exists, use selector instead of mergeCtxHierarchy directory walk
- [x] T026 [US1] Extend applyBudget in packages/core/src/packer/budget.ts to support per-category budgets (contracts, local_ctx, related_ctx, history) from CtxlBudgetConfig
- [x] T027 [US1] Create CLI command `ctxkit index` with subcommands (generate, select, show) in packages/cli/src/commands/index-cmd.ts per contracts/cli-commands.md
- [x] T028 [US1] Register index-cmd in packages/cli/src/index.ts
- [x] T029 [US1] Create daemon routes for index in packages/daemon/src/routes/index-routes.ts (POST /api/v1/index/generate, POST /api/v1/index/select, GET /api/v1/index) per contracts/daemon-api.md
- [x] T030 [US1] Register index routes in packages/daemon/src/server.ts
- [x] T031 [US1] Create MCP tools ctxkit.index_generate and ctxkit.index_select in packages/mcp/src/tools/index-tools.ts per contracts/mcp-tools.md
- [x] T032 [US1] Register index MCP tools in packages/mcp/src/server.ts
- [x] T033 [US1] Write integration tests for index generation and selection in tests/integration/index-generation.test.ts — test: generate from multi-.ctx repo, verify entries/checksums/graph, test selector with prompt/cwd/budget, test incremental update, test v1 fallback when no .ctxl exists, verify selection completes in <500ms for a 100-entry index fixture (SC-001 performance)
- [x] T034 [US1] Write E2E test for index CLI flow in tests/e2e/index-selection.test.ts — test: ctxkit index generate, ctxkit index select, verify output matches expected selection

**Checkpoint**: Index generation and selection working end-to-end. MVP complete.

---

## Phase 4: User Story 2 — .ctx Versioning & History (Priority: P2)

**Goal**: Track every .ctx modification with version counter, inline history (max 20 entries), and archive overflow.

**Independent Test**: Perform multiple updates to a .ctx file, verify version increments, history entries created with correct metadata, archive overflow after 20 entries, and diff between versions.

### Implementation for User Story 2

- [x] T035 [US2] Create version bumper in packages/core/src/versioning/bumper.ts — increment version, prepend HistoryEntry to _history, compute checksum, generate diff_summary string
- [x] T036 [US2] Create history archive system in packages/core/src/versioning/archive.ts — evict oldest _history entry to .ctxl.history/<relative-path>/ctx-history.yaml when count exceeds 20, read merged history from inline + archive
- [x] T037 [US2] Create structured differ in packages/core/src/versioning/differ.ts — compare two CtxFile objects, produce CtxDiff with per-section changes (added, removed, modified entries)
- [x] T038 [US2] Create CLI command `ctxkit history` in packages/cli/src/commands/history-cmd.ts per contracts/cli-commands.md — show history, support --all (include archive), --diff v1..v2, --count, --json
- [x] T039 [US2] Register history-cmd in packages/cli/src/index.ts
- [x] T040 [US2] Create daemon routes for history in packages/daemon/src/routes/history-routes.ts (GET /api/v1/history, GET /api/v1/history/diff) per contracts/daemon-api.md
- [x] T041 [US2] Register history routes in packages/daemon/src/server.ts
- [x] T042 [US2] Create MCP tool ctxkit.ctx_history in packages/mcp/src/tools/history-tools.ts per contracts/mcp-tools.md
- [x] T043 [US2] Register history MCP tool in packages/mcp/src/server.ts
- [x] T044 [US2] Write integration tests for versioning in tests/integration/versioning.test.ts — test: version bump, history entry creation, archive overflow at 20, merged history read, structured diff, v1 file upgrade on first write

**Checkpoint**: Versioning system fully functional. Every .ctx write creates a history entry.

---

## Phase 5: User Story 3 — Multi-Agent Conflict Resolution (Priority: P3)

**Goal**: Detect concurrent .ctx modifications, perform three-way merge with section-level strategies, and provide conflict resolution workflow.

**Independent Test**: Simulate two agents reading same version, writing different changes. Verify clean merge for non-overlapping changes, conflict markers for overlapping changes, and resolution workflow.

**Depends on**: US2 (versioning — needed for version comparison and _history-based merge base)

### Implementation for User Story 3

- [x] T045 [US3] Create lock manager in packages/core/src/conflict/lock-manager.ts — acquire lock (write to .ctxl.lock YAML), release lock, check lock status, handle TTL expiry (5-min default), retry with backoff on contention
- [x] T046 [US3] Create three-way merge engine in packages/core/src/conflict/merge-engine.ts — implement per-section strategies: union-by-key (key_files, contracts, decisions, refs), last-writer-wins (summary, commands), concatenate-dedup (gotchas), deduplicated-union (tags, ignore). Produce MergeResult with conflicts[] and strategy[]
- [x] T047 [US3] Create conflict resolver in packages/core/src/conflict/resolver.ts — apply ResolutionChoice (pick_ours, pick_theirs, manual, keep_both) to conflicting entries, remove _conflict markers, bump version
- [x] T048 [US3] Create MCP tool ctxkit.ctx_write in packages/mcp/src/tools/write-tools.ts — write with automatic lock acquisition, version bumping, conflict detection, and three-way merge per contracts/mcp-tools.md
- [x] T049 [US3] Register write MCP tool in packages/mcp/src/server.ts
- [x] T050 [US3] Create CLI command `ctxkit conflicts` with subcommands (list, resolve) in packages/cli/src/commands/conflicts-cmd.ts per contracts/cli-commands.md
- [x] T051 [US3] Register conflicts-cmd in packages/cli/src/index.ts
- [x] T052 [US3] Create daemon routes for conflicts in packages/daemon/src/routes/conflict-routes.ts (GET /api/v1/conflicts, POST /api/v1/conflicts/resolve) per contracts/daemon-api.md
- [x] T053 [US3] Register conflict routes in packages/daemon/src/server.ts
- [x] T054 [US3] Write integration tests for conflict resolution in tests/integration/conflict-resolution.test.ts — test: lock acquire/release/TTL, three-way merge clean (non-overlapping changes), three-way merge conflict (same entry), all section strategies, resolution workflow, version bumping after resolve
- [x] T055 [US3] Write E2E test for multi-agent conflict in tests/e2e/conflict-e2e.test.ts — test: two simulated agents write concurrently, verify merge result, list conflicts, resolve via CLI

**Checkpoint**: Multi-agent concurrent writes handled safely with zero data loss.

---

## Phase 6: User Story 4 — Auto-Update Protocol (Priority: P4)

**Goal**: Automatically track stale directories during sessions, generate .ctx update proposals on task completion, and apply based on policy.

**Independent Test**: Simulate a session where files are edited, verify staleness tracked per-directory, verify proposals generated on task completion, verify policy controls auto-apply vs review.

**Depends on**: US1 (index), US2 (versioning)

### Implementation for User Story 4

- [x] T056 [US4] Create staleness tracker in packages/core/src/auto-update/staleness-tracker.ts — track which directories have been modified during a session, accept file paths from PostToolUse events, group by parent directory
- [x] T057 [US4] Create proposal generator in packages/core/src/auto-update/proposal-generator.ts — analyze git diff for stale directories, generate .ctx update proposals (new key_files for new files, removed key_files for deleted files, updated contracts for changed behavior)
- [x] T058 [US4] Extend SessionStart hook script in packages/claude-plugin/scripts/session-start.js to use index-based context selection when .ctxl exists (read index, run selector, inject selected context)
- [x] T059 [US4] Extend PostToolUse hook script in packages/claude-plugin/scripts/post-tool-use.js to call staleness tracker when Edit/Write tools modify files (extract directory from tool_input path)
- [x] T060 [US4] Extend TaskCompleted hook script in packages/claude-plugin/scripts/task-completed.js to generate auto-update proposals for all stale directories and apply/queue based on .ctxl policies (auto_update, require_review)
- [x] T061 [US4] Create daemon routes for activity feed in packages/daemon/src/routes/activity-routes.ts (GET /api/v1/activity, POST /api/v1/activity, GET /api/v1/activity/stream SSE endpoint) per contracts/daemon-api.md
- [x] T062 [US4] Register activity routes in packages/daemon/src/server.ts
- [x] T063 [US4] Write integration tests for auto-update in tests/integration/auto-update.test.ts — test: staleness tracker marks correct directories, proposal generator creates valid proposals from git diff, policy-based apply vs queue, activity events recorded

**Checkpoint**: Auto-update loop functional — sessions automatically track and propose .ctx updates.

---

## Phase 7: User Story 5 — Bootstrapping Engine (Priority: P5)

**Goal**: Analyze codebases and generate initial .ctx files with inferred metadata (key_files, tags, commands, dependencies).

**Independent Test**: Run bootstrap against a multi-directory project, verify generated .ctx files contain reasonable key_files and tags, verify skip-existing and min-files options.

**Depends on**: US1 (index — bootstrap generates/updates index after writing .ctx files)

### Implementation for User Story 5

- [x] T064 [US5] Create directory analyzer in packages/core/src/bootstrap/analyzer.ts — quick mode: detect language from file extensions, read package.json/Makefile/Cargo.toml for commands, identify entry points (main.*, index.*, mod.*), detect test files, infer tags from directory name and extensions, analyze import statements for dependencies. Full mode: extend quick mode with AI-assisted summaries by calling the daemon's context_pack endpoint to generate richer descriptions (requires running daemon; gracefully degrade to quick mode if unavailable)
- [x] T065 [US5] Create .ctx generator in packages/core/src/bootstrap/generator.ts — transform AnalysisResult into CtxFile (summary from README or directory name, key_files from entry points, tags from analyzer, commands from config files, refs from detected dependencies), present as proposals
- [x] T066 [US5] Create CLI command `ctxkit bootstrap` in packages/cli/src/commands/bootstrap-cmd.ts per contracts/cli-commands.md — support --mode quick|full, --dry-run, --skip-existing, --min-files, --json
- [x] T067 [US5] Register bootstrap-cmd in packages/cli/src/index.ts
- [x] T068 [US5] Create daemon routes for bootstrap in packages/daemon/src/routes/bootstrap-routes.ts (POST /api/v1/bootstrap/analyze, POST /api/v1/bootstrap/apply) per contracts/daemon-api.md
- [x] T069 [US5] Register bootstrap routes in packages/daemon/src/server.ts
- [x] T070 [US5] Create MCP tool ctxkit.ctx_bootstrap in packages/mcp/src/tools/bootstrap-tools.ts per contracts/mcp-tools.md
- [x] T071 [US5] Register bootstrap MCP tool in packages/mcp/src/server.ts
- [x] T072 [US5] Write integration tests for bootstrap in tests/integration/bootstrap.test.ts — test: analyzer detects language/entry-points/tests/tags, generator creates valid .ctx, skip-existing works, min-files threshold works, dry-run returns proposals without writing
- [x] T073 [US5] Write E2E test for bootstrap flow in tests/e2e/bootstrap-e2e.test.ts — test: ctxkit bootstrap --dry-run shows proposals, ctxkit bootstrap writes files and updates index

**Checkpoint**: Bootstrapping generates reasonable .ctx files from codebase analysis.

---

## Phase 8: User Story 6 — /ctx Skill (Priority: P6)

**Goal**: Provide a unified skill-based interface (/ctx) with subcommands for all v2 context management operations.

**Independent Test**: Invoke each /ctx subcommand and verify correct output or side effect.

**Depends on**: US1–US5 (wraps all prior capabilities into a skill interface)

### Implementation for User Story 6

- [x] T074 [US6] Create /ctx skill definition in packages/claude-plugin/skills/ctx/SKILL.md — document all 15 subcommands (show, edit, add, remove, inject, index, bootstrap, diff, resolve, history, validate, speckit, stale, pr, and default status) with usage examples per contracts/ctx-skill.md
- [x] T075 [US6] Update /ctxkit skill in packages/claude-plugin/skills/ctxkit/SKILL.md to redirect to /ctx as backward-compatible alias
- [x] T076 [US6] Update hooks.json in packages/claude-plugin/hooks/hooks.json to register the /ctx skill alongside existing /ctxkit
- [x] T077 [US6] Create CLI command `ctxkit migrate` in packages/cli/src/commands/migrate-cmd.ts — initialize version counters, empty _history arrays, checksums, and .ctxl index for v1 repositories; idempotent and non-destructive per contracts/cli-commands.md
- [x] T078 [US6] Create CLI command `ctxkit hooks init` in packages/cli/src/commands/hooks-cmd.ts — install git hooks for context validation per contracts/cli-commands.md
- [x] T079 [US6] Register migrate-cmd and hooks-cmd in packages/cli/src/index.ts
- [x] T080 [US6] Extend migrateCtx in packages/core/src/ctx/migrator.ts to handle v1→v2 migration: keep version as 1 (revision 1), initialize empty _history array, compute checksum; idempotent
- [x] T081 [US6] Write E2E test for /ctx skill subcommands in tests/e2e/ctx-skill.test.ts — test: /ctx status output, /ctx show, /ctx add key_file, /ctx remove tag, /ctx validate, /ctx stale, ctxkit alias works

**Checkpoint**: Unified /ctx skill operational with all subcommands.

---

## Phase 9: User Story 7 — Spec-Kit Integration Bridge (Priority: P7)

**Goal**: Synchronize spec-kit constitutions and component specs with .ctx files (import, export, validate, bidirectional sync).

**Independent Test**: Import a constitution into root .ctx locked decisions, import component specs as contracts, export back, verify round-trip fidelity.

**Depends on**: US2 (versioning — imports bump version and create history entries)

### Implementation for User Story 7

- [x] T082 [P] [US7] Create spec-kit bridge types in packages/speckit-bridge/src/types.ts — MappingRule, SyncState, ImportResult, ExportResult, ValidationResult
- [x] T083 [US7] Create constitution importer in packages/speckit-bridge/src/importer.ts — parse constitution markdown, extract principles as locked decisions (CONST- prefix IDs), extract technical boundaries as locked contracts, write to root .ctx
- [x] T084 [US7] Create spec-to-ctx converter in packages/speckit-bridge/src/importer.ts — parse component spec markdown, extract requirements as contracts (FR- prefix), extract edge cases as gotchas, write to directory .ctx files
- [x] T085 [US7] Create ctx-to-spec exporter in packages/speckit-bridge/src/exporter.ts — read .ctx decisions/contracts/gotchas, render as spec-kit markdown format, preserve manually-edited sections in existing spec files
- [x] T086 [US7] Create constitution validator in packages/speckit-bridge/src/validator.ts — check all .ctx files for compliance with constitutional principles, report violations with severity and principle references
- [x] T087 [US7] Create bidirectional sync engine in packages/speckit-bridge/src/sync.ts — compare timestamps of spec and .ctx files, sync newer to older, detect both-modified conflicts, write .ctxl.speckit-sync.yaml state file
- [x] T088 [US7] Export all modules from packages/speckit-bridge/src/index.ts
- [x] T089 [US7] Create CLI command `ctxkit speckit` with subcommands (import, export, validate, sync) in packages/cli/src/commands/speckit-cmd.ts per contracts/cli-commands.md
- [x] T090 [US7] Register speckit-cmd in packages/cli/src/index.ts
- [x] T091 [US7] Create daemon routes for spec-kit in packages/daemon/src/routes/speckit-routes.ts (POST /api/v1/speckit/import, export, validate, sync) per contracts/daemon-api.md
- [x] T092 [US7] Register speckit routes in packages/daemon/src/server.ts
- [x] T093 [US7] Write integration tests for spec-kit bridge in tests/integration/speckit-bridge.test.ts — test: constitution import creates locked decisions/contracts, component spec import creates contracts/gotchas, export round-trip fidelity, validation detects violations, bidirectional sync with timestamp comparison, conflict detection when both modified

**Checkpoint**: Spec-kit and .ctx bidirectional sync working.

---

## Phase 10: User Story 8 — PR Context & Prompt History (Priority: P8)

**Goal**: Generate PR context documents from session data (prompt chain, agent decisions, context references, file changes, stats).

**Independent Test**: Create a session with known data, generate PR context, verify it contains correct prompt chain, decisions, file changes, and stats.

**Depends on**: Daemon session tables (existing), US1 (index for context references)

### Implementation for User Story 8

- [x] T094 [US8] Create PR context collector in packages/core/src/pr-context/collector.ts — query session data (sessions, request_events, memory_diffs), cross-reference with git (commit ranges, file changes), classify agent decisions (autonomous, context-driven, user-directed, policy-driven)
- [x] T095 [US8] Create PR context renderer in packages/core/src/pr-context/renderer.ts — render PrContext as markdown (change context header, summary, motivation, prompt chain table, agent decisions table, context references, file changes, stats) or as JSON
- [x] T096 [US8] Create CLI command `ctxkit pr` in packages/cli/src/commands/pr-context-cmd.ts per contracts/cli-commands.md — support --session, --branch, --since, --format md|json, --link-specs, --gh
- [x] T097 [US8] Register pr-context-cmd in packages/cli/src/index.ts
- [x] T098 [US8] Create daemon routes for PR context in packages/daemon/src/routes/pr-context-routes.ts (POST /api/v1/pr-context/generate) per contracts/daemon-api.md
- [x] T099 [US8] Register pr-context routes in packages/daemon/src/server.ts
- [x] T100 [US8] Create MCP tool ctxkit.pr_generate in packages/mcp/src/tools/pr-tools.ts per contracts/mcp-tools.md
- [x] T101 [US8] Register pr MCP tool in packages/mcp/src/server.ts
- [x] T102 [US8] Write integration tests for PR context in tests/integration/pr-context.test.ts — test: collector extracts correct prompt chain and decisions from session data, renderer produces valid markdown/JSON, --branch scopes to merge-base, --link-specs adds spec references, stats are accurate

**Checkpoint**: PR context generation produces correct documents from session data.

---

## Phase 11: User Story 9 — Dashboard Extensions (Priority: P9)

**Goal**: Add 5 new dashboard pages (timeline, context map, conflicts, activity feed, PR context viewer).

**Independent Test**: Populate repo with versioned .ctx files, conflicts, and activity events, load each page, verify data renders correctly.

**Depends on**: US1 (index API), US2 (history API), US3 (conflict API), US4 (activity API), US8 (PR context API)

### Implementation for User Story 9

- [x] T103 [P] [US9] Create TimelinePage component in packages/ui/src/pages/TimelinePage.tsx — fetch history from /api/v1/history, render chronological list of .ctx version changes with author, diff summary, and clickable diff links; add filtering by path, author, date range
- [x] T104 [P] [US9] Create TimelineEntry component in packages/ui/src/components/TimelineEntry.tsx — render a single history entry with expandable diff view
- [x] T105 [P] [US9] Create ContextMapPage component in packages/ui/src/pages/ContextMapPage.tsx — fetch .ctxl index graph from /api/v1/index, render interactive SVG force-directed graph with .ctx files as nodes, dependency edges, color-coded freshness (green/yellow/red), conflict warnings, clickable nodes expanding to show sections
- [x] T106 [P] [US9] Create GraphVisualization component in packages/ui/src/components/GraphVisualization.tsx — lightweight SVG-based force-directed layout (compute positions, render nodes/edges/labels, handle click/hover)
- [x] T107 [P] [US9] Create ConflictsPage component in packages/ui/src/pages/ConflictsPage.tsx — fetch conflicts from /api/v1/conflicts, list files with conflict count, each expandable to show ConflictResolver
- [x] T108 [P] [US9] Create ConflictResolver component in packages/ui/src/components/ConflictResolver.tsx — side-by-side diff of both versions, resolution buttons (pick ours, pick theirs, edit merged, keep both), POST resolution to /api/v1/conflicts/resolve
- [x] T109 [P] [US9] Create ActivityPage component in packages/ui/src/pages/ActivityPage.tsx — subscribe to SSE stream at /api/v1/activity/stream, render events in real-time feed, add filtering by event type, ctx path, agent
- [x] T110 [P] [US9] Create ActivityFeed component in packages/ui/src/components/ActivityFeed.tsx — streaming event list with auto-scroll, event type icons, expandable detail view
- [x] T111 [P] [US9] Create PrContextPage component in packages/ui/src/pages/PrContextPage.tsx — fetch PR context from /api/v1/pr-context/generate for a session, render markdown, add copy-to-clipboard and open-in-GitHub buttons
- [x] T112 [P] [US9] Create PrContextRenderer component in packages/ui/src/components/PrContextRenderer.tsx — render PrContext markdown with syntax highlighting for code blocks, tables, and stats
- [x] T113 [US9] Update App.tsx in packages/ui/src/App.tsx to add routes for /timeline, /map, /conflicts, /activity, /sessions/:id/pr and navigation links
- [x] T114 [US9] Add API proxy routes in packages/ui/vite.config.ts for new daemon endpoints (/api/v1/index, /api/v1/history, /api/v1/conflicts, /api/v1/activity, /api/v1/pr-context, /api/v1/speckit)

**Checkpoint**: All 5 dashboard extension pages render correctly with test data.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, validation, and cross-cutting improvements.

- [x] T115 [P] Extend SessionEnd hook in packages/claude-plugin/scripts/session-end.js to record final activity events (session summary, total stale dirs, proposals generated) to daemon
- [x] T116 [P] Add .ctxl.lock to .gitignore template in packages/core/src/conflict/lock-manager.ts (ensure lock manager appends .ctxl.lock to .gitignore if not present)
- [x] T117 Verify all existing 223+ integration tests still pass after v2 changes (v1 backward compatibility per SC-009)
- [x] T118 Verify all existing 84+ E2E tests still pass after v2 changes (v1 backward compatibility per SC-009)
- [x] T119 Write E2E test for full v1-to-v2 migration flow in tests/e2e/versioning-e2e.test.ts — test: ctxkit migrate (dry run + apply), idempotency, all v1 workflows still work after migration
- [x] T120 Run quickstart.md scenario validation — verify each of the 9 scenarios executes as documented
- [x] T121 Run pnpm build to verify all 7 packages compile without errors
- [x] T122 Run pnpm lint to verify zero lint violations across all packages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in priority order or in parallel where dependencies allow
- **Polish (Phase 12)**: Depends on all user stories being complete

### User Story Dependencies

```
US1 (Index) ──────────┬───▶ US4 (Auto-Update)
                      ├───▶ US5 (Bootstrap)
                      └───▶ US6 (/ctx Skill)

US2 (Versioning) ────┬───▶ US3 (Conflicts)
                     ├───▶ US4 (Auto-Update)
                     ├───▶ US7 (Spec-Kit)
                     └───▶ US6 (/ctx Skill)

US3 (Conflicts) ─────────▶ US6 (/ctx Skill)

US4 (Auto-Update) ───────▶ US6 (/ctx Skill)

US5 (Bootstrap) ──────────▶ US6 (/ctx Skill)

US7 (Spec-Kit) ───────────▶ (independent after US2)

US8 (PR Context) ─────────▶ (independent after Foundational)

US9 (Dashboard) ──────────▶ (depends on US1–US5 APIs)
```

### Recommended Execution Order

1. **Phase 1** → **Phase 2** (sequential, blocking)
2. **US1** (Index) → foundation for most others
3. **US2** (Versioning) → can start after US1, required by US3/US4
4. **US3** (Conflicts) and **US5** (Bootstrap) → can run in parallel after US2/US1
5. **US4** (Auto-Update) → after US1 + US2
6. **US7** (Spec-Kit) and **US8** (PR Context) → can run in parallel, independent
7. **US6** (/ctx Skill) → after US1–US5
8. **US9** (Dashboard) → after US1–US5 APIs available
9. **Phase 12** (Polish) → after all user stories

### Within Each User Story

- Types/models before services
- Core logic before CLI/daemon/MCP
- CLI/daemon/MCP can be parallel (different files)
- Integration tests after implementation
- E2E tests last

### Parallel Opportunities

**Phase 1** (Setup): T001–T007 are all [P] — different type files.

**US1**: T027/T029/T031 (CLI/daemon/MCP) can run in parallel after core (T020–T026).

**US5 + US7 + US8**: These three user stories can run fully in parallel with each other.

**US9**: T103–T112 are all [P] — different page/component files.

---

## Parallel Example: User Story 1

```bash
# Phase 1: All type files in parallel
Task T001: CtxlIndex types in packages/core/src/types/ctxl.ts
Task T002: HistoryEntry types in packages/core/src/types/history.ts
Task T003: Lock types in packages/core/src/types/lock.ts
Task T004: Conflict types in packages/core/src/types/conflict.ts
Task T005: Activity types in packages/core/src/types/activity.ts
Task T006: Bootstrap types in packages/core/src/types/bootstrap.ts
Task T007: PR Context types in packages/core/src/types/pr-context.ts

# US1: CLI, daemon, and MCP in parallel after core logic
Task T027: CLI command in packages/cli/src/commands/index-cmd.ts
Task T029: Daemon routes in packages/daemon/src/routes/index-routes.ts
Task T031: MCP tools in packages/mcp/src/tools/index-tools.ts
```

## Parallel Example: User Story 9

```bash
# All page components in parallel (different files)
Task T103: TimelinePage.tsx
Task T105: ContextMapPage.tsx
Task T107: ConflictsPage.tsx
Task T109: ActivityPage.tsx
Task T111: PrContextPage.tsx

# All shared components in parallel
Task T104: TimelineEntry.tsx
Task T106: GraphVisualization.tsx
Task T108: ConflictResolver.tsx
Task T110: ActivityFeed.tsx
Task T112: PrContextRenderer.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T010)
2. Complete Phase 2: Foundational (T011–T019)
3. Complete Phase 3: US1 — Index & Selection (T020–T034)
4. **STOP and VALIDATE**: Test index generation and selection independently
5. Deploy/demo if ready — O(1) index read replaces O(n) directory walks

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Index) → Test → **MVP!** (fast context selection)
3. US2 (Versioning) → Test → Version tracking for every .ctx change
4. US3 (Conflicts) → Test → Multi-agent safety
5. US4 (Auto-Update) → Test → Sessions auto-maintain context
6. US5 (Bootstrap) → Test → Easy onboarding for new repos
7. US6 (/ctx Skill) → Test → Unified agent interface
8. US7, US8 in parallel → Test → Spec-kit bridge + PR context
9. US9 (Dashboard) → Test → Visual oversight layer
10. Polish → Full validation → Complete

### Parallel Team Strategy

With multiple developers after Foundational phase:

- **Dev A**: US1 (Index) → US4 (Auto-Update) → US6 (/ctx Skill)
- **Dev B**: US2 (Versioning) → US3 (Conflicts) → US9 (Dashboard)
- **Dev C**: US7 (Spec-Kit Bridge) + US8 (PR Context)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All 223+ existing integration tests and 84+ existing E2E tests must continue to pass (SC-009)
