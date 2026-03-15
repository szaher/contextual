# Implementation Plan: ctxl v2 — Index, Versioning, Conflicts, and Ecosystem

**Branch**: `004-ctxl-v2` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-ctxl-v2/spec.md`

## Summary

ctxl v2 extends the existing monorepo with index-based context selection (.ctxl), inline versioning with history, multi-agent conflict resolution via three-way merge and file-level locking, auto-update hooks, a bootstrapping engine, a unified /ctx skill, a spec-kit integration bridge, PR context generation, and dashboard extensions — all while maintaining zero breaking changes with v1.

The implementation extends all 6 existing packages (`@ctxkit/core`, `@ctxkit/daemon`, `@ctxkit/cli`, `@ctxkit/mcp`, `@ctxkit/claude-plugin`, `@ctxkit/ui`) and adds one new package (`@ctxkit/speckit-bridge`). The core approach is additive: new modules are added alongside existing ones, existing interfaces are extended (not replaced), and the v1 fallback path is preserved for repositories without v2 artifacts.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node.js 20+
**Primary Dependencies**:
- Hono 4.7 (HTTP framework, daemon)
- better-sqlite3 11.8 (SQLite storage, WAL mode)
- commander 13 (CLI)
- zod 3.25 (schema validation)
- @modelcontextprotocol/sdk 1.27 (MCP server)
- js-yaml 4.x (YAML parse/serialize, already used)
- proper-lockfile 4.x (file-level locking, already used)
- React 19 + Vite 6 + react-router-dom 7 (dashboard UI)

**Storage**: SQLite via better-sqlite3 (WAL mode, `~/.ctxl/data/ctxl.db`) + filesystem (.ctx YAML, .ctxl YAML, .ctxl.lock YAML, .ctxl.history/ YAML)
**Testing**: Vitest 3.0 (integration + E2E, real filesystem + real SQLite)
**Target Platform**: Node.js CLI + local HTTP daemon (macOS, Linux, Windows)
**Project Type**: Monorepo (7 packages: library, CLI, daemon, MCP server, plugin, UI, speckit-bridge)
**Performance Goals**: <500ms for index read + context selection on repos with 100 .ctx files
**Constraints**: Local-first (no network unless user-enabled), backward compatible with v1, deterministic context packs
**Scale/Scope**: Repos with 100+ .ctx files, concurrent multi-agent sessions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Local-First, Private-by-Default | PASS | All state is filesystem + local SQLite. No network calls. .ctxl, .ctxl.lock, .ctxl.history/ are local. Daemon binds to 127.0.0.1. |
| II. Repository Truth Over Guessing | PASS | v2 extends existing @ctxkit/core modules (parser, scorer, packer). New index reads actual .ctx files. Bootstrap reads actual source files. No invented behavior. |
| III. Transparent, Inspectable Context Injection | PASS | Selection results include source paths, reason codes (LOCALITY, TAG_MATCH, DEPENDENCY, etc.), omitted entries with exclusion reasons, and budget usage breakdown. |
| IV. Deterministic, Budgeted Context | PASS | Scoring formula is deterministic (locality * w + recency * w + tagMatch * w + bonuses). Budget enforcement by category (contracts, local_ctx, related_ctx, history). Same inputs = same output. |
| E2E + Integration First | PASS | All features tested via real filesystem temp dirs, real SQLite, spawned daemon. Existing 223 integration + 84 E2E tests preserved. |
| Context & Memory Standards | PASS | .ctx files remain human-editable YAML, git-tracked. Updates via propose-then-approve workflow. Secret redaction preserved. Ignore policies respected. |
| Operational Safety | PASS | Lock manager with 5-min TTL prevents write races. Atomic writes via proper-lockfile. Audit trail for all context changes. Daemon bounded resources. |

**Gate Result**: ALL PASS — no violations, no complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-ctxl-v2/
├── plan.md              # This file
├── spec.md              # Feature specification (9 user stories, 30 FRs)
├── research.md          # Phase 0 output: technical decisions
├── data-model.md        # Phase 1 output: entity schemas
├── quickstart.md        # Phase 1 output: integration scenarios
├── contracts/           # Phase 1 output: interface contracts
│   ├── cli-commands.md      # New CLI command contracts
│   ├── mcp-tools.md         # New MCP tool contracts
│   ├── daemon-api.md        # New daemon API endpoint contracts
│   └── ctx-skill.md         # /ctx skill subcommand contracts
├── checklists/
│   └── requirements.md      # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
  core/src/
  ├── index.ts                     # Extended exports
  ├── types/
  │   ├── ctx.ts                   # Extended: CtxFile + _history, version as counter
  │   ├── ctxl.ts                  # NEW: CtxlIndex, CtxlEntry, graph, policies, scoring, budget schemas
  │   ├── config.ts                # Extended: ScoringConfig weights, BudgetConfig categories
  │   ├── pack.ts                  # Extended: new ReasonCodes (DEPENDENCY, CWD_ANCESTOR, etc.)
  │   ├── history.ts               # NEW: HistoryEntry, CtxDiff, SectionDiff
  │   ├── lock.ts                  # NEW: LockInfo, LockHandle
  │   ├── conflict.ts              # NEW: ConflictEntry, MergeResult, MergeStrategy, ResolutionChoice
  │   ├── activity.ts              # NEW: ActivityEvent types
  │   ├── bootstrap.ts             # NEW: AnalysisResult, BootstrapOptions
  │   └── pr-context.ts            # NEW: PrContext, PromptEntry, AgentDecision, etc.
  ├── ctx/
  │   ├── parser.ts                # Extended: parse/serialize _history, handle version as integer
  │   ├── validator.ts             # Extended: validate _history entries, conflict markers
  │   ├── merger.ts                # Extended: support index-based discovery path
  │   └── migrator.ts              # Extended: v1→v2 migration (init history, checksums)
  ├── index/
  │   ├── generator.ts             # NEW: generate .ctxl index from repo scan
  │   ├── selector.ts              # NEW: index-based context selection algorithm
  │   ├── checksum.ts              # NEW: SHA-256 checksum computation (excluding _history)
  │   └── updater.ts               # NEW: incremental index update (single entry)
  ├── versioning/
  │   ├── bumper.ts                # NEW: version bump + history entry creation
  │   ├── archive.ts               # NEW: history overflow to .ctxl.history/
  │   └── differ.ts                # NEW: structured diff between .ctx versions
  ├── conflict/
  │   ├── lock-manager.ts          # NEW: file-level lock acquisition/release/TTL
  │   ├── merge-engine.ts          # NEW: three-way merge with section strategies
  │   └── resolver.ts              # NEW: conflict resolution (pick, merge, keep both)
  ├── scorer/
  │   ├── scorer.ts                # Extended: index-aware scoring with configurable weights
  │   ├── locality.ts              # Extended: depth-based scoring from index
  │   ├── recency.ts               # (unchanged)
  │   └── tags.ts                  # (unchanged)
  ├── packer/
  │   ├── packer.ts                # Extended: index-based discovery path, category budgets
  │   ├── budget.ts                # Extended: per-category budget (contracts, local, related, history)
  │   └── tokens.ts                # (unchanged)
  ├── bootstrap/
  │   ├── analyzer.ts              # NEW: directory analysis (language, frameworks, entry points)
  │   └── generator.ts             # NEW: .ctx file generation from analysis
  ├── auto-update/
  │   ├── staleness-tracker.ts     # NEW: track stale directories during sessions
  │   └── proposal-generator.ts    # NEW: generate .ctx update proposals from git diff
  └── pr-context/
      ├── collector.ts             # NEW: collect session data for PR context
      └── renderer.ts              # NEW: render PR context as markdown/JSON

  daemon/src/
  ├── store/
  │   └── db.ts                    # Extended: new tables (activity_events, locks, conflicts)
  ├── routes/
  │   ├── index-routes.ts          # NEW: /api/v1/index (generate, read, select)
  │   ├── history-routes.ts        # NEW: /api/v1/history (view, diff)
  │   ├── conflict-routes.ts       # NEW: /api/v1/conflicts (list, resolve)
  │   ├── bootstrap-routes.ts      # NEW: /api/v1/bootstrap (analyze, generate)
  │   ├── activity-routes.ts       # NEW: /api/v1/activity (feed, events)
  │   ├── pr-context-routes.ts     # NEW: /api/v1/pr-context (generate, view)
  │   └── speckit-routes.ts        # NEW: /api/v1/speckit (import, export, validate, sync)
  └── server.ts                    # Extended: register new routes

  cli/src/commands/
  ├── index-cmd.ts                 # NEW: ctxkit index [generate|select|show]
  ├── history-cmd.ts               # NEW: ctxkit history <path> [--diff v1..v2]
  ├── conflicts-cmd.ts             # NEW: ctxkit conflicts [list|resolve]
  ├── bootstrap-cmd.ts             # NEW: ctxkit bootstrap [path] [--quick|--full|--dry-run]
  ├── speckit-cmd.ts               # NEW: ctxkit speckit [import|export|validate|sync]
  ├── pr-context-cmd.ts            # NEW: ctxkit pr [--branch|--session|--format|--gh]
  ├── migrate-cmd.ts               # NEW: ctxkit migrate [--dry-run]
  └── hooks-cmd.ts                 # NEW: ctxkit hooks init

  mcp/src/tools/
  ├── index-tools.ts               # NEW: ctxkit.index_generate, ctxkit.index_select
  ├── history-tools.ts             # NEW: ctxkit.ctx_history
  ├── write-tools.ts               # NEW: ctxkit.ctx_write (with locking + versioning)
  ├── bootstrap-tools.ts           # NEW: ctxkit.ctx_bootstrap
  └── pr-tools.ts                  # NEW: ctxkit.pr_generate

  claude-plugin/
  ├── hooks/hooks.json             # Extended: updated hook scripts for v2 features
  ├── scripts/
  │   ├── session-start.js         # Extended: index-based context selection
  │   ├── post-tool-use.js         # Extended: staleness tracking
  │   ├── task-completed.js        # Extended: auto-update proposals
  │   └── session-end.js           # Extended: activity feed recording
  └── skills/
      ├── ctxkit/SKILL.md          # Extended: /ctxkit alias points to /ctx
      └── ctx/SKILL.md             # NEW: /ctx skill with all subcommands

  ui/src/
  ├── pages/
  │   ├── TimelinePage.tsx         # NEW: memory evolution timeline
  │   ├── ContextMapPage.tsx       # NEW: dependency graph visualization
  │   ├── ConflictsPage.tsx        # NEW: conflict resolution UI
  │   ├── ActivityPage.tsx         # NEW: real-time activity feed
  │   └── PrContextPage.tsx        # NEW: PR context viewer
  ├── components/
  │   ├── TimelineEntry.tsx        # NEW: timeline entry component
  │   ├── GraphVisualization.tsx   # NEW: force-directed graph for context map
  │   ├── ConflictResolver.tsx     # NEW: side-by-side conflict diff + resolve
  │   ├── ActivityFeed.tsx         # NEW: streaming event feed component
  │   └── PrContextRenderer.tsx   # NEW: markdown PR context renderer
  └── App.tsx                      # Extended: new routes

  speckit-bridge/                  # NEW PACKAGE
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts                 # Package exports
      ├── types.ts                 # MappingRule, SyncState, etc.
      ├── importer.ts              # constitution/spec → .ctx
      ├── exporter.ts              # .ctx → spec-kit markdown
      ├── validator.ts             # validate .ctx against constitution
      └── sync.ts                  # bidirectional sync engine

tests/
  integration/
  ├── index-generation.test.ts     # NEW: .ctxl index generation + selection
  ├── versioning.test.ts           # NEW: version bumping, history, archive
  ├── conflict-resolution.test.ts  # NEW: locking, three-way merge, resolution
  ├── bootstrap.test.ts            # NEW: directory analysis + .ctx generation
  ├── auto-update.test.ts          # NEW: staleness tracking + proposal generation
  ├── speckit-bridge.test.ts       # NEW: import/export/validate/sync
  └── pr-context.test.ts           # NEW: PR context generation
  e2e/
  ├── index-selection.test.ts      # NEW: end-to-end index flow
  ├── versioning-e2e.test.ts       # NEW: end-to-end versioning flow
  ├── conflict-e2e.test.ts         # NEW: end-to-end multi-agent conflict
  ├── bootstrap-e2e.test.ts        # NEW: end-to-end bootstrap flow
  └── ctx-skill.test.ts            # NEW: /ctx skill subcommand tests
```

**Structure Decision**: Extends existing monorepo structure. All new code is additive — new source directories within existing packages, new test files alongside existing ones. One new package (`@ctxkit/speckit-bridge`) for spec-kit integration to isolate its external parsing dependencies. No restructuring of existing code.

## Complexity Tracking

> No violations detected. All design choices align with constitution principles.
> No complexity justifications needed.
