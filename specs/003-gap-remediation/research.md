# Research: Gap Remediation

**Branch**: `003-gap-remediation` | **Date**: 2026-03-04

---

## R-001: Safe subprocess execution pattern for git commands

**Decision**: Use `execFileSync` with argument arrays instead of `execSync` with template strings.

**Rationale**: `execFileSync('git', ['log', '--oneline', ref + '..HEAD', '--', path])` bypasses shell interpretation entirely. Arguments are passed directly to the process, making shell metacharacter injection impossible regardless of input content. This is the Node.js recommended pattern for subprocess calls with untrusted inputs.

**Alternatives considered**:
- Shell escaping (rejected: fragile, platform-dependent, easy to miss edge cases)
- Input validation only (rejected: defense-in-depth requires eliminating the injection vector, not just filtering inputs)
- `simple-git` library (rejected: unnecessary dependency for this use case; `execFileSync` is stdlib)

**Files affected**: `packages/core/src/differ/drift.ts` — 5 `execSync` calls at lines 114, 156, 174, 186, 198

---

## R-002: Path traversal validation pattern

**Decision**: After `resolve()`, verify the resolved path starts with the expected root using `resolvedPath.startsWith(normalizedRoot)` where `normalizedRoot = resolve(repoRoot) + sep`.

**Rationale**: Simple prefix check after normalization catches `../` traversal, symlink escapes, and URL-encoded paths. No additional dependencies needed.

