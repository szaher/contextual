# Data Model: ctxl v2

**Branch**: `004-ctxl-v2` | **Date**: 2026-03-15

## Entity Overview

```
┌──────────────┐     contains      ┌──────────────┐
│  CtxlIndex   │ ──────────────▶   │  CtxlEntry   │
│  (.ctxl)     │     1:many        │              │
└──────┬───────┘                   └──────┬───────┘
       │                                  │ references
       │ contains                         ▼
       │                           ┌──────────────┐     contains      ┌──────────────┐
       │                           │   CtxFile     │ ──────────────▶   │ HistoryEntry │
       │                           │   (.ctx)      │     1:many        │              │
       │                           └──────┬───────┘                   └──────────────┘
       │                                  │
       │                                  │ may have
       │                                  ▼
       │                           ┌──────────────┐
       │                           │ConflictEntry │
       │                           └──────────────┘
       │
       │ contains
       ▼
┌──────────────┐                   ┌──────────────┐
│  CtxlGraph   │                   │     Lock     │
│  (deps)      │                   │ (.ctxl.lock) │
└──────────────┘                   └──────────────┘

┌──────────────┐                   ┌──────────────┐
│ActivityEvent │                   │  PrContext   │
│  (SQLite)    │                   │  (generated) │
└──────────────┘                   └──────────────┘

┌──────────────┐
│ MappingRule  │
│ (speckit)    │
└──────────────┘
```

---

## 1. CtxlIndex (file: `.ctxl`)

The central registry of all .ctx files in a repository.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | integer | yes | Index schema version (always 1 for v2) |
| repo | string | yes | Repository name or identifier |
| generated_at | ISO 8601 string | yes | Timestamp of full index generation |
| updated_at | ISO 8601 string | yes | Timestamp of last incremental update |
| defaults | CtxlDefaults | yes | Project-level scoring, budget, and policy configuration |
| entries | CtxlEntry[] | yes | Array of all indexed .ctx files |
| graph | Record<string, CtxlGraphNode> | yes | Dependency graph keyed by .ctx path |
| policies | CtxlPolicies | yes | Project-level policy configuration |

**Validation rules**:
- `version` must be 1
- `repo` must be non-empty string
- `generated_at` and `updated_at` must be valid ISO 8601
- `entries` must not contain duplicate paths
- All paths in `graph` must reference existing entries

**Storage**: YAML file at repository root, git-tracked.

### CtxlDefaults

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| scoring | CtxlScoringConfig | see below | Scoring weight configuration |
| budget | CtxlBudgetConfig | see below | Token budget allocations |

### CtxlScoringConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| locality_weight | number (0-1) | 0.5 | Weight for path distance scoring |
| recency_weight | number (0-1) | 0.3 | Weight for modification recency |
| tag_match_weight | number (0-1) | 0.2 | Weight for tag/keyword matching |
| dependency_bonus | number (0-1) | 0.1 | Bonus per depended-by edge |
| contract_floor | number (0-1) | 0.9 | Minimum score for scope-matched contracts |

**Validation**: All weights must be in [0, 1]. `locality_weight + recency_weight + tag_match_weight` should sum to ~1.0 (warning if > 1.5).

### CtxlBudgetConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| total | integer | 4000 | Total token budget |
| contracts | number (0-1) | 0.20 | Fraction for contracts |
| local_ctx | number (0-1) | 0.30 | Fraction for cwd ancestor .ctx files |
| related_ctx | number (0-1) | 0.35 | Fraction for highest-scored remaining |
| history | number (0-1) | 0.10 | Fraction for _history of selected files |
| reserve | number (0-1) | 0.05 | Fraction for deep-read fallback |

**Validation**: Fractions must sum to 1.0 (±0.01 tolerance). `total` must be positive.

### CtxlPolicies

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| auto_update | boolean | false | Auto-apply clean proposals |
| require_review | boolean | true | Queue proposals for human review |
| max_ctx_size_lines | integer | 200 | Maximum .ctx file line count |
| staleness_threshold_days | integer | 30 | Days before file is stale |
| enforce_checksums | boolean | true | Validate checksums on read |
| bootstrap_on_new_dir | boolean | false | Auto-bootstrap new directories |

