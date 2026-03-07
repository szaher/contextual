# Feature Specification: Gap Remediation — Security, Correctness & Data Integrity

**Feature Branch**: `003-gap-remediation`
**Created**: 2026-03-04
**Status**: Draft
**Input**: User description: "Remediate all findings from the ctxl gap analysis — fix critical/high bugs, close security gaps, correct scoring logic, complete the proposal workflow, and harden API inputs."

## Clarifications

### Session 2026-03-04

- Q: Should proposal apply use full-file replacement, patch application, or a hybrid approach? → A: Full-file replacement — store the proposed new .ctx content; on apply, replace the file entirely with the proposed version.
- Q: Should ancestor .ctx files score higher or lower than sibling .ctx files in locality scoring? → A: Ancestors score higher — a .ctx in a parent directory is more relevant than one in a sibling directory at the same depth.
- Q: When the .ctx parser encounters wrong types in nested YAML objects, should it reject the file, skip with warnings, or skip silently? → A: Lenient with warnings — skip the malformed entry/field, continue parsing the rest, return warnings in the parse result.
- Q: How should tool event storage be fixed — nullable columns, separate table, or sentinel values? → A: Make columns nullable — change `request_text` and `context_pack` to allow NULL; insert NULL for tool events.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Safe Drift Detection (Priority: P1)

A developer runs `ctxkit drift` on a repository that contains .ctx files contributed by multiple team members. Some .ctx files have `verified_at` values that were manually entered or corrupted. The system must safely execute git commands without interpreting `verified_at` as shell instructions, and must restrict file access to within the repository root.

**Why this priority**: Command injection is the only Critical-severity finding in the entire codebase. A malicious or corrupted `.ctx` file could execute arbitrary commands on the developer's machine during routine drift detection.

**Independent Test**: Can be fully tested by running drift detection against .ctx files with shell metacharacters in `verified_at` and verifying no command execution occurs. Also tested by requesting drift for paths outside the repo root and verifying rejection.

**Acceptance Scenarios**:

1. **Given** a .ctx file with `verified_at: "abc'; echo PWNED; git log '"`, **When** `ctxkit drift` is run, **Then** the system does not execute `echo PWNED` and either treats the value as a literal git ref or reports an invalid ref error.
2. **Given** a .ctx file with `verified_at` containing `$(rm -rf /)`, **When** drift detection runs, **Then** no subshell is spawned and the system safely reports an error or skips the entry.
3. **Given** a drift API request with `ctx_path=../../etc/passwd`, **When** the daemon processes the request, **Then** a 400 error is returned indicating the path is outside the repository root.
4. **Given** a drift API request with `ctx_path=../../../home/user/.ssh/id_rsa`, **When** the daemon processes the request, **Then** the resolved path is validated and the request is rejected before any file access occurs.

---

### User Story 2 — Accurate Context Scoring (Priority: P1)

A developer uses `ctxkit inject` to build a context pack for their current working directory. The system should prioritize .ctx files that are closer ancestors over distant siblings, and should score recently-verified entries higher than entries verified long ago.

**Why this priority**: Scoring directly affects the quality of every context pack produced by the system. The locality no-op bug (BUG-003) means ancestor vs. sibling .ctx files are indistinguishable, and the binary recency scoring (BUG-009) treats entries verified 2 years ago identically to those verified today.

**Independent Test**: Can be tested by creating .ctx files at different directory depths (parent vs cousin) and verifying different locality scores. Also tested by creating entries with recent vs old `verified_at` dates and verifying score differences.

**Acceptance Scenarios**:

1. **Given** a .ctx file in a parent directory and a .ctx file at the same path depth in a sibling directory, **When** locality scoring runs from the working directory, **Then** the parent .ctx file receives a higher locality score than the sibling.
2. **Given** an entry with `verified_at` from 7 days ago and another from 180 days ago, **When** recency scoring runs, **Then** the recent entry scores higher than the old entry (not both 0.9).
3. **Given** an entry with tag "auth" and keywords ["authorization", "authenticate", "authentication"], **When** tag scoring runs, **Then** the tag score reflects a single match rather than accumulating partial matches beyond a reasonable cap.
4. **Given** an entry where `isEntryStale()` returns true, **When** recency scoring runs, **Then** the recency score is consistently 0.3 (stale) regardless of whether `verified_at` is empty or contains an old date.

---

### User Story 3 — Automatic Data Retention (Priority: P2)

A developer has been using ctxl for months. The SQLite database has grown to contain thousands of old sessions and audit entries. The daemon should automatically clean up stale data on a schedule so the database doesn't grow unbounded.

**Why this priority**: Without retention cleanup, the database grows indefinitely, eventually causing performance degradation. The retention function exists but is both broken (references a non-existent column) and disconnected (never called from daemon startup).

