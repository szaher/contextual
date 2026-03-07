# Implementation Plan: Gap Remediation — Security, Correctness & Data Integrity

**Branch**: `003-gap-remediation` | **Date**: 2026-03-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-gap-remediation/spec.md`

## Summary

Remediate 17 bugs, 3 feature gaps, and 4 scoring improvements identified in the ctxl gap analysis. The work spans 4 packages (`@ctxl/core`, `@ctxl/daemon`, `@ctxl/cli`, `@ctxl/claude-plugin`) and covers: eliminating a critical command injection vector, fixing path traversal, correcting scoring algorithms (locality, recency, tags), completing the proposal apply workflow with full-file replacement and conflict detection, integrating the retention scheduler, hardening API inputs, and fixing convention violations. No new packages or external dependencies are introduced.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: Hono 4.7, better-sqlite3 11.8, commander 13, zod 3.25, @modelcontextprotocol/sdk 1.27
**Storage**: SQLite via better-sqlite3 (WAL mode, single file at `~/.ctxl/data/ctxl.db`)
**Testing**: Vitest 3.2 — 147 integration tests + 79 E2E tests (all passing)
**Target Platform**: Developer machines (macOS, Linux, Windows via WSL)
**Project Type**: Monorepo (6 packages: core library, daemon, CLI, MCP server, Claude plugin, dashboard UI)
**Performance Goals**: Context pack assembly < 500ms; hook timeouts 5-10s; daemon API < 100ms p95
**Constraints**: Local-first (no network), single SQLite file, stdio-clean for MCP/hooks
**Scale/Scope**: Individual developer use; repos with 10-1000 .ctx files; 1-50 sessions/day

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check

| Principle | Status | Evidence |
|-----------|--------|----------|
| **I. Local-First, Private-by-Default** | PASS | All changes are local (daemon on localhost, SQLite, filesystem). No network access added. |
| **II. Repository Truth Over Guessing** | PASS | All fixes target verified bugs in existing code with exact line references. No new behavior invented. |
| **III. Transparent, Inspectable Context Injection** | PASS | Scoring fixes improve attribution accuracy. Warning return mechanism (FR-018) improves transparency. |
| **IV. Deterministic, Budgeted Context** | PASS | Locality fix restores correct scoring. Budget validation (FR-016) ensures enforcement. Recency decay is deterministic for same inputs. |
| **E2E + Integration First** | PASS | Tests planned: integration tests for retention, proposal apply, body limits, scoring. Unit tests for scoring (pure functions) and parser validation per constitution guidance. |
| **Test Realism** | PASS | Real filesystem temp dirs, real SQLite in test mode, spawned daemon for E2E. |
| **Context & Memory Standards** | PASS | Proposal apply completes the diff-review-apply workflow. Secret detection fix improves redaction. Ignore pattern fix ensures policy respect. |
| **Operational Safety** | PASS | Atomic writes for proposal apply (FR-015). Body size limits prevent DoS. Retention scheduler prevents unbounded growth. |
| **Small Dependency Footprint** | PASS | Zero new dependencies. All fixes use Node.js stdlib and existing libraries. |

### Post-Design Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Local-First** | PASS | No changes to network posture. |
| **II. Repo Truth** | PASS | Research confirmed all decisions against actual code. |
| **III. Transparent** | PASS | Warnings array in ContextPack + ParseResult makes side effects inspectable. |
| **IV. Deterministic** | PASS | Recency decay uses `verifiedAt` date → deterministic for same repo state. |
| **Testing** | PASS | Integration tests for cross-boundary changes; targeted unit tests for scoring (pure functions). |
| **Operational Safety** | PASS | Atomic writes, body limits, retention scheduler, path validation. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-gap-remediation/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: schema and type changes
├── quickstart.md        # Phase 1: implementation guide
├── contracts/
│   └── api-changes.md   # Phase 1: API contract changes
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/
├── core/src/
│   ├── differ/
│   │   └── drift.ts            # BUG-001: execSync → execFileSync
│   ├── scorer/
│   │   ├── locality.ts         # BUG-003: fix no-op ternary
│   │   ├── recency.ts          # BUG-009, BUG-014: time-decay + staleness consistency
│   │   └── tags.ts             # BUG-011: cap partial match inflation
│   ├── ctx/
│   │   ├── parser.ts           # BUG-006: type guards + warnings
│   │   └── merger.ts           # BUG-013: directory boundary matching
│   ├── packer/
│   │   ├── budget.ts           # BUG-008: console.warn → warnings array
│   │   └── packer.ts           # BUG-013: ignore pattern directory boundary (same fix as merger.ts)
│   ├── redact/
│   │   └── secrets.ts          # BUG-007: find all matches per line
│   └── config/
│       └── loader.ts           # BUG-017: os.homedir()
├── daemon/src/
│   ├── store/
│   │   ├── db.ts               # BUG-005/FR-007: nullable columns + source_hash
│   │   └── events.ts           # BUG-005: fix insertToolEvent mapping
│   ├── scheduler/
│   │   └── retention.ts        # BUG-002, BUG-016: fix column + console.error
│   ├── routes/
│   │   ├── drift.ts            # BUG-010: path traversal validation
│   │   └── proposals.ts        # GAP-002: implement proposal apply
│   ├── server.ts               # GAP-003: bodyLimit middleware
│   └── index.ts                # GAP-001: start retention scheduler
├── cli/src/commands/
│   ├── inject.ts               # BUG-015: budget validation
│   ├── run.ts                  # BUG-015: budget validation
│   └── daemon.ts               # BUG-017: os.homedir()
tests/
├── integration/
│   ├── context-pack.test.ts    # Update scoring assertions
│   ├── scoring.test.ts         # NEW: locality, recency, tags tests
│   ├── retention.test.ts       # NEW: retention scheduler tests
│   ├── proposals.test.ts       # NEW/update: proposal apply tests
│   ├── api-hardening.test.ts   # NEW: body limits, path traversal tests
│   └── homedir.test.ts         # NEW: os.homedir() resolution tests
└── e2e/
    └── proposal-apply.test.ts  # NEW: full workflow E2E test
```

**Structure Decision**: Existing monorepo structure preserved. All changes modify existing files. New test files follow the established `tests/integration/` and `tests/e2e/` pattern.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.

No new abstractions, packages, or architectural patterns introduced. All changes are targeted fixes within existing file boundaries.