---

## 2. CtxlEntry

A single entry in the .ctxl index representing one .ctx file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | yes | Relative path to .ctx file from repo root |
| summary | string | yes | First-line summary from .ctx file |
| tags | string[] | yes | Tags from .ctx file |
| depth | integer | yes | Directory depth from repo root (0 = root .ctx) |
| ctx_version | integer | yes | Current content revision number |
| last_modified | ISO 8601 string | yes | Timestamp of last .ctx modification |
| last_modified_by | string | yes | Author of last modification |
| checksum | string | yes | SHA-256 of .ctx content (excluding _history) |
| dependencies | string[] | yes | Paths of .ctx files this file depends on |
| weight | number | yes | Manual weight adjustment (default 1.0) |
| sections | string[] | yes | List of section names present in .ctx |
| has_conflicts | boolean | yes | Whether file has unresolved conflicts |
| token_estimate | integer | yes | Estimated token count for this .ctx file |

**Identity**: `path` is the unique key (no two entries share a path).

**Validation rules**:
- `path` must be a valid relative path ending in `.ctx`
- `depth` must equal the number of `/` separators in path
- `checksum` must match `sha256:<64-hex-chars>` format
- `ctx_version` must be a positive integer
- `weight` must be > 0 (default 1.0)
- `sections` values must be from: summary, key_files, contracts, decisions, commands, gotchas, tags, refs, ignore

### CtxlGraphNode

| Field | Type | Description |
|-------|------|-------------|
| depends_on | string[] | Paths this .ctx file depends on |
| depended_by | string[] | Paths that depend on this .ctx file |

**Validation**: Graph must be acyclic. All referenced paths must exist in entries.

---

## 3. CtxFile (Extended)

The existing .ctx file schema extended with versioning and history.

| Field | Type | Required | Change from v1 |
|-------|------|----------|----------------|
| version | integer | yes | **Changed**: Was literal `1`, now content revision counter (1, 2, 3...) |
| summary | string | yes | Unchanged |
| key_files | KeyFile[] | yes | Unchanged |
| contracts | Contract[] | yes | Unchanged |
| decisions | Decision[] | yes | Unchanged |
| commands | Record<string, string> | no | Unchanged |
| gotchas | Gotcha[] | yes | Unchanged |
| tags | string[] | yes | Unchanged |
| refs | CtxRef[] | no | Unchanged |
| ignore | IgnorePolicy | no | Unchanged |
| _history | HistoryEntry[] | no | **New**: Inline version history (max 20 entries) |

**State transitions** (version lifecycle):
```
v1 file (version: 1) ──read──▶ treated as revision 1
                      ──write──▶ version becomes 2, _history initialized
revision N ──write──▶ revision N+1, history entry prepended
_history at 20 entries ──write──▶ oldest evicted to archive, newest prepended
```

**Backward compatibility**: A v1 file (no `_history`, `version: 1`) is valid. The first v2 write initializes `_history` and increments `version` to 2.

---

## 4. HistoryEntry

A record of a single version change to a .ctx file. Stored in `_history` array (inline) and `.ctxl.history/` (archive).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | integer | yes | Version number this entry was created at |
| timestamp | ISO 8601 string | yes | When the change occurred |
| author | string | yes | Who made the change |
| session_id | string | no | Agent session ID (null for developer edits) |
| reason | string | yes | Why the change was made (max 200 chars) |
| checksum | string | yes | SHA-256 of .ctx content at this version |
| diff_summary | string | yes | Human-readable change summary |

**Author format**: `agent:<model-id>` for agent changes, `developer:<username>` for human edits.

**diff_summary format**: `+N section, ~N section, -N section` (e.g., `+2 key_files, ~1 contract, -1 gotcha`).

