# Tasks: Gap Remediation — Security, Correctness & Data Integrity

**Input**: Design documents from `/specs/003-gap-remediation/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included per constitution requirement (E2E + Integration First). Targeted unit tests for scoring (pure functions) and parser validation per constitution guidance.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Verify clean baseline before making changes

- [x] T001 Verify clean baseline: run `pnpm build && pnpm test && pnpm test:e2e` and confirm 147/147 integration + 79/79 E2E tests pass

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema changes that block user story implementation

**CRITICAL**: US4 (Proposal Apply) requires the `source_hash` column. US3/US5 can proceed without these, but applying them first ensures all stories start from a consistent schema.

- [x] T002 Update `request_events` table schema to make `request_text` nullable (remove `NOT NULL`) in packages/daemon/src/store/db.ts
- [x] T003 Add `source_hash TEXT` column to `memory_diffs` table in packages/daemon/src/store/db.ts
- [x] T004 Fix `insertToolEvent` to pass `null` for `request_text` and `context_pack`, and only populate tool-specific columns correctly in packages/daemon/src/store/events.ts (lines 81-99)
- [x] T005 Verify baseline tests still pass after schema changes: run `pnpm build && pnpm test && pnpm test:e2e`

**Checkpoint**: Schema updated — user story implementation can now begin

---

## Phase 3: User Story 1 — Safe Drift Detection (Priority: P1)

**Goal**: Eliminate command injection in drift detection and prevent path traversal in the drift API endpoint.

**Independent Test**: Run drift detection against .ctx files with shell metacharacters in `verified_at` and verify no command execution. Request drift for paths outside repo root and verify 400 rejection.

### Implementation

- [x] T006 [P] [US1] Replace `execSync` with `execFileSync` + args array for `checkEntryDrift()` git log call at line 114 in packages/core/src/differ/drift.ts
- [x] T007 [P] [US1] Replace `execSync` with `execFileSync` + args array for `checkVerifiedAt()` git cat-file call at line 156 in packages/core/src/differ/drift.ts
- [x] T008 [P] [US1] Replace `execSync` with `execFileSync` + args array for `getCurrentCommit()` git rev-parse call at line 174 in packages/core/src/differ/drift.ts
- [x] T009 [P] [US1] Replace `execSync` with `execFileSync` + args array for `detectRename()` git log call at line 186 in packages/core/src/differ/drift.ts
- [x] T010 [P] [US1] Replace `execSync` with `execFileSync` for `findAllCtxFiles()` find command at line 198 in packages/core/src/differ/drift.ts (use Node.js `readdirSync`/glob instead of shell `find`)
- [x] T011 [US1] Add `verified_at` format validation: accept `/^[a-f0-9]{4,40}$/` (git hash), ISO 8601 date, or empty string; reject all others with error in packages/core/src/differ/drift.ts
- [x] T012 [US1] Add path traversal validation to drift API route: after `resolve(repoRoot, ctxPathParam)`, verify resolved path starts with `resolve(repoRoot) + sep`; return 400 if outside root in packages/daemon/src/routes/drift.ts (line 21)
- [x] T013 [US1] Write integration test for command injection prevention: test drift with `verified_at` values containing `;`, `|`, `` ` ``, `$()`, `'`, `"`; also test with a valid-format git hash that does not exist in the repo and verify graceful error handling in tests/integration/drift-security.test.ts
- [x] T014 [US1] Write integration test for path traversal: test drift API with `ctx_path=../../etc/passwd` and verify 400 response in tests/integration/drift-security.test.ts

**Checkpoint**: All subprocess calls use array-based arguments. Path traversal returns 400. SC-001 and SC-002 verified.

---

## Phase 4: User Story 2 — Accurate Context Scoring (Priority: P1)

**Goal**: Fix locality scoring to differentiate ancestors from siblings, replace binary recency with time-decay, cap tag inflation, and unify staleness definitions.

**Independent Test**: Create .ctx files at different directory depths (parent vs sibling) and verify different locality scores. Create entries with recent vs old `verified_at` and verify score differences.

### Implementation