**Alternatives considered**:
- Chroot/jail (rejected: overkill for localhost daemon)
- Regex validation on input (rejected: doesn't handle edge cases like `./../../`)
- `realpath` + symlink resolution (rejected: `realpath` throws on non-existent paths; `resolve` is sufficient for path containment)

**Files affected**: `packages/daemon/src/routes/drift.ts:21`, `packages/daemon/src/routes/proposals.ts` (apply endpoint)

---

## R-003: Time-decay recency scoring function

**Decision**: Exponential decay with configurable half-life. Formula: `score = floor + (1.0 - floor) * Math.exp(-λ * daysSinceVerification)` where `λ = ln(2) / halfLifeDays`, `floor = 0.3`, `halfLifeDays = 30`.

**Rationale**: Exponential decay is the standard approach for freshness scoring. It produces smooth, continuous values (not binary), with configurable sensitivity. At 30-day half-life: 1 day ago → 0.98, 7 days → 0.89, 30 days → 0.65, 90 days → 0.44, 180 days → 0.33.

**Alternatives considered**:
- Linear decay (rejected: too aggressive for old content; score reaches floor quickly)
- Step function with more buckets (rejected: still produces discrete jumps)
- Logarithmic decay (rejected: too slow decay; old content stays overscored)

**Parsing `verified_at`**: If value matches `/^[a-f0-9]{4,40}$/` (git hash), resolve date via `git show -s --format=%ci <hash>` and cache result. If ISO 8601 date, parse directly. If empty or unrecognized, treat as stale (score = 0.3).

**Files affected**: `packages/core/src/scorer/recency.ts`

---

## R-004: Locality scoring fix — ancestor vs sibling differentiation

**Decision**: Use `upCount` to reduce effective distance for ancestors. Formula: `distance = upCount > 0 ? depth - Math.floor(upCount * 0.5) : depth`. This gives ancestors a distance bonus (lower distance = higher score) compared to siblings at the same `depth`.

**Rationale**: An ancestor `.ctx` at depth 3 (2 up, 1 down) becomes effective distance 2, scoring 0.6 instead of 0.4. A sibling at depth 3 (0 up, 3 down) stays at distance 3, scoring 0.4. This reflects the clarified requirement that ancestors provide more relevant hierarchical context.

**Alternatives considered**:
- `distance = upCount > 0 ? upCount : depth` (rejected: ignores downward segments after going up)
- Separate weights for up vs down (rejected: overcomplicates a linear decay model)
- `distance = depth - upCount` (rejected: too aggressive; going up 3 and down 1 would give distance 0)

**Files affected**: `packages/core/src/scorer/locality.ts:33`

---

## R-005: Proposal apply — full-file replacement with conflict detection

**Decision**: Store full proposed content in `diff_content`. On apply: (1) compute SHA-256 hash of current file, (2) compare against hash stored at proposal creation, (3) if match, write proposed content via atomic temp-file-then-rename, (4) if mismatch, return 409 Conflict.

**Rationale**: Full-file replacement is simpler than patch application, avoids needing a diff/patch library, and the content hash provides reliable conflict detection. Atomic writes (write to `.ctx.tmp`, then `rename()`) leverage filesystem guarantees to prevent partial writes.

**Schema impact**: The `memory_diffs` table already has `diff_content TEXT NOT NULL` which will store the full proposed file content. A new column `source_hash TEXT` should be added to store the file hash at proposal creation time (for conflict detection). This is additive (new nullable column via `ALTER TABLE`).

**Alternatives considered**:
- Patch application with `diff` library (rejected per clarification: full-file replacement chosen)
- Timestamp-based conflict detection (rejected: unreliable if file is modified and then reverted)
- Optimistic locking with version counter (rejected: requires schema change to .ctx files themselves)

**Files affected**: `packages/daemon/src/routes/proposals.ts:116-167`, `packages/daemon/src/store/db.ts` (schema), proposal creation routes

---

## R-006: Nullable columns for tool event storage fix

**Decision**: Modify `CREATE TABLE` statement to make `request_text` and `context_pack` nullable (remove `NOT NULL`). Fix `insertToolEvent` to pass `null` for request-specific columns and the actual tool data only in tool-specific columns.

**Rationale**: SQLite supports `ALTER TABLE ADD COLUMN` but not `ALTER COLUMN`. Since the schema uses `CREATE TABLE IF NOT EXISTS`, existing databases retain the old schema. For existing databases: the columns already accept the overloaded data, so the fix is forward-only — new tool events get proper NULLs, old data remains as-is. No data migration needed.

**Caveat**: On existing databases, the `NOT NULL` constraint on `request_text` and `context_pack` remains until the database is recreated. The code should handle this gracefully by falling back to empty string if NULL insertion fails on older schemas.

**Alternatives considered**:
- Separate `tool_events` table (rejected per clarification: nullable columns chosen for simplicity)
- Database migration framework (rejected: out of scope, GAP-004)

**Files affected**: `packages/daemon/src/store/db.ts:18-34`, `packages/daemon/src/store/events.ts:73-102`

---

## R-007: Parser warning return mechanism

**Decision**: Add `warnings: string[]` to the parse result type. Each type guard failure appends a warning string describing the field, expected type, and actual type. Callers can inspect warnings after parsing.

**Rationale**: Consistent with FR-018 (library code must return warnings in result objects, not console output). Same pattern will be used for budget stretch warnings in `ContextPack`.

**Files affected**: `packages/core/src/ctx/parser.ts`, `packages/core/src/packer/budget.ts`

---

## R-008: Ignore pattern directory boundary fix

**Decision**: Change prefix matching to ensure directory boundary: for pattern `src/`, check `relPath === 'src' || relPath.startsWith('src/')`. For wildcard patterns like `src/*`, check `relPath.startsWith('src/')`.

**Rationale**: Simple string-based fix that doesn't require a glob library. The pattern `src/` should match `src/foo.ts` but not `src_backup/foo.ts`. By ensuring the prefix includes the trailing `/`, we enforce directory boundaries.

**Alternatives considered**:
- `minimatch` library (rejected for now: overkill for directory prefix patterns; can be added later as FEAT-011)
- Path.dirname comparison (rejected: doesn't handle wildcards)

**Files affected**: `packages/core/src/ctx/merger.ts:44-52`, `packages/core/src/packer/packer.ts:53-66`

---

## R-009: Body size limit middleware

**Decision**: Use Hono's built-in `bodyLimit()` middleware with 10MB default. Apply globally to all routes.

**Rationale**: Hono provides this out-of-the-box. One line of middleware prevents memory exhaustion from oversized payloads.

**Files affected**: `packages/daemon/src/server.ts`

---

## R-010: Home directory resolution

**Decision**: Replace all `process.env.HOME || process.env.USERPROFILE || '~'` patterns with `os.homedir()` from Node.js stdlib.

**Rationale**: `os.homedir()` handles all platforms correctly (uses `passwd` on Unix, `USERPROFILE` on Windows) and never returns a literal `~`.

**Files affected**:
- `packages/daemon/src/store/db.ts:88`
- `packages/core/src/config/loader.ts:61-62`
- `packages/cli/src/commands/daemon.ts:6,29`