**Independent Test**: Can be tested by starting the daemon with a database containing sessions older than the retention threshold, waiting for the scheduler interval, and verifying old records are purged.

**Acceptance Scenarios**:

1. **Given** sessions older than 30 days in the database, **When** the daemon starts and the retention scheduler fires, **Then** those sessions and their associated events are deleted.
2. **Given** audit log entries older than 90 days, **When** the retention scheduler fires, **Then** those audit entries are deleted.
3. **Given** a fresh daemon startup, **When** the daemon initializes, **Then** the retention scheduler is started and runs at the configured interval (default: 24 hours).
4. **Given** the retention query executes, **When** it references the sessions table, **Then** it uses the `started_at` column (not the non-existent `created_at` column) and completes without SQL errors.

---

### User Story 4 — Complete Proposal Workflow (Priority: P2)

A developer reviews a proposed .ctx update in the dashboard and clicks "Apply". The system should actually write the changes to the .ctx file on disk, not just record an audit entry.

**Why this priority**: Proposal apply is the culmination of the core ctxl workflow (detect drift → propose update → review → apply). Currently, the apply endpoint is a stub — users think their approval takes effect but the .ctx file remains unchanged.

**Independent Test**: Can be tested by creating a proposal, calling the apply endpoint, and verifying the .ctx file on disk was modified to match the proposal diff.

**Acceptance Scenarios**:

1. **Given** an approved proposal containing the full proposed .ctx content, **When** the apply endpoint is called, **Then** the .ctx file on disk is replaced entirely with the proposed content.
2. **Given** an approved proposal, **When** the apply succeeds, **Then** an audit entry is created recording the change.
3. **Given** a proposal targeting a .ctx file that has been modified since the proposal was created, **When** apply is attempted, **Then** a conflict error is returned and the file is not modified.
4. **Given** a proposal apply, **When** the file write fails (e.g., permission denied), **Then** the proposal status remains unchanged and an error is returned.

---

### User Story 5 — Hardened API Inputs (Priority: P2)

A developer runs the ctxl daemon on localhost. The daemon should enforce request body size limits and validate CLI inputs to prevent memory exhaustion, data corruption, or unexpected behavior from malformed inputs.

**Why this priority**: Without body size limits, a single oversized request could exhaust daemon memory. Without budget validation, `NaN` values propagate through scoring and produce garbage context packs.

**Independent Test**: Can be tested by sending an oversized JSON body to the daemon and verifying a 413 response, and by running `ctxkit inject --budget abc` and verifying a clear error message.

**Acceptance Scenarios**:

1. **Given** a POST request with a body larger than 10MB, **When** sent to any daemon endpoint, **Then** a 413 Payload Too Large response is returned before the body is fully read.
2. **Given** `ctxkit inject --budget abc`, **When** the CLI parses the budget, **Then** an error is displayed: "Invalid budget: must be a positive number" and the command exits with non-zero status.
3. **Given** `ctxkit run --budget -5`, **When** the CLI parses the budget, **Then** an error is displayed about an invalid budget and the command exits with non-zero status.

---

### User Story 6 — Reliable Diff and Secret Detection (Priority: P3)

A developer relies on ctxl to detect differences between .ctx versions and to redact secrets before including content in context packs. The diff engine must produce correct output, and the secret detector must find all occurrences.

**Why this priority**: Incorrect diffs erode trust in the proposal review workflow. Missed secrets in detection counts (though redaction itself works) provide incomplete security reporting.

**Independent Test**: Can be tested by diffing files with repeated/reordered lines and verifying correct output. Also tested by running secret detection on lines with multiple secrets and verifying all are found.

**Acceptance Scenarios**:

1. **Given** two .ctx versions with lines that appear in both files at different positions, **When** a diff is generated, **Then** the unified diff correctly shows all additions, removals, and unchanged lines without skipping content.
2. **Given** a line containing two API keys of the same pattern (e.g., `KEY1=sk-abc KEY2=sk-def`), **When** secret detection runs, **Then** both secrets are detected and reported (not just the first).
3. **Given** a context pack build that triggers budget stretching, **When** the pack is assembled, **Then** no `console.warn` output is emitted; warnings are returned in the pack result object.

---

### User Story 7 — Correct Ignore Patterns (Priority: P3)

A developer configures `never_read: ["src/"]` in their `.ctxl/config.yaml` to exclude the `src/` directory from context packs. The system must not accidentally exclude directories that merely share a prefix (e.g., `src_backup/`).

**Why this priority**: Incorrect ignore matching causes unexpected context pack content — either including files that should be excluded or excluding files that should be included.