- [x] T015 [P] [US2] Fix locality scoring no-op ternary: change line 33 from `depth : depth` to `upCount > 0 ? depth - Math.floor(upCount * 0.5) : depth` in packages/core/src/scorer/locality.ts
- [x] T016 [P] [US2] Implement exponential time-decay recency scoring: replace binary 0.3/0.5/0.9 with `floor + (1.0 - floor) * exp(-λ * days)` formula (floor=0.3, halfLife=30 days) in packages/core/src/scorer/recency.ts
- [x] T017 [US2] Add `verified_at` date parsing to `scoreRecency()`: parse git hashes via `execFileSync('git', ['show', '-s', '--format=%ci', hash])` with result caching, parse ISO dates directly, return floor for empty/unrecognized in packages/core/src/scorer/recency.ts
- [x] T018 [US2] Update `scoreRecency()` signature from `(verifiedAt, isStale)` to `(verifiedAt, repoRoot?)` and have it call `isEntryStale()` internally for consistent staleness in packages/core/src/scorer/recency.ts
- [x] T019 [US2] Update all callers of `scoreRecency()` to use new signature (remove `isStale` parameter) in packages/core/src/scorer/scorer.ts
- [x] T020 [P] [US2] Cap tag scoring partial match inflation: after a tag gets an exact match (+1), skip partial match check for that tag; limit total partial matches per tag to 0.5 in packages/core/src/scorer/tags.ts
- [x] T021 [US2] Update existing scoring assertions in tests/integration/context-pack.test.ts to account for new score values
- [x] T022 [US2] Write integration test for locality: ancestor .ctx scores higher than sibling at same depth in tests/integration/scoring.test.ts
- [x] T023 [US2] Write integration test for recency: entries at 1, 30, 180 days produce 3 distinct scores in tests/integration/scoring.test.ts
- [x] T024 [US2] Write integration test for tag cap: tag "auth" with keywords ["authorization","authenticate","authentication"] scores reasonably (no inflation) in tests/integration/scoring.test.ts

**Checkpoint**: Locality differentiates ancestors from siblings. Recency produces continuous decay. Tag inflation capped. SC-003 and SC-004 verified.

---

## Phase 5: User Story 3 — Automatic Data Retention (Priority: P2)

**Goal**: Fix the broken retention scheduler and integrate it into daemon startup.

**Independent Test**: Start daemon with old sessions in DB, wait for scheduler interval, verify old records are purged.

### Implementation

- [x] T025 [P] [US3] Fix retention query: change `created_at < ?` to use only `started_at < ?` in the session cleanup query at line 43 in packages/daemon/src/scheduler/retention.ts
- [x] T026 [P] [US3] Change `console.log` to `console.error` at lines 104 and 115 in packages/daemon/src/scheduler/retention.ts (also addresses FR-019: daemon convention compliance)
- [x] T027 [US3] Call `startRetentionScheduler(db)` in daemon startup after database is opened in packages/daemon/src/index.ts (add import and call after `openDatabase()`)
- [x] T028 [US3] Store the cleanup function returned by `startRetentionScheduler()` and call it during graceful shutdown in packages/daemon/src/index.ts
- [x] T029 [US3] Write integration test: create sessions with `started_at` older than 30 days, run `runRetentionCleanup(db)`, verify sessions and associated events are purged in tests/integration/retention.test.ts
- [x] T030 [US3] Write integration test: verify retention runs on empty database without errors in tests/integration/retention.test.ts

**Checkpoint**: Retention scheduler runs on daemon startup. Old data is purged. SC-005 verified.

---

## Phase 6: User Story 4 — Complete Proposal Workflow (Priority: P2)

**Goal**: Implement full-file replacement in proposal apply with conflict detection via content hash.

**Independent Test**: Create a proposal, call apply endpoint, verify .ctx file on disk was modified.

**Depends on**: Phase 2 (source_hash column in memory_diffs)

### Implementation

