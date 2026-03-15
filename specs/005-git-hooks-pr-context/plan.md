# Implementation Plan: Git Hooks PR Context & Embedded UI

**Branch**: `005-git-hooks-pr-context` | **Date**: 2026-03-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-git-hooks-pr-context/spec.md`

## Summary

Add a `prepare-commit-msg` git hook that injects minimal context trailers (session ID, changed .ctx files, entry count, timestamp) into commit messages using standard git trailer format. Extend the dashboard UI with a commit history view that parses these trailers from git log. Embed the dashboard into the CLI so it can be served without separately managing the daemon. Add auto-install capability to the Claude Code plugin.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: Hono 4.7 (HTTP), better-sqlite3 11.8 (storage), Commander 13 (CLI), React 19 (UI), @modelcontextprotocol/sdk 1.27 (MCP)
**Storage**: SQLite via better-sqlite3 (WAL mode, `~/.ctxl/data/ctxl.db`) — new `commit_context` table
**Testing**: Vitest (integration + E2E), real filesystem temp dirs, spawned processes
**Target Platform**: macOS, Linux, Windows (Git Bash/WSL)
**Project Type**: Monorepo (CLI + daemon + UI + library + plugin)
**Performance Goals**: Hook execution ≤500ms, daemon timeout fallback ≤200ms, dashboard load ≤2s for 10k commits
**Constraints**: No network access (local-first), hooks must be POSIX shell scripts, redaction before writing trailers
**Scale/Scope**: Individual developer repos, up to 10,000 commits with trailers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Local-First, Private-by-Default | ✅ Pass | Git hooks run locally. Trailers are in local git history. No network calls. Daemon communication is localhost-only. |
| II. Repository Truth Over Guessing | ✅ Pass | Extends existing `hooks-cmd.ts` rather than creating new infrastructure. Reuses `redactSecrets()`, `collectPrContext()`, and existing UI routing patterns. |
| III. Transparent, Inspectable Context | ✅ Pass | Trailers are human-readable in commit messages, viewable via `git log`, and browsable in dashboard. Every trailer has source attribution (session ID, file paths). |
| IV. Deterministic, Budgeted Context | ✅ Pass | Same staged files + same session = same trailers. Minimal fixed format avoids churn. No randomness. |
| Quality: E2E + Integration First | ✅ Plan | Integration tests for trailer parsing/formatting. E2E tests for hook install → commit → verify trailer → dashboard display pipeline. |
| Context & Memory: No Secrets | ✅ Pass | All trailer values pass through `redactSecrets()` before writing. Covered by FR-006. |
| Operational Safety | ✅ Pass | Hook has 500ms timeout. Daemon fallback at 200ms. Hook is a no-op when nothing to inject. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/005-git-hooks-pr-context/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/
│   ├── cli-commands.md  # CLI command contracts
│   ├── api-endpoints.md # API endpoint contracts
│   └── trailer-format.md # Git trailer format specification
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
  core/src/
    git/                      # NEW — git utilities module
      trailer-parser.ts       # Parse Ctxkit-* trailers from commit messages
      trailer-formatter.ts    # Format trailers with redaction
      commit-log.ts           # Query git log and extract trailers from commits
      types.ts                # TrailerData, ParsedTrailer, CommitContextRecord, HookPolicy types
      index.ts                # Module exports
    redact/secrets.ts         # EXISTING — used for trailer redaction
    pr-context/               # EXISTING — extended for commit context
    index.ts                  # EXISTING — add git module exports

  cli/src/commands/
    hooks-cmd.ts              # EXISTING — extend with prepare-commit-msg
    dashboard-cmd.ts          # NEW — serve dashboard UI from CLI

  daemon/src/
    routes/
      commit-context-routes.ts # NEW — commit context API endpoints
      hooks-routes.ts          # NEW — hook status API endpoint
    store/
      db.ts                    # EXISTING — add commit_context table

  claude-plugin/src/scripts/
    session-start.ts          # EXISTING — add hook auto-install check

  ui/src/
    pages/
      CommitHistoryPage.tsx   # NEW — commit history view
    services/
      api.ts                  # EXISTING — add commit context API functions
    App.tsx                   # EXISTING — add /commits route

tests/
  integration/
    trailer-parsing.test.ts   # NEW — trailer parse/format tests
    commit-context-api.test.ts # NEW — API integration tests
  e2e/
    git-hooks.test.ts         # NEW — full hook lifecycle E2E
    dashboard-commits.test.ts # NEW — dashboard commit view E2E
```

**Structure Decision**: Extends the existing monorepo structure. New code is added to existing packages following established patterns. Only new files are the git utilities module in core, a dashboard CLI command, commit context API routes, and the commit history UI page.

## Complexity Tracking

No constitution violations to justify. Feature is additive and follows existing patterns.