**Independent Test**: Can be tested by setting `never_read: ["src/"]` and verifying that `src_backup/.ctx` is NOT ignored while `src/api/.ctx` IS ignored.

**Acceptance Scenarios**:

1. **Given** `never_read: ["src/"]` in config, **When** building a context pack in a repo with both `src/api/.ctx` and `src_backup/.ctx`, **Then** only `src/api/.ctx` is excluded; `src_backup/.ctx` is included.
2. **Given** `never_read: ["test/*"]` in config, **When** building a context pack, **Then** `test/unit/.ctx` is excluded but `testing/.ctx` is not.

---

### User Story 8 — Portable Home Directory Resolution (Priority: P3)

A developer uses ctxl on a system where `HOME` and `USERPROFILE` environment variables are not set (e.g., certain containerized or CI environments). The system should still resolve the database and config paths to the correct home directory.

**Why this priority**: While uncommon, the fallback to a literal `~` string creates a non-functional path that silently fails rather than using Node.js's built-in `os.homedir()` function.

**Independent Test**: Can be tested by unsetting HOME/USERPROFILE and verifying the database path uses `os.homedir()`.

**Acceptance Scenarios**:

1. **Given** `HOME` and `USERPROFILE` are unset, **When** the system resolves the database path, **Then** `os.homedir()` is used instead of a literal `~` string.
2. **Given** a containerized environment without standard home variables, **When** ctxl starts, **Then** the config and database paths resolve to valid filesystem locations.

---

### Edge Cases

- What happens when `verified_at` is a valid git commit hash that doesn't exist in the current repo? → Drift detection should report "unknown ref" rather than crashing.
- What happens when the retention scheduler runs on an empty database? → Should complete successfully with zero records purged.
- What happens when a proposal references a .ctx file that has been deleted? → Apply should return a clear error, not crash.
- What happens when two proposals target the same .ctx file and both are applied? → The second apply should detect the conflict (file changed since proposal creation).
- What happens when the daemon receives a request with `Content-Type: text/plain` instead of `application/json`? → Deferred: Hono's built-in JSON parsing already returns 400 for non-JSON bodies. No additional handling needed for this remediation scope.
- What happens when `ctxkit inject --budget 0` is used? → Should return an error or produce an empty pack with a warning.
- What happens when a .ctx file has multiple malformed fields? → Parser should report all type violations as warnings and return all valid entries, not stop at the first error.

## Requirements *(mandatory)*

### Functional Requirements

#### Security

- **FR-001**: System MUST NOT interpolate user-controlled values into shell command strings. All git subprocess calls MUST use array-based argument passing (e.g., `execFileSync` with args array).
- **FR-002**: System MUST validate that `verified_at` values match a safe pattern (commit hash, ISO date, or empty) before using them in git operations.
- **FR-003**: System MUST validate that all resolved file paths in API endpoints remain within the declared repository root before any file access occurs.
- **FR-004**: System MUST enforce a maximum request body size (default 10MB) on all POST/PATCH endpoints via middleware.

#### Data Integrity

- **FR-005**: The retention scheduler MUST reference only columns that exist in the database schema (`started_at` for sessions, not `created_at`).
- **FR-006**: The retention scheduler MUST be started automatically when the daemon starts, running cleanup at regular intervals (default: every 24 hours).
- **FR-007**: The `request_text` and `context_pack` columns MUST be made nullable so tool events can store NULL in those fields instead of overloading them with tool event data (`tool_name`, `tool_input`).
- **FR-008**: Tool event insertion MUST set request-specific columns (`request_text`, `context_pack`, `token_count`, `budget`) to NULL, and request event insertion MUST set tool-specific columns (`tool_name`, `tool_input`, `tool_response`, `exit_code`, `duration_ms`) to NULL, ensuring no cross-contamination in queries.

#### Scoring Correctness

- **FR-009**: Locality scoring MUST score ancestor directories (going "up" via `..`) higher than sibling directories at the same absolute depth. A .ctx file in a parent directory provides broader hierarchical context and MUST receive a higher locality score than a .ctx file in a sibling directory at equal depth.
- **FR-010**: Recency scoring MUST use a time-decay function that produces higher scores for more recently verified entries, with continuous decay rather than binary present/absent.
- **FR-011**: Tag scoring MUST cap the accumulated partial-match contribution per tag to 0.5 to prevent inflation beyond the intended range before the final `Math.min(1.0)` clamp. Once a tag receives an exact match (+1.0), partial matches for that tag MUST be skipped.
- **FR-012**: The `isEntryStale()` function and `scoreRecency()` function MUST use consistent staleness definitions so callers get the same answer from both.

#### Proposal Workflow

