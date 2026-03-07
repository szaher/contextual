# Data Model: Gap Remediation

**Branch**: `003-gap-remediation` | **Date**: 2026-03-04

---

## Schema Changes

This feature modifies existing database schema and type definitions. No new tables are introduced.

### Table: `request_events` (modified)

**Change**: Make `request_text` and `context_pack` nullable to support proper tool event storage.

| Column | Type | Before | After | Notes |
|--------|------|--------|-------|-------|
| `request_text` | TEXT | NOT NULL | nullable | NULL for tool events |
| `context_pack` | TEXT | nullable | nullable | Already nullable per schema (despite code comment suggesting NOT NULL) |

**Insertion rules**:
- Request events: `request_text`, `context_pack`, `token_count`, `budget` populated; `tool_name`, `tool_input`, `tool_response`, `exit_code`, `duration_ms` set to NULL
- Tool events: `tool_name`, `tool_input`, `tool_response`, `exit_code`, `duration_ms` populated; `request_text`, `context_pack` set to NULL; `token_count` = 0, `budget` = 0

### Table: `memory_diffs` (modified)

**Change**: Add `source_hash` column for conflict detection during proposal apply.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `source_hash` | TEXT | YES | NULL | SHA-256 hash of .ctx file content at proposal creation time. Used for conflict detection on apply. |

**State transitions for `status`**:
```
proposed → approved → applied
proposed → rejected
approved → rejected (reversal)
```

On `apply`:
1. Read current file, compute SHA-256
2. Compare with `source_hash`
3. If match → write `diff_content` to file, set status = `applied`, record `resolved_at`
4. If mismatch → return 409 Conflict, status unchanged

---

## Type Changes

### ParseResult (new/extended)

The `.ctx` parser return type gains a `warnings` field:

```
ParseResult {
  ctx: CtxFile           // parsed content (valid entries only)
  warnings: string[]     // type guard violations, skipped fields
}
```

### ContextPack (extended)

The context pack result type gains a `warnings` field:

```
ContextPack {
  version: 1
  items: PackItem[]
  omitted: OmittedItem[]
  total_tokens: number
  budget_tokens: number
  budget_used_pct: number
  warnings: string[]     // NEW: budget stretch warnings (moved from console.warn)
}
```

### ScoreRecency signature change

```
Before: scoreRecency(verifiedAt: string, isStale: boolean): number
After:  scoreRecency(verifiedAt: string, repoRoot?: string): number
```

The function now determines staleness internally (via `isEntryStale()`) and computes time-decay score by parsing `verifiedAt` as either:
- Git commit hash → resolve to date via git (with caching)
- ISO 8601 date string → parse directly
- Empty/unrecognized → return floor score (0.3)

---

## Entities (unchanged structure, clarified behavior)

### Context Entry
No structural changes. Scoring behavior changes:
- **Locality**: Ancestor directories score higher than siblings at same depth
- **Recency**: Continuous exponential decay replaces binary scoring
- **Tags**: Partial match accumulation capped per tag

### Proposal
- New `source_hash` field for conflict detection
- `diff_content` stores full proposed .ctx file content (not a patch)
- Apply writes content to disk atomically (temp file + rename)

### Session
No changes. Retention scheduler fix uses existing `started_at` column.

### Audit Log Entry
No changes. Proposal apply continues to create audit entries on successful application.