- [x] T031 [US4] Update proposal creation route to compute SHA-256 of the target .ctx file and store it as `source_hash` in the `memory_diffs` record in packages/daemon/src/routes/proposals.ts
- [x] T032 [US4] Implement full proposal apply: read current .ctx file, compute SHA-256, compare with stored `source_hash`, write `diff_content` to file via atomic temp-file-then-rename in packages/daemon/src/routes/proposals.ts (lines 116-167)
- [x] T033 [US4] Add conflict detection: if current file hash differs from `source_hash`, return 409 Conflict with `ctx_path`, `expected_hash`, and `actual_hash` in packages/daemon/src/routes/proposals.ts
- [x] T034 [US4] Add file-not-found handling: if target .ctx file was deleted, return 404 with `ctx_path` in packages/daemon/src/routes/proposals.ts
- [x] T035 [US4] Add path validation to proposal apply: verify `ctx_path` resolves within repo root before file access in packages/daemon/src/routes/proposals.ts
- [x] T036 [US4] Write integration test: create proposal, approve, apply, verify .ctx file content matches proposed content in tests/integration/proposals.test.ts
- [x] T037 [US4] Write integration test: modify .ctx file after proposal creation, attempt apply, verify 409 Conflict returned; also test sequential double-apply (create two proposals for same file, apply first, attempt second, verify conflict) in tests/integration/proposals.test.ts
- [x] T038 [US4] Write E2E test: full workflow — start daemon, create session, propose update, approve, apply, read file to confirm changes in tests/e2e/proposal-apply.test.ts

**Checkpoint**: Proposal apply writes to disk. Conflicts detected. SC-006 verified.

---

## Phase 7: User Story 5 — Hardened API Inputs (Priority: P2)

**Goal**: Add body size limits to daemon API and validate CLI budget inputs.

**Independent Test**: Send oversized JSON body to daemon, verify 413. Run `ctxkit inject --budget abc`, verify error.

### Implementation

- [x] T039 [P] [US5] Add Hono `bodyLimit({ maxSize: 10 * 1024 * 1024 })` middleware to `createApp()` in packages/daemon/src/server.ts (before route mounting)
- [x] T040 [P] [US5] Add budget validation to `inject` command: after `parseInt()`, check `isNaN(budget) || budget <= 0` and exit with error message in packages/cli/src/commands/inject.ts (line 16)
- [x] T041 [P] [US5] Add budget validation to `run` command: same validation as inject in packages/cli/src/commands/run.ts (line 19)
- [x] T042 [US5] Write integration test: POST request with >10MB body to daemon endpoint, verify 413 response in tests/integration/api-hardening.test.ts
- [x] T043 [US5] Write integration test: `ctxkit inject --budget abc` exits with error message in tests/integration/api-hardening.test.ts

**Checkpoint**: Oversized requests rejected with 413. Invalid budgets rejected. SC-007 and SC-008 verified.

---

## Phase 8: User Story 6 — Reliable Diff, Secret Detection & Parser Safety (Priority: P3)

**Goal**: Fix secret detector to find all matches per line. Remove console.warn from budget module. Add type guards to parser.

**Independent Test**: Run secret detection on line with multiple secrets, verify all found. Build pack with budget stretch, verify no console output.

### Implementation

- [x] T044 [P] [US6] Fix `detectSecrets()` to use `matchAll()` with global flag or loop `exec()` to find ALL secret matches per line per pattern in packages/core/src/redact/secrets.ts (line 37)
- [x] T045 [P] [US6] Add `warnings: string[]` field to `ContextPack` type definition; initialize as empty array in pack construction in packages/core/src/packer/budget.ts
- [x] T046 [US6] Replace `console.warn` calls in budget stretch logic with `warnings.push()` using the warnings array from T045 in packages/core/src/packer/budget.ts (lines 41-43)
- [x] T047 [US6] Add runtime type guards to parser: before each `as Record<string, unknown>` cast, add `typeof` check; on failure, push warning to `warnings` array and skip field in packages/core/src/ctx/parser.ts (lines 50, 62, 78, 89, 103, 113, 134)
- [x] T048 [US6] Change parser return type from `CtxFile` to `{ ctx: CtxFile, warnings: string[] }` in packages/core/src/ctx/parser.ts
- [x] T049 [US6] Update all callers of `parseCtxFile()` to destructure `{ ctx, warnings }` from the result across packages/core/src/ and packages/daemon/src/
- [x] T050 [US6] Write integration test: line with two API keys of same pattern, verify both detected in tests/integration/secrets.test.ts
- [x] T051 [US6] Write integration test: pack build with budget stretch produces no console output; warnings are in result object in tests/integration/context-pack.test.ts

