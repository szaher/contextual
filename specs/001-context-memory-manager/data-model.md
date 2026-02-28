# Data Model: Context & Memory Manager

**Branch**: `001-context-memory-manager` | **Date**: 2026-02-28

## Storage Layers

1. **Filesystem** — `.ctx` files (YAML, git-tracked, in-repo)
2. **SQLite** — Sessions, request events, audit log (local db)
3. **Config files** — Workspace profiles (YAML, per-repo + global)

---

## Layer 1: .ctx File Schema (YAML)

```yaml
# .ctx file schema v1
version: 1

summary: |
  5-15 lines describing what matters about this directory.
  Concise, high-signal, written for agents and humans.

key_files:
  - path: src/auth/handler.ts
    purpose: Main authentication request handler
    tags: [auth, api]
    verified_at: "abc1234"            # commit hash
    locked: false
    owner: null

contracts:
  - name: Auth API Contract
    scope:
      paths: ["src/auth/*"]
      tags: [security]
    content: |
      All auth endpoints MUST validate JWT tokens.
      Never store raw passwords; use bcrypt with cost 12.
    verified_at: "abc1234"
    locked: true
    owner: security

decisions:
  - id: adr-001
    title: Use JWT for session tokens
    status: accepted
    date: 2026-02-15
    rationale: |
      Stateless tokens reduce server-side session storage.
    alternatives:
      - name: Server-side sessions
        reason_rejected: Requires sticky sessions or shared store
    verified_at: "abc1234"
    locked: true
    owner: security

commands:
  build: pnpm build
  test: pnpm test
  lint: pnpm lint
  dev: pnpm dev

gotchas:
  - text: |
      The auth middleware silently swallows errors from
      expired tokens. Check handler.ts:42.
    tags: [auth, bugs]
    verified_at: "abc1234"
    locked: false

tags: [auth, api, typescript]

refs:
  - target: ../shared/.ctx
    sections: [contracts]
    reason: Shared API contracts apply here too

ignore:
  never_read: []
  never_log: [".env", "secrets/"]
```

### Entry-Level Metadata

Every item in `key_files`, `contracts`, `decisions`, and `gotchas`
carries:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `verified_at` | string | yes | Commit hash when last verified |
| `locked` | boolean | no | If true, auto-updates skip this entry |
| `owner` | string | no | Ownership tag (e.g., "security") |
| `tags` | string[] | no | Retrieval tags for scoring |

### .ctx Identity & Uniqueness

- A `.ctx` file is uniquely identified by its filesystem path
  relative to the repository root (e.g., `src/auth/.ctx`).
- Within a `.ctx` file, entries are identified by:
  - `key_files`: by `path` field (unique within file)
  - `contracts`: by `name` field (unique within file)
  - `decisions`: by `id` field (unique within file)
  - `gotchas`: by position index (stable ordering)

### Hierarchical Merge Rules

When loading context for directory `src/auth/`:
1. Load `src/auth/.ctx` (highest priority)
2. Load `src/.ctx` (parent)
3. Load `.ctx` (repo root, lowest priority)
4. Follow `refs` links at each level

**Merge semantics**:
- `summary`: child replaces parent (no merge)
- `key_files`: union; child overrides parent if same `path`
- `contracts`: union; child overrides parent if same `name`
- `decisions`: union; child overrides parent if same `id`
- `commands`: child overrides parent if same key
- `gotchas`: concatenated (child first)
- `tags`: union
- `ignore`: union (deny-list grows monotonically up the tree)

### Schema Versioning

- `version` field is required (integer, currently `1`).
- On load, if `version < CURRENT_VERSION`, auto-migrate in-place.
- Migration produces minimal diff (only added/renamed fields).
- Migration is non-destructive (no user content lost).

---

## Layer 2: SQLite Schema

### sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| repo_path | TEXT | NOT NULL | Absolute path to repo root |
| working_dir | TEXT | NOT NULL | CWD when session started |
| branch | TEXT | | Git branch name |
| agent_id | TEXT | | Agent identifier |
| agent_config | TEXT | | JSON: budget, mode overrides |
| status | TEXT | NOT NULL | "active" or "completed" |
| started_at | TEXT | NOT NULL | ISO 8601 timestamp |
| ended_at | TEXT | | ISO 8601 timestamp |

