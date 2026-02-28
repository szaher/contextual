# Implementation Plan: Context & Memory Manager

**Branch**: `001-context-memory-manager` | **Date**: 2026-02-28
**Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-context-memory-manager/spec.md`

## Summary

Build a local "Context & Memory Manager" (ctxl) that maintains
per-directory `.ctx` memory files, assembles deterministic Context
Packs for coding agent requests within token budgets, and provides
a local daemon + CLI + dashboard for inspection, memory update
proposals, drift detection, and audit logging. The system is
local-first, offline-only, and agent-agnostic.

The MVP delivers: core context engine, .ctx YAML format,
local daemon with session tracking, CLI (ctxkit), and a React
dashboard — all proven by 3 E2E scenarios.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: Hono (HTTP), better-sqlite3 (storage),
Commander.js (CLI), React + Vite + shadcn/ui (dashboard),
js-yaml (.ctx parsing), proper-lockfile (concurrent access)
**Storage**: SQLite (sessions/events/audit) + filesystem (.ctx YAML)
**Testing**: Vitest (unit + integration), custom E2E harness
(spawned daemon + CLI assertions)
**Target Platform**: macOS, Linux (developer machines)
**Project Type**: Monorepo: library + daemon + CLI + web dashboard
**Performance Goals**: Context Pack assembly < 500ms for up to
100 .ctx files
**Constraints**: Offline-only, < 100MB memory for daemon,
local-first (no network unless explicit export)
**Scale/Scope**: Single developer machine, multiple concurrent
sessions, repos with up to 100 .ctx files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after
Phase 1 design.*

### I. Local-First, Private-by-Default

- All storage local (SQLite in `~/.ctxl/data/`, .ctx in repo).
- Daemon binds to localhost only (`127.0.0.1:3742`).
- No network calls anywhere in the codebase.
- Export not implemented in MVP; when added, requires explicit
  user action with scope selection.
- **Status**: PASS

### II. Repository Truth Over Guessing

- .ctx files live in the repository, tracked by git.
- Drift detection compares .ctx content against actual repo state.
- Context assembly reads real .ctx files, not cached copies.
- Deep-read fallback reads actual files when .ctx is stale.
- **Status**: PASS

### III. Transparent, Inspectable Context Injection

- Every Context Pack item includes source path + reason codes.
- Omitted items list with scores and exclusion reasons.
- Session timeline records full context per request.
- CLI preview command shows pack without side effects.
- Dashboard provides visual inspection of all decisions.
- **Status**: PASS

### IV. Deterministic, Budgeted Context

- Scoring produces stable ordering (locality + recency + tags +
  pins with deterministic tiebreakers).
- Default budget: 4,000 tokens (configurable per-repo/agent/
  request).
- Priority-based truncation with documented strategy.
- Identical inputs + identical repo state = identical pack.
- **Status**: PASS

### Quality & Testing Standards

- E2E tests: 3 scenarios (single ctx, hierarchical, drift).
- Integration tests: daemon API + filesystem + SQLite.
- Unit tests: targeted for .ctx parser, scoring logic, secret
  detection, token estimation.
- Test realism: real temp dirs, real SQLite, spawned daemon.
- Testability: stable CLI commands (ctxkit inject, sessions,
  propose, apply).
- **Status**: PASS

### Context & Memory Standards

- .ctx files are YAML, human-editable, git-tracked.
- Secret redaction before .ctx writes and log entries.
- Diff-based update flow: propose → approve → write.
- Staleness tracking via `verified_at` commit hash per entry.
- Ignore policies: `never_read` and `never_log` in config.
- **Status**: PASS

### Operational Safety

- Daemon: bounded memory, graceful shutdown, backpressure
  (request queue limit).
- Atomic .ctx writes via proper-lockfile.
- SQLite WAL mode for concurrent reads.
- Audit trail for all memory changes.
- Retention: 30-day sessions, 90-day audit (configurable).
- **Status**: PASS

**Gate result: ALL PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/001-context-memory-manager/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entity schemas
├── quickstart.md        # Phase 1: demo walkthrough
├── contracts/
│   └── daemon-api.md    # Phase 1: HTTP API contract
└── tasks.md             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── core/                        # @ctxl/core — context engine
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # Public API exports
│       ├── ctx/
│       │   ├── parser.ts        # YAML parse/serialize
│       │   ├── validator.ts     # Schema validation
│       │   ├── migrator.ts      # Version migration
│       │   └── merger.ts        # Hierarchical merge
│       ├── scorer/
│       │   ├── scorer.ts        # Relevance scoring engine
│       │   ├── locality.ts      # Directory distance scoring
│       │   ├── recency.ts       # Staleness-aware recency
│       │   └── tags.ts          # Tag matching
│       ├── packer/
│       │   ├── packer.ts        # Context Pack assembly
│       │   ├── budget.ts        # Token budgeting + truncation
│       │   └── tokens.ts        # Token estimation (chars/4)
│       ├── differ/
│       │   ├── differ.ts        # .ctx diff generation
│       │   └── drift.ts         # Drift detection (git-based)
│       ├── config/
│       │   └── loader.ts        # Profile loading + precedence
│       ├── redact/
│       │   └── secrets.ts       # Secret pattern detection
│       └── types/
│           ├── ctx.ts           # .ctx file types
│           ├── pack.ts          # Context Pack types
│           └── config.ts        # Profile/config types
│
├── daemon/                      # @ctxl/daemon — local server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # Entry point
│       ├── server.ts            # Hono app setup
│       ├── routes/
│       │   ├── sessions.ts      # Session CRUD
│       │   ├── context-pack.ts  # Pack build + preview
│       │   ├── proposals.ts     # Memory diff management
│       │   ├── drift.ts         # Drift check endpoints
│       │   ├── audit.ts         # Audit log query
│       │   └── health.ts        # Health check
│       ├── store/
│       │   ├── db.ts            # SQLite setup + migrations
│       │   ├── sessions.ts      # Session queries
│       │   ├── events.ts        # Request event queries
│       │   ├── diffs.ts         # Memory diff queries
│       │   └── audit.ts         # Audit log queries
│       └── scheduler/
│           └── retention.ts     # Retention cleanup job
│
├── cli/                         # @ctxl/cli — ctxkit command
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # CLI entry point
│       └── commands/
│           ├── init.ts          # ctxkit init
│           ├── validate.ts      # ctxkit validate
│           ├── inject.ts        # ctxkit inject (+ --preview)
│           ├── sessions.ts      # ctxkit sessions [show]
│           ├── propose.ts       # ctxkit propose
│           ├── apply.ts         # ctxkit apply
│           ├── drift.ts         # ctxkit drift
│           ├── run.ts           # ctxkit run -- <cmd>
│           └── daemon.ts        # ctxkit daemon start/stop
│
└── ui/                          # @ctxl/ui — React dashboard
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── components/
        │   ├── SessionList.tsx
        │   ├── SessionTimeline.tsx
        │   ├── ContextPackView.tsx
        │   ├── CtxEditor.tsx
        │   ├── DiffViewer.tsx
        │   ├── AuditLog.tsx
        │   └── SearchBar.tsx
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── SessionDetail.tsx
        │   ├── CtxBrowser.tsx
        │   └── AuditPage.tsx
        └── services/
            └── api.ts           # Daemon API client

tests/
├── integration/                 # Cross-package tests
│   ├── context-pack.test.ts     # Core + filesystem
│   ├── daemon-api.test.ts       # Daemon + SQLite + core
│   └── proposals.test.ts        # Propose → approve → apply
├── e2e/                         # Full system tests
│   ├── single-ctx.test.ts       # Scenario 1: root .ctx only
│   ├── hierarchical.test.ts     # Scenario 2: nested .ctx merge
│   └── drift.test.ts            # Scenario 3: drift detection flow
└── fixtures/
    ├── repos/                   # Sample repo snapshots
    │   ├── simple/
    │   └── nested/
    └── golden/                  # Expected Context Pack outputs
        ├── simple-pack.json
        └── nested-pack.json
```

**Structure Decision**: Monorepo with 4 packages (`core`, `daemon`,
`cli`, `ui`) using pnpm workspaces. This separation is justified
because:
- `core` is a pure library with no I/O framework dependencies,
  used by both `daemon` and `cli`.
- `ui` is a separate build artifact (static files served by daemon).
- `cli` and `daemon` are separate entry points with different
  dependency profiles.
- Tests span packages via the root `tests/` directory.

## Complexity Tracking

> No constitution violations. No complexity justifications needed.
