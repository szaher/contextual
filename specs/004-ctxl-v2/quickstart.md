# Quickstart: ctxl v2

**Branch**: `004-ctxl-v2` | **Date**: 2026-03-15

Integration scenarios demonstrating key v2 workflows.

---

## Scenario 1: Index Generation and Context Selection

A developer migrates a v1 repository to v2 and sees improved context selection.

```bash
# 1. Generate the .ctxl index from existing .ctx files
ctxkit index generate
# Output: Generated .ctxl index with 12 entries, 8400 tokens, 5 dependencies

# 2. View the generated index
ctxkit index show
# Output: entries, dependency graph, scoring config, policies

# 3. Select context for a task
ctxkit index select --prompt "Fix authentication bug in JWT validation" --cwd src/auth/
# Output: Selected 4 .ctx files (score, reasons, budget usage)

# 4. Compare with v1 behavior (directory walk)
ctxkit inject --request "Fix authentication bug in JWT validation"
# Output: Same result, now using index under the hood
```

**Verification**: Selected files are relevant to authentication. Contracts in scope are included first. Budget categories show correct allocation.

---

## Scenario 2: Version Tracking and History

An agent makes changes and the version history is automatically maintained.

```bash
# 1. Check current version of a .ctx file
ctxkit history src/auth/.ctx
# Output: version 1, no history entries

# 2. Agent adds a key_file (via /ctx skill or MCP tool)
# Internally: version bumps to 2, history entry created

# 3. Check history after update
ctxkit history src/auth/.ctx
# Output: version 2, 1 history entry (timestamp, author, "+1 key_file")

# 4. After 20+ updates, check archive
ctxkit history src/auth/.ctx --all
# Output: inline entries (latest 20) + archived entries from .ctxl.history/

# 5. View diff between versions
ctxkit history src/auth/.ctx --diff 1..5
# Output: Structured diff showing per-section changes
```

**Verification**: Version increments correctly. History entries have correct metadata. Archive overflow works. Diff is accurate.

---

## Scenario 3: Multi-Agent Conflict Resolution

Two agents concurrently edit the same .ctx file.

```bash
# Setup: .ctx file is at version 5

# Agent A reads version 5, adds a key_file
# Agent B reads version 5, modifies a contract

# Agent A writes first → version 6 (clean write)
# Agent B writes → detects version mismatch, runs three-way merge:
#   - key_file addition (Agent A) + contract modification (Agent B) = clean merge
#   → version 7 with both changes

# If both agents modify the SAME contract:
# → Merge creates conflict markers, version 7 with has_conflicts: true

# 1. List conflicts
ctxkit conflicts list
# Output: src/auth/.ctx has 1 conflict in contracts section

# 2. Resolve conflict
ctxkit conflicts resolve src/auth/.ctx
# Output: Shows both versions, asks for resolution choice
# User picks "theirs" → conflict resolved, version 8
```

**Verification**: No data loss. Both agents' changes preserved. Conflicts only for truly incompatible changes.

---

## Scenario 4: Auto-Update During Session

An agent's coding session automatically keeps .ctx files fresh.

```bash
# 1. Agent starts session → SessionStart hook reads .ctxl index
#    Context selected via index (fast path, no directory walk)

# 2. Agent edits files in src/auth/ → PostToolUse hook marks src/auth/ as stale

# 3. Agent edits files in src/api/ → PostToolUse hook marks src/api/ as stale

# 4. Agent completes task → TaskCompleted hook:
#    - Runs git diff to see what changed
#    - Generates .ctx update proposals for stale directories
#    - If auto_update policy: applies proposals automatically
#    - If require_review policy: queues proposals in dashboard

# 5. View activity feed
ctxkit dashboard
# Navigate to Activity page → see SELECT, READ, STALE, PROPOSE, UPDATE events
```

**Verification**: Staleness tracked per directory. Proposals are correct (new key_files for new files, updated contracts for changed behavior). Policy controls auto-apply vs review.