### request_events

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| session_id | TEXT | FK sessions | Parent session |
| request_text | TEXT | NOT NULL | The agent's request |
| context_pack | TEXT | NOT NULL | JSON: full Context Pack |
| omitted_items | TEXT | | JSON: omitted entries list |
| token_count | INTEGER | NOT NULL | Total tokens injected |
| budget | INTEGER | NOT NULL | Declared token budget |
| deep_read | TEXT | | JSON: deep-read decision + rationale |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |

### memory_diffs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| session_id | TEXT | FK sessions | Originating session |
| event_id | TEXT | FK request_events | Triggering event |
| ctx_path | TEXT | NOT NULL | Relative path to .ctx file |
| diff_content | TEXT | NOT NULL | Unified diff of proposed change |
| provenance | TEXT | NOT NULL | JSON: source file, commit, trigger |
| status | TEXT | NOT NULL | proposed/approved/rejected/applied |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| resolved_at | TEXT | | ISO 8601 timestamp |
| resolved_by | TEXT | | "user" or "auto-approve" |

### audit_log

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| ctx_path | TEXT | NOT NULL | Relative path to .ctx file |
| change_type | TEXT | NOT NULL | create/update/delete/migrate |
| diff_content | TEXT | NOT NULL | Unified diff of actual change |
| initiated_by | TEXT | NOT NULL | Session ID or "user" or "system" |
| reason | TEXT | NOT NULL | Human-readable justification |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |

### Indexes

```sql
CREATE INDEX idx_sessions_repo ON sessions(repo_path);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_events_session ON request_events(session_id);
CREATE INDEX idx_events_created ON request_events(created_at);
CREATE INDEX idx_diffs_status ON memory_diffs(status);
CREATE INDEX idx_diffs_ctx ON memory_diffs(ctx_path);
CREATE INDEX idx_audit_ctx ON audit_log(ctx_path);
CREATE INDEX idx_audit_created ON audit_log(created_at);
```

### Retention

- `sessions` + `request_events`: purge rows where
  `created_at < NOW - 30 days` (configurable).
- `audit_log`: purge rows where
  `created_at < NOW - 90 days` (configurable).
- `memory_diffs`: purge with parent session.
- Purge runs on daemon startup and daily via scheduler.

---

## Layer 3: Workspace Profile Schema

### Per-Repository Profile: `.ctxl/config.yaml`

```yaml
# .ctxl/config.yaml (in repo root, git-trackable)
version: 1

budget:
  default_tokens: 4000

scoring:
  mode: lexical             # "lexical" (MVP) or "hybrid" (v1)

ignore:
  never_read:
    - ".env"
    - "secrets/"
    - "node_modules/"
  never_log:
    - ".env"

agents:
  claude:
    budget_tokens: 8000
    mode: lexical
  copilot:
    budget_tokens: 2000

auto_approve:
  sections: []              # .ctx section names to auto-approve
  excluded_owners: [security]  # owners that always require review

retention:
  sessions_days: 30
  audit_days: 90
```

### Global Profile: `~/.ctxl/config.yaml`

```yaml
# ~/.ctxl/config.yaml (personal, not git-tracked)
version: 1

global_ctx: ~/.ctxl/global.ctx   # personal conventions
budget:
  default_tokens: 4000

ignore:
  never_read:
    - "~/.ssh/"
    - "~/.aws/credentials"
```

### Profile Precedence

1. Per-request override (highest)
2. Per-agent config in repo profile
3. Repo profile defaults
4. Global profile defaults
5. System defaults (4000 tokens, lexical mode)

---

## Entity State Transitions

### Memory Diff Lifecycle

```
proposed → approved → applied
    ↓         ↓
 rejected  (error → proposed)
```

### Session Lifecycle

```
active → completed
   ↓
 (daemon crash → stale; cleaned on restart)
```

### .ctx Entry Staleness

```
verified → stale (referenced file modified)
   ↑          ↓
   └── re-verified (user approves update or manually confirms)
```