**Checkpoint**: All secret matches found. No console side effects from library. Parser returns warnings. SC-010 verified.

---

## Phase 9: User Story 7 — Correct Ignore Patterns (Priority: P3)

**Goal**: Fix ignore pattern matching to respect directory boundaries.

**Independent Test**: Set `never_read: ["src/"]`, verify `src_backup/.ctx` is NOT ignored while `src/api/.ctx` IS ignored.

### Implementation

- [x] T052 [P] [US7] Fix wildcard pattern matching in merger: for pattern ending in `*`, strip `*` and check `relPath.startsWith(pattern_without_star)` ensuring the prefix includes the trailing `/` in packages/core/src/ctx/merger.ts (lines 44-52)
- [x] T053 [P] [US7] Apply same directory boundary fix to ignore pattern matching in packer in packages/core/src/packer/packer.ts (lines 53-66)
- [x] T054 [US7] Write integration test: `never_read: ["src/"]` excludes `src/api/.ctx` but not `src_backup/.ctx` in tests/integration/context-pack.test.ts

**Checkpoint**: Ignore patterns respect directory boundaries. No false positives on prefix matches.

---

## Phase 10: User Story 8 — Portable Home Directory Resolution (Priority: P3)

**Goal**: Replace `process.env.HOME || '~'` with `os.homedir()` in all locations.

**Independent Test**: Mock empty HOME/USERPROFILE environment, verify database path resolves via `os.homedir()`.

### Implementation

- [x] T055 [P] [US8] Replace `process.env.HOME || process.env.USERPROFILE || '~'` with `os.homedir()` in `defaultDbPath()` in packages/daemon/src/store/db.ts (line 88)
- [x] T056 [P] [US8] Replace `process.env.HOME || process.env.USERPROFILE || '~'` with `os.homedir()` in global config path resolution in packages/core/src/config/loader.ts (lines 61-62)
- [x] T057 [P] [US8] Replace `process.env.HOME || '~'` with `os.homedir()` in PID_FILE and ctxlDir constants in packages/cli/src/commands/daemon.ts (lines 6, 29)
- [x] T058 [US8] Write integration test: temporarily clear HOME and USERPROFILE env vars, call `defaultDbPath()` and config path resolution, verify paths use `os.homedir()` and do not contain literal `~` in tests/integration/homedir.test.ts

**Checkpoint**: All home directory resolution uses `os.homedir()`. No literal `~` fallback.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and regression testing

- [x] T059 Run full build: `pnpm build` — all 6 packages must compile
- [x] T060 Run full integration test suite: `pnpm test` — all existing + new tests must pass (SC-009)
- [x] T061 Run full E2E test suite: `pnpm test:e2e` — all existing + new tests must pass (SC-009)
- [x] T062 Run lint: `pnpm lint` — zero violations
- [x] T063 Verify no `console.warn` or `console.log` in `@ctxl/core` package (grep for occurrences, should be zero)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — schema changes must be applied before US4
- **US1 (Phase 3)**: Depends on Phase 1 only — can start in parallel with Phase 2
- **US2 (Phase 4)**: Depends on Phase 1 only — can start in parallel with Phase 2 and US1
- **US3 (Phase 5)**: Depends on Phase 1 only — can start in parallel with US1/US2
- **US4 (Phase 6)**: Depends on Phase 2 (needs `source_hash` column) — BLOCKS until foundational complete
- **US5 (Phase 7)**: Depends on Phase 1 only — can start in parallel with all other stories
- **US6 (Phase 8)**: Depends on Phase 1 only — can start in parallel (different files)
- **US7 (Phase 9)**: Depends on Phase 1 only — can start in parallel (different files)
- **US8 (Phase 10)**: Depends on Phase 1 only — can start in parallel (different files)
- **Polish (Phase 11)**: Depends on all user stories complete