- **FR-013**: The proposal apply endpoint MUST replace the target .ctx file on disk with the full proposed content stored in the proposal record (full-file replacement, not patch application).
- **FR-014**: Proposal apply MUST detect conflicts by comparing the current file content hash against the hash recorded at proposal creation time, and refuse to apply if they differ.
- **FR-015**: Proposal apply MUST use atomic file writes (write to temp file, then rename) to prevent partial writes on failure.

#### Input Validation

- **FR-016**: CLI commands `inject` and `run` MUST validate that the `--budget` flag is a positive integer before passing it to the core library.
- **FR-017**: The `.ctx` parser MUST validate types of nested YAML objects (e.g., `scope`, `key_files`) using runtime type guards rather than unsafe `as` casts. On type mismatch, the parser MUST skip the malformed entry/field, continue parsing remaining content, and return warnings in the parse result describing each skipped field.

#### Convention Compliance

- **FR-018**: Library code in `@ctxl/core` MUST NOT emit `console.warn` or `console.log` as side effects. Warnings MUST be returned in result objects.
- **FR-019**: Daemon modules MUST use `console.error` (not `console.log`) for logging, to avoid polluting stdout in IPC scenarios.
- **FR-020**: Home directory resolution MUST use `os.homedir()` from Node.js standard library as the primary mechanism, not `process.env.HOME || '~'`.

#### Pattern Matching

- **FR-021**: Ignore patterns MUST respect directory boundaries. Pattern `src/` MUST NOT match paths starting with `src_backup/`.

### Key Entities

- **Context Entry**: A scored piece of project knowledge from a .ctx file. Has attributes: content, tags, verified_at, owner, locked status, section type. Scored by locality, recency, tags, and section bonus.
- **Proposal**: A suggested modification to a .ctx file, containing a unified diff, source provenance, target file path, and approval status (pending/approved/rejected/applied).
- **Session**: A recorded usage session with start/end times, repository path, associated events, and generated proposals.
- **Audit Log Entry**: An immutable record of a system action (proposal creation, approval, rejection, application, retention cleanup) with timestamp and actor.

### Assumptions

- The daemon always binds to localhost (127.0.0.1). Network-exposed daemon scenarios are out of scope for this remediation.
- The database schema can be altered using `ALTER TABLE` for nullable column changes, or a migration framework will be introduced alongside these fixes.
- `verified_at` values in existing .ctx files are either valid git commit hashes, ISO 8601 dates, or empty strings. Other formats are treated as stale.
- The time-decay recency function will use a configurable half-life (default: 30 days) where score decays from 1.0 toward a floor of 0.3.

### Scope Boundaries

**In scope:**
- All Phase 1 (NOW) items from remediation roadmap: BUG-001 through BUG-017, GAP-001, GAP-003
- GAP-002 (proposal apply) from Phase 2 as it completes the core workflow
- Scoring improvements: BUG-003, BUG-009, BUG-011, BUG-014

**Out of scope:**
- API authentication (FEAT-002) — separate feature
- Database migration framework (GAP-004) — separate feature, though schema changes here should be migration-compatible
- Auto-approve (GAP-005) — depends on GAP-002
- Dashboard improvements (GAP-006, GAP-007, GAP-008, GAP-014) — separate feature
- New CLI commands (GAP-012, GAP-015) — separate feature
- All Phase 3 (LATER) items

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero shell injection vectors remain — all subprocess calls use array-based argument passing, verified by automated test with metacharacter inputs.
- **SC-002**: All path-based API endpoints validate that resolved paths remain within the declared root, verified by tests with `../` traversal attempts returning 400 errors.
- **SC-003**: Locality scoring produces different values for ancestor vs sibling .ctx files at the same depth, verified by unit tests comparing scores.
- **SC-004**: Recency scoring produces at least 3 distinct score values for entries verified at different time intervals (e.g., 1 day, 30 days, 180 days ago), verified by unit tests.
- **SC-005**: The retention scheduler runs automatically on daemon startup and successfully purges sessions older than the configured threshold, verified by integration test.
- **SC-006**: Proposal apply modifies the target .ctx file on disk, verified by E2E test that creates a proposal, applies it, and reads the file to confirm changes.
- **SC-007**: All daemon POST/PATCH endpoints reject request bodies exceeding the configured size limit (default 10MB) with a 413 response, verified by integration test.
- **SC-008**: CLI commands reject non-numeric and non-positive budget values with a clear error message, verified by CLI integration test.
- **SC-009**: All existing tests (147 integration + 79 E2E) continue to pass after remediation changes, ensuring no regressions.
- **SC-010**: No `console.warn` or `console.log` output is emitted from `@ctxl/core` library functions during normal operation, verified by capturing stdout/stderr in tests.
