# Research: ctxl v2

**Branch**: `004-ctxl-v2` | **Date**: 2026-03-15

## R1: Index File Format — YAML vs JSON vs SQLite

**Decision**: YAML (consistent with .ctx files)

**Rationale**: The .ctxl index must be human-readable, git-tracked, and editable by developers. YAML is already the format for .ctx files, and the existing `js-yaml` dependency handles parse/serialize. Git diffs on YAML are readable. The index is small enough (<100KB for 100+ entries) that parse performance is not a concern — under 10ms for typical sizes.

**Alternatives considered**:
- JSON: Valid but worse git diffs (no comments, bracket noise). Would require switching mental models between .ctx (YAML) and .ctxl (JSON).
- SQLite: Fast queries but not git-trackable, not human-editable, violates "Repository Truth" principle. Would duplicate the daemon's SQLite store.

---

## R2: Lock Manager Strategy — File-Based vs SQLite vs In-Memory

**Decision**: File-based locking via `proper-lockfile` (already a dependency)

**Rationale**: `proper-lockfile` is already used in the codebase and provides atomic file-level locking with configurable TTL, stale lock detection, and cross-process safety. The lock file (`.ctxl.lock`) is a YAML file listing active locks, `.gitignore`'d since locks are ephemeral runtime state. This avoids adding a daemon dependency for lock coordination — agents can lock/unlock via direct filesystem operations without the daemon running.

**Alternatives considered**:
- SQLite-based (daemon): Would require the daemon to be running for any write operation. Agents writing .ctx files directly (without daemon) couldn't acquire locks. Adds unnecessary coupling.
- In-memory (per-process): Doesn't work across processes. Multiple agents or CLI invocations wouldn't see each other's locks.
- Advisory locks (fcntl/flock): Not portable across all Node.js platforms. Doesn't support metadata (holder, TTL, operation).

---

## R3: Three-Way Merge Base Source

**Decision**: Derive base from `_history` entries (checksum-based) with git fallback

**Rationale**: When two writers both read version N and write concurrently, the merge engine needs the base (version N content). The `_history` array stores checksums for each version. The merge engine reads the last common version's checksum from both sides' histories, then retrieves the base content from git (`git show <commit>:<path>`). If git history is unavailable (e.g., uncommitted base), the engine falls back to a two-way merge (ours vs theirs) which is more conservative but still safe.

**Alternatives considered**:
- Store full snapshots in _history: Too expensive — would bloat .ctx files significantly.
- Always use git for base: Requires committed state. Fails for files that haven't been committed yet.
- Store base in .ctxl.lock: Lock could be released before merge runs. Adds complexity to lock lifecycle.

---

## R4: Section-Level Merge Strategies

**Decision**: Per-section strategy map as defined in the design document

**Rationale**: Different sections of .ctx files have different semantics. Tags are purely additive (union always works). Gotchas are append-only narratives (concatenate + dedup). Contracts and key_files are identity-keyed (merge by key, conflict on same-key different-content). Summary is a single value (last-writer-wins with warning). This maps naturally to how developers think about each section.

| Section | Key | Strategy | Conflict Condition |
|---------|-----|----------|-------------------|
| summary | (whole) | last-writer-wins | both changed → warn, no conflict marker |
| key_files | path | union by path | same path, different content |
| contracts | name | union by name | same name, different content |
| decisions | id | union by id | same id, different content |
| commands | key | last-writer-wins | same key, different value |
| gotchas | text hash | concatenate + dedup | never (always additive) |
| tags | value | deduplicated union | never (always additive) |
| refs | target | union by target | same target, different opts |
| ignore | path | monotonic union | never (always additive) |

**Alternatives considered**:
- Single strategy for all sections: Would lose the semantic benefits. Tags would get conflict markers unnecessarily.
- User-configurable per-section strategy: Over-engineered for v2. The built-in strategies cover all practical cases.

---

## R5: Version Field Semantics (Clarification Resolution)

**Decision**: Repurpose `version` field as content revision counter (per spec clarification)