### User Story Dependencies

```
Phase 1 (Setup)
  │
  ├── Phase 2 (Foundational: schema) ──→ Phase 6 (US4: Proposal Apply)
  │
  ├── Phase 3 (US1: Drift Security) ──→ ─┐
  ├── Phase 4 (US2: Scoring) ──────────→ ─┤
  ├── Phase 5 (US3: Retention) ────────→ ─┤
  ├── Phase 7 (US5: API Hardening) ────→ ─┤
  ├── Phase 8 (US6: Diff/Secrets/Parser) → ─┤ Phase 11 (Polish)
  ├── Phase 9 (US7: Ignore Patterns) ──→ ─┤
  └── Phase 10 (US8: Home Dir) ────────→ ─┘
```

### Parallel Opportunities

Within each user story, tasks marked `[P]` can run in parallel:

- **US1**: T006-T010 all parallel (each modifies a different `execSync` call site)
- **US2**: T015, T016, T020 parallel (locality.ts, recency.ts, tags.ts are different files)
- **US3**: T025, T026 parallel (different line changes in same file, non-overlapping)
- **US5**: T039, T040, T041 all parallel (server.ts, inject.ts, run.ts are different files)
- **US6**: T044, T045 parallel (secrets.ts, budget.ts are different files)
- **US7**: T052, T053 parallel (merger.ts, packer.ts are different files)
- **US8**: T055, T056, T057 all parallel (db.ts, loader.ts, daemon.ts are different files)

**Cross-story parallelism**: US1, US2, US3, US5, US6, US7, US8 can ALL run in parallel since they modify different files. Only US4 must wait for Phase 2 (schema).

---

## Parallel Example: Maximum Parallelism

```bash
# After Phase 1 (Setup) completes, launch ALL of these in parallel:

# Stream 1: Foundational schema changes (blocks US4 only)
Task: T002 + T003 + T004 + T005

# Stream 2: US1 - Safe Drift Detection
Task: T006, T007, T008, T009, T010 (all parallel)
Then: T011, T012 (sequential)
Then: T013, T014 (parallel tests)

# Stream 3: US2 - Accurate Scoring
Task: T015, T016, T020 (parallel - different scorer files)
Then: T017, T018, T019 (sequential - recency + callers)
Then: T021, T022, T023, T024 (tests)

# Stream 4: US3 - Data Retention
Task: T025, T026 (parallel)
Then: T027, T028 (sequential)
Then: T029, T030 (parallel tests)

# Stream 5: US5 + US7 + US8 (quick fixes, parallel across all)
Task: T039, T040, T041, T052, T053, T055, T056, T057 (all parallel)
Then: T042, T043, T054, T058 (tests)

# Stream 6: US6 - Diff/Secrets (after initial parallel burst)
Task: T044, T045 (parallel)
Then: T046, T047, T048, T049 (sequential - type changes + caller updates)
Then: T050, T051 (tests)

# After Stream 1 completes: US4 - Proposal Apply
Task: T031, T032, T033, T034, T035 (sequential)
Then: T036, T037, T038 (tests)
```

---

## Implementation Strategy

### MVP First (US1 + US2: Security + Scoring)

1. Complete Phase 1: Setup
2. Complete Phase 3: US1 — Safe Drift Detection
3. Complete Phase 4: US2 — Accurate Context Scoring
4. **STOP and VALIDATE**: Run full test suite, verify SC-001 through SC-004
5. These two P1 stories deliver the highest-impact fixes (critical security + scoring correctness)

### Incremental Delivery

1. Setup + US1 + US2 → Security + scoring fixed (MVP)
2. Foundational + US3 + US4 → Data retention + proposal workflow complete
3. US5 → API hardening
4. US6 + US7 + US8 → Polish (diff, secrets, patterns, portability)
5. Each increment adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- US6 (parser type change) has the widest blast radius — updating all callers of `parseCtxFile()` across the codebase
- US2 (recency signature change) also requires caller updates in `scorer.ts`
- Commit after each completed user story phase
- Run `pnpm build && pnpm test && pnpm test:e2e` after each story checkpoint