---

## Scenario 5: Bootstrap a New Repository

A developer adds ctxl to an existing codebase.

```bash
# 1. Bootstrap the entire repository (dry run first)
ctxkit bootstrap --dry-run
# Output: Would generate 8 .ctx files (shows summaries, key_files, tags for each)

# 2. Apply the bootstrap
ctxkit bootstrap
# Output: Generated 8 .ctx files, created .ctxl index

# 3. Review a generated file
cat src/auth/.ctx
# Output: summary, key_files (entry points, configs), tags (auth, typescript), commands (test)

# 4. Customize and verify
# Edit generated .ctx files as needed
ctxkit validate
# Output: All 8 .ctx files valid
```

**Verification**: Generated .ctx files have reasonable content. Key entry points detected. Tags inferred from directory names and file extensions. Commands extracted from package.json/Makefile.

---

## Scenario 6: Spec-Kit Integration

A team using spec-kit imports their constitution into .ctx.

```bash
# 1. Import constitution
ctxkit speckit import --constitution .specify/memory/constitution.md
# Output: Imported 4 principles as locked decisions, 3 boundaries as locked contracts

# 2. Import component specs
ctxkit speckit import --specs specs/
# Output: Imported 8 requirements as contracts, 5 edge cases as gotchas

# 3. Validate compliance
ctxkit speckit validate --constitution .specify/memory/constitution.md
# Output: 11/12 .ctx files pass, 1 violation found

# 4. Bidirectional sync
ctxkit speckit sync
# Output: 2 .ctx files updated from specs, 1 spec updated from .ctx
```

**Verification**: Locked entries can't be overridden. IDs use correct prefixes (CONST-, FR-). Round-trip fidelity maintained.

---

## Scenario 7: PR Context Generation

An agent generates a PR description from session data.

```bash
# After completing work on a branch:

# 1. Generate PR context from current branch
ctxkit pr --branch
# Output: Markdown document with summary, prompt chain, decisions, file changes, stats

# 2. Create a GitHub PR with context
ctxkit pr --branch --gh | gh pr create --title "Fix auth JWT validation" --body-file -
# Output: PR created with full context document as body

# 3. Generate JSON for programmatic use
ctxkit pr --branch --format json
# Output: Full PrContext JSON object
```

**Verification**: Prompt chain matches actual session. Agent decisions are classified correctly. File changes match git diff. Stats are accurate.

---

## Scenario 8: Dashboard Extensions

A developer uses the dashboard to visualize context evolution.

```bash
# 1. Start the daemon and open dashboard
ctxkit daemon start
ctxkit dashboard
# Opens http://localhost:3742 in browser

# Navigate to:
# /timeline → Memory evolution timeline (all .ctx changes chronologically)
# /map → Interactive dependency graph (nodes = .ctx files, edges = dependencies)
# /conflicts → Conflict resolution UI (side-by-side diff)
# /activity → Real-time activity feed (streaming events)
# /sessions/:id/pr → PR context viewer (rendered markdown)
```

**Verification**: Timeline shows correct chronological order. Context map renders dependency edges. Conflict resolver updates .ctx files. Activity feed streams in real time. PR context view renders markdown correctly.

---

## Scenario 9: V1 to V2 Migration

A team with an existing v1 setup migrates to v2.

```bash
# 1. Dry run migration
ctxkit migrate --dry-run
# Output: Would process 12 .ctx files, initialize versions and histories, generate .ctxl index

# 2. Run migration
ctxkit migrate
# Output: Processed 12 .ctx files, all at version 1 with empty histories, .ctxl index generated

# 3. Verify idempotency
ctxkit migrate
# Output: All files already migrated, no changes needed

# 4. Verify backward compatibility
ctxkit inject --request "test"
# Output: Works exactly as before (v1 fallback path still functional)
```

**Verification**: Migration is idempotent. No data loss. v1 tests still pass. Version field correctly set to 1 (content revision 1).