**Rationale**: The spec clarification resolved this: the `version` field changes from a fixed schema identifier (`1`) to an incrementing content revision counter (1, 2, 3...). Existing v1 files with `version: 1` are naturally at content revision 1, so no migration of the field value is needed. The `CURRENT_CTX_VERSION` constant in `types/ctx.ts` will be removed — version is no longer a schema marker but a per-file counter.

**Impact on existing code**:
- `parser.ts`: Already accepts `version` as a number. No change needed for parsing.
- `validator.ts`: Remove the check `version === CURRENT_CTX_VERSION`. Accept any positive integer.
- `migrator.ts`: Update migration logic — v1 files don't need version field migration, but do need `_history` initialization.
- `CURRENT_CTX_VERSION` constant: Remove or repurpose as minimum accepted version (1).

---

## R6: History Archive Format and Location

**Decision**: YAML files at `.ctxl.history/<relative-path>/ctx-history.yaml`

**Rationale**: Archive files mirror the .ctx directory structure under `.ctxl.history/`. For example, `src/auth/.ctx` overflows to `.ctxl.history/src/auth/ctx-history.yaml`. This makes it easy to find the archive for any .ctx file. Archives are git-tracked (unlike locks) because history is a permanent record. YAML format matches .ctx files for consistency.

**Alternatives considered**:
- Single archive file for all .ctx files: Would grow large and cause merge conflicts in git.
- SQLite storage in daemon: Not git-tracked, loses history if daemon data is reset. Violates "Repository Truth" principle.
- Append to the .ctx file itself (no limit): .ctx files would grow unbounded, reducing readability and parse performance.

---

## R7: Scoring Algorithm — Extend Existing vs Replace

**Decision**: Extend existing scorer with configurable weights and new signals

**Rationale**: The existing `scoreEntries()` function in `packages/core/src/scorer/scorer.ts` already implements locality, recency, and tag scoring. v2 adds configurable weights (from .ctxl index `defaults.scoring`), dependency bonuses (from .ctxl graph), and a cwd ancestor bonus. The extension is additive — existing scoring behavior is preserved when no .ctxl index is present (v1 fallback).

**Changes to scoring formula**:
```
v1: score = locality * 0.4 + tagScore * 0.3 + recency * 0.2  (hardcoded weights)
v2: score = locality * w_locality + tagScore * w_tag + recency * w_recency
          + depBonus + cwdBonus + (entry.weight - 1.0)
```

Where `w_locality`, `w_tag`, `w_recency` come from .ctxl defaults.scoring (falling back to v1 hardcoded values if not present).

---

## R8: Context Selection Budget Categories

**Decision**: Four-category budget (contracts, local_ctx, related_ctx, history) with a reserve

**Rationale**: The existing budget is a single flat number (`default_tokens`). v2 adds category-based budgeting so that contracts (high priority) always fit, local context (cwd ancestors) gets a guaranteed allocation, and related context fills the remainder. The `history` category allocates tokens for `_history` entries of selected files. A `reserve` category holds tokens for deep-read fallback.

**Default allocations** (percentage of total budget):
- contracts: 20%
- local_ctx: 30%
- related_ctx: 35%
- history: 10%
- reserve: 5%

These are configurable in `.ctxl` `defaults.budget`.

---

## R9: Bootstrap Analyzer — Quick vs Full Mode

**Decision**: Two-tier analysis with quick (heuristics only) and full (AI-assisted) modes

**Rationale**: Quick mode uses only filesystem analysis — file extensions for language detection, package.json/Makefile/Cargo.toml for commands, directory names for tags, import statements for dependencies. It requires no network or AI calls and runs in under 1 second per directory. Full mode extends quick mode with AI-generated summaries by reading top-level source files and generating descriptions. Full mode requires a running daemon and MCP connection.

**Quick mode signals** (no AI required):
1. File extensions → language, tags
2. Config files (package.json, Cargo.toml, go.mod, etc.) → commands, dependencies
3. Entry points (main.*, index.*, mod.*, lib.*) → key_files
4. Test files (*_test.*, *.test.*, *.spec.*) → key_files (test category)
5. README.md → summary (first paragraph)
6. Directory name → tags
7. Import/require statements → dependencies (inter-directory refs)