**Validation rules**:
- `version` must be a positive integer
- `reason` must be ≤200 characters
- `checksum` must match `sha256:<64-hex-chars>` format
- `author` must match `agent:*` or `developer:*` pattern
- Entries must be ordered by version descending (newest first) in `_history`

---

## 5. Lock

An ephemeral record of an exclusive write hold on a .ctx file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | yes | Relative path to the locked .ctx file |
| holder | string | yes | Identity of the lock holder |
| acquired_at | ISO 8601 string | yes | When the lock was acquired |
| expires_at | ISO 8601 string | yes | When the lock auto-expires |
| operation | string | yes | Type of operation |

**Storage**: YAML array in `.ctxl.lock` file at repo root. `.gitignore`'d (ephemeral runtime state).

**Holder format**: `agent:<model>:sess_<id>` for agents, `developer:<username>` for humans.

**Operation values**: `update`, `resolve`, `bootstrap`, `migrate`.

**State transitions**:
```
(no lock) ──acquire──▶ HELD ──release──▶ (no lock)
                        │
                        ├──extend──▶ HELD (new expires_at)
                        │
                        └──TTL expires──▶ STALE ──next acquire──▶ (cleaned up + new HELD)
```

**Validation rules**:
- `path` must reference a valid .ctx file path
- `expires_at` must be after `acquired_at`
- Default TTL: 5 minutes from acquisition
- Only one lock per path at a time

---

## 6. ConflictEntry

A record of incompatible concurrent changes to the same entry within a .ctx file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| section | string | yes | Section name (key_files, contracts, decisions, etc.) |
| key | string | yes | Identity key of the conflicting entry |
| ours | object | yes | Our version of the entry |
| theirs | object | yes | Their version of the entry |
| ours_author | string | yes | Author of our version |
| theirs_author | string | yes | Author of their version |

**In-file representation**: Conflicting entries are written to the .ctx file with `_conflict: true` and `_versions: [ours, theirs]` markers added to the entry. The `CtxlEntry` for this file has `has_conflicts: true`.

**Resolution options**:
- `pick_ours`: Accept our version, discard theirs
- `pick_theirs`: Accept their version, discard ours
- `manual`: Provide a manually merged version
- `keep_both`: Keep both as separate entries (only for additive sections)

**State transitions**:
```
DETECTED ──pick_ours──▶ RESOLVED (ours kept)
          ──pick_theirs──▶ RESOLVED (theirs kept)
          ──manual──▶ RESOLVED (custom merge)
          ──keep_both──▶ RESOLVED (both preserved)
```

---

## 7. ActivityEvent (SQLite)

A record of a context-related action during an agent session.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | yes | Unique event identifier |
| session_id | string | yes | Foreign key to sessions table |
| event_type | string | yes | Event category |
| ctx_path | string | no | Related .ctx file path |
| agent_id | string | no | Agent that triggered the event |
| details | string (JSON) | no | Event-specific metadata |
| created_at | ISO 8601 string | yes | When the event occurred |

**Storage**: `activity_events` table in daemon SQLite database. 30-day retention.

**Event types**: `SELECT`, `READ`, `STALE`, `PROPOSE`, `UPDATE`, `CONFLICT`, `RESOLVE`, `BOOTSTRAP`, `INDEX_REGEN`, `LOCK_ACQUIRE`, `LOCK_RELEASE`.

**Indexes**: `(session_id, created_at)`, `(event_type)`, `(ctx_path)`.

---

## 8. PrContext (Generated Document)

A synthesized document combining session data into a reviewable narrative. Not stored persistently — generated on demand from session data.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | integer | yes | Document schema version (1) |
| generated_at | ISO 8601 string | yes | When the document was generated |
| session_ids | string[] | yes | Sessions covered by this document |
| git_range | string | no | Git commit range (merge-base..HEAD) |
| branch | string | no | Git branch name |
| summary | string | yes | 2-3 sentence summary |
| motivation | string | yes | Why the change was made |
| prompt_chain | PromptEntry[] | yes | Chronological prompt history |
| agent_decisions | AgentDecision[] | yes | Notable agent decisions |
| context_used | ContextUsed[] | yes | .ctx files that informed the work |
| files_changed | FileChange[] | yes | Source files modified |
| ctx_updates | CtxUpdate[] | yes | .ctx file modifications |
| spec_references | SpecReference[] | no | Cross-references to spec-kit artifacts |
| stats | PrStats | yes | Aggregate statistics |

### PromptEntry

| Field | Type | Description |
|-------|------|-------------|
| index | integer | Prompt sequence number |
| timestamp | ISO 8601 string | When the prompt was submitted |
| prompt | string | The prompt text (truncated to 200 chars) |
| truncated | boolean | Whether the prompt was truncated |
| outcome | string | What the prompt accomplished |
| tools_used | string[] | Tool names invoked |
| files_touched | string[] | Files read or modified |

### AgentDecision

| Field | Type | Description |
|-------|------|-------------|
| decision | string | What was decided |
| reason | string | Why this choice was made |
| source | string | Decision source type |
| context_ref | string | null | .ctx path if context-driven |

**Source values**: `autonomous`, `context-driven`, `user-directed`, `policy-driven`.

### ContextUsed

| Field | Type | Description |
|-------|------|-------------|
| ctx_path | string | .ctx file path |
| sections_used | string[] | Which sections were consulted |
| relevance | string | How the context was used |
| score | number | Selection score |

### FileChange

| Field | Type | Description |
|-------|------|-------------|
| path | string | Changed file path |
| change_type | string | Type of change |
| lines_added | integer | Lines added |
| lines_removed | integer | Lines removed |
| purpose | string | Why the file was changed |

**Change types**: `added`, `modified`, `deleted`, `renamed`.

### CtxUpdate

| Field | Type | Description |
|-------|------|-------------|
| ctx_path | string | .ctx file path |
| version_change | string | Version transition (e.g., "3→4") |
| diff_summary | string | Change summary |
| sections_changed | string[] | Sections that changed |

### PrStats

| Field | Type | Description |
|-------|------|-------------|
| total_prompts | integer | Number of prompts |
| total_tool_calls | integer | Number of tool invocations |
| total_tokens_used | integer | Approximate tokens consumed |
| session_duration_ms | integer | Total session duration |
| files_changed_count | integer | Number of files changed |
| lines_added | integer | Total lines added |
| lines_removed | integer | Total lines removed |

---

## 9. MappingRule (Spec-Kit Bridge)

A definition of how a spec-kit artifact section maps to a .ctx section.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| spec_section | string | yes | Section name in spec-kit artifact |
| ctx_section | string | yes | Target section in .ctx file |
| transform | string | yes | Transformation type |
| id_prefix | string | no | Prefix for generated IDs |
| locked | boolean | yes | Whether imported entries are locked |
| direction | string | yes | Sync direction |

**Transform types**: `direct` (1:1 copy), `reshape` (structural transformation), `aggregate` (many-to-one), `split` (one-to-many).

**Direction values**: `import_only` (spec → ctx), `export_only` (ctx → spec), `bidirectional`.

### SyncState

| Field | Type | Description |
|-------|------|-------------|
| spec_path | string | Path to spec-kit artifact |
| ctx_path | string | Path to .ctx file |
| spec_mtime | ISO 8601 string | Last modification time of spec |
| ctx_mtime | ISO 8601 string | Last modification time of .ctx |
| last_synced | ISO 8601 string | Last sync timestamp |
| direction | string | Which side was source in last sync |

**Storage**: `.ctxl.speckit-sync.yaml` at repo root, git-tracked.

---

## SQLite Schema Extensions

New tables added to the daemon's SQLite database (`~/.ctxl/data/ctxl.db`):

```sql
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  event_type TEXT NOT NULL,
  ctx_path TEXT,
  agent_id TEXT,
  details TEXT,  -- JSON
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_ctx ON activity_events(ctx_path);
```

No other new SQLite tables are needed — locks are filesystem-based, conflicts are inline in .ctx files, history is filesystem-based, and PR context is generated on demand.