---

## R10: Spec-Kit Bridge — Separate Package vs Core Module

**Decision**: Separate package (`@ctxkit/speckit-bridge`)

**Rationale**: The spec-kit bridge has dependencies on spec-kit's markdown parsing format which could change independently. Isolating it as a separate package prevents spec-kit format changes from affecting the core. It also keeps @ctxkit/core focused on .ctx operations only. The bridge depends on @ctxkit/core for .ctx parsing/serialization but not vice versa.

**Package dependency graph**:
```
@ctxkit/speckit-bridge → @ctxkit/core (for ctx parsing)
@ctxkit/cli → @ctxkit/speckit-bridge (for speckit commands)
@ctxkit/daemon → @ctxkit/speckit-bridge (for speckit API routes)
```

---

## R11: PR Context — Session Data Source

**Decision**: Query daemon SQLite tables (sessions, request_events, memory_diffs, audit_log)

**Rationale**: The daemon already stores session data, tool calls, and proposals in SQLite. PR context generation queries this existing data, cross-references with git (commit ranges, file changes), and renders the result. No new data collection is needed — the existing hooks already capture all required information. The `request_events` table has event_type, tool_name, tool_input, tool_response which maps directly to the prompt chain and agent decisions.

**Linking sessions to git**: The session record has `branch` and `started_at`/`ended_at` timestamps. For PR context, we find all sessions on the current branch whose time range overlaps with the git commit range (merge-base to HEAD).

---

## R12: Dashboard Visualization Library

**Decision**: Lightweight SVG-based rendering (no heavy graph library)

**Rationale**: The context map page needs a force-directed graph for the dependency visualization. Rather than adding a heavy library (d3-force, cytoscape.js, vis-network), use a lightweight approach: compute layout with a simple force simulation (< 200 lines), render with React SVG elements. The graph is small (10-100 nodes) and static (no real-time physics). This keeps the dependency footprint small per the constitution ("small dependency footprint").

For the timeline page, use a simple CSS-based chronological list with expandable entries. For the activity feed, use EventSource (SSE) for near-real-time streaming from the daemon.

**Alternatives considered**:
- d3-force: Heavy dependency (d3 pulls in many subpackages). Overkill for 10-100 nodes.
- cytoscape.js: Good graph library but 500KB+ bundle size. Not justified for a simple dependency view.
- react-flow: Designed for node editors, not dependency graphs. Wrong abstraction level.

---

## R13: Activity Events — Storage and Streaming

**Decision**: SQLite table in daemon + SSE endpoint for real-time streaming

**Rationale**: Activity events (SELECT, READ, STALE, PROPOSE, UPDATE, CONFLICT, RESOLVE) are stored in a new `activity_events` table in the daemon's SQLite database. The daemon exposes an SSE endpoint (`/api/v1/activity/stream`) that pushes new events as they occur. The dashboard's activity feed page subscribes to this stream. Events have a 30-day retention (same as sessions).

**Event schema**:
- id, session_id, event_type, ctx_path, agent_id, details (JSON), created_at

---

## R14: Auto-Update Policy Configuration

**Decision**: Project-level policies in .ctxl `policies` section

**Rationale**: Auto-update behavior (auto-apply vs require-review) is configured in the .ctxl index's `policies` section. This makes it project-level (checked into git, shared across team). The existing `WorkspaceProfile` `auto_approve` config is for v1 proposal approval — v2 policies extend this at the index level.

**Policy fields**:
- `auto_update`: boolean (default false) — auto-apply clean proposals
- `require_review`: boolean (default true) — queue proposals for human review
- `staleness_threshold_days`: number (default 30) — days before a file is considered stale
- `enforce_checksums`: boolean (default true) — validate checksums on read
- `bootstrap_on_new_dir`: boolean (default false) — auto-bootstrap new directories
