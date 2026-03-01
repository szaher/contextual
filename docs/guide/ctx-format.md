# .ctx File Format

The `.ctx` file is a YAML document that serves as the memory index for a directory. This page is the complete reference for all supported fields.

## Schema Overview

```yaml
version: 1
summary: "Brief description of this directory's purpose and key concerns"

key_files:
  - path: src/auth/login.ts
    purpose: "Handles user authentication flow"
    tags: [auth, login]
    verified_at: "2026-01-15"
    locked: false
    owner: null

contracts:
  - name: auth-api
    scope:
      paths: ["src/auth/*"]
      tags: [auth]
    content: "All auth endpoints must validate JWT tokens..."
    verified_at: "abc1234"
    locked: true
    owner: security-team

decisions:
  - id: ADR-001
    title: "Use Hono instead of Express"
    status: accepted
    date: "2026-01-10"
    rationale: "Hono is lighter, supports edge runtimes..."
    alternatives:
      - name: Express
        reason_rejected: "Heavier, no edge runtime support"
      - name: Fastify
        reason_rejected: "Plugin ecosystem less mature for our use case"
    verified_at: "def5678"
    locked: false
    owner: null

commands:
  build: "pnpm build"
  test: "pnpm test"
  dev: "pnpm dev"
  lint: "pnpm lint"

gotchas:
  - text: "The auth middleware must run before CORS middleware"
    tags: [auth, middleware]
    verified_at: "2026-02-01"
    locked: false

tags: [typescript, auth, api]

refs:
  - target: "../shared/.ctx"
    sections: [contracts, decisions]
    reason: "Shared API contracts apply here"

ignore:
  never_read: [".env", "secrets/*"]
  never_log: [".env.local"]
```

## Field Reference

### `version` (required)

The schema version number. Currently `1`.

```yaml
version: 1
```

The parser validates this against `CURRENT_CTX_VERSION`. Files with unknown versions produce a validation error.

### `summary` (required)

A brief text description of the directory's purpose. Aim for 5-15 lines that capture what matters most. This field is required and must not be empty.

```yaml
summary: |
  Authentication module handling user login, registration, and token management.
  Uses JWT for session tokens with refresh token rotation.
  All endpoints require rate limiting (see contracts).
```

During scoring, the summary receives a base score equal to `locality * 0.5` and is always included when the `.ctx` file is close to the working directory.

### `key_files`

An array of file entries that map paths to purposes. Each entry describes a file that matters in this directory.

```yaml
key_files:
  - path: src/auth/login.ts
    purpose: "Main login endpoint - validates credentials, issues JWT"
    tags: [auth, login, jwt]
    verified_at: "2026-01-15"
    locked: false
    owner: null
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | Relative path from the `.ctx` file's directory |
| `purpose` | string | no (warned) | What this file does and why it matters |
| `tags` | string[] | no | Tags for matching against request keywords |
| `verified_at` | string | no | Date or commit hash when this entry was last verified |
| `locked` | boolean | no | If `true`, automated proposals skip this entry |
| `owner` | string or null | no | Team or person responsible for this entry |

Validation rules:
- Paths must be unique within a `.ctx` file
- Empty `purpose` generates a warning
- With `--check-files`, the validator confirms the file exists on disk

### `contracts`

Contracts define invariants and API rules that must be injected when code in matching scope is touched. They receive budget priority over non-contract entries.

```yaml
contracts:
  - name: security-policy
    scope:
      paths: ["src/auth/**", "src/middleware/auth*"]
      tags: [auth, security]
    content: |
      All authentication endpoints must:
      1. Validate JWT signature and expiration
      2. Apply rate limiting (100 req/min per IP)
      3. Log failed attempts to audit trail
      4. Never return raw error details to client
    verified_at: "abc1234"
    locked: true
    owner: security-team
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique identifier for this contract |
| `scope.paths` | string[] | no (warned if empty) | Glob patterns for file paths that trigger this contract |
| `scope.tags` | string[] | no (warned if empty) | Tags that trigger this contract when matched |
| `content` | string | no (warned) | The actual contract text to inject |
| `verified_at` | string | no | Commit hash or date of last verification |
| `locked` | boolean | no | Prevent automated edits |
| `owner` | string or null | no | Responsible team or person |

Contract scope matching uses glob patterns:
- `src/auth/*` -- matches files directly in `src/auth/`
- `src/auth/**` or `src/auth/**/*` -- matches files recursively under `src/auth/`
- Exact paths also match: `src/auth/login.ts`

When a contract's scope matches touched files or request keywords, it receives the `CONTRACT_REQUIRED` reason code and a minimum score of 0.9-0.95, ensuring it is included before non-contract items.

### `decisions`

Lightweight ADR (Architecture Decision Record) entries. Capture the decision, the rationale, the alternatives considered, and why they were rejected.

```yaml
decisions:
  - id: ADR-003
    title: "Use SQLite for session storage"
    status: accepted
    date: "2026-01-20"
    rationale: |
      SQLite provides ACID transactions, zero deployment overhead,
      and excellent read performance for our local-first model.
    alternatives:
      - name: PostgreSQL
        reason_rejected: "Requires separate server process"
      - name: LevelDB
        reason_rejected: "No SQL query support for audit queries"
    verified_at: "ghi9012"
    locked: false
    owner: null
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier (e.g., `ADR-001`) |
| `title` | string | no (warned) | Short description of the decision |
| `status` | string | no | One of: `accepted`, `deprecated`, `superseded` |
| `date` | string | no | When the decision was made |
| `rationale` | string | no | Why this decision was chosen |
| `alternatives` | array | no | Other options considered |
| `alternatives[].name` | string | yes | Name of the alternative |
| `alternatives[].reason_rejected` | string | yes | Why it was not chosen |
| `verified_at` | string | no | Commit hash or date |
| `locked` | boolean | no | Prevent automated edits |
| `owner` | string or null | no | Decision owner |

### `commands`

A flat map of command names to shell commands. These are extracted from `package.json` scripts during `ctxkit init` but can also be written by hand.

```yaml
commands:
  build: "pnpm build"
  test: "vitest run"
  dev: "pnpm dev"
  lint: "eslint ."
  format: "prettier --write ."
  migrate: "node scripts/migrate.js"
```

### `gotchas`

Known issues, sharp edges, and things that commonly trip people up. These are especially valuable for AI agents that might not discover edge cases on their own.

```yaml
gotchas:
  - text: "The auth middleware must run BEFORE the CORS middleware or preflight requests fail silently"
    tags: [auth, middleware, cors]
    verified_at: "2026-02-01"
    locked: false

  - text: "SQLite WAL mode must be enabled before any concurrent reads, or you get SQLITE_BUSY errors"
    tags: [sqlite, concurrency]
    verified_at: "2026-02-15"
    locked: false
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | yes | The gotcha description |
| `tags` | string[] | no | Tags for retrieval matching |
| `verified_at` | string | no | Date or commit hash |
| `locked` | boolean | no | Prevent automated edits |

### `tags`

Top-level tags for the entire `.ctx` file. These are used during hierarchical merge (union of parent and child tags) and influence tag-matching scores.

```yaml
tags: [typescript, auth, api, hono]
```

### `refs`

Cross-references to other `.ctx` files. When ctxl loads a `.ctx` file, it follows `refs` and includes entries from the referenced files, subject to cycle detection and a maximum depth of 10.

```yaml
refs:
  - target: "../shared/.ctx"
    sections: [contracts, decisions]
    reason: "Shared API contracts and decisions apply here"

  - target: "../../root/.ctx"
    sections: [commands]
    reason: "Root build commands needed for CI"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `target` | string | yes | Relative path to the referenced `.ctx` file |
| `sections` | string[] | no (warned) | Which sections to pull from the referenced file |
| `reason` | string | no | Why this reference exists |

### `ignore`

Policies for paths that should never be read or logged. These grow monotonically during hierarchical merge (deny-list semantics -- child ignore rules are unioned with parent rules).

```yaml
ignore:
  never_read:
    - ".env"
    - ".env.local"
    - "secrets/*"
    - "*.pem"
  never_log:
    - ".env"
    - "credentials.json"
```

## YAML Gotchas

When writing `.ctx` files, watch out for these common YAML issues:

**Multiline strings**: Use `|` for block literals that preserve newlines:

```yaml
summary: |
  This is a multi-line summary.
  Each line is preserved as-is.
  Indentation matters.
```

**Strings that look like other types**: YAML auto-detects types. Wrap in quotes if needed:

```yaml
# BAD: YAML interprets "true" as boolean
locked: true  # This is fine, it IS a boolean

# BAD: YAML interprets "1.0" as a number
version: 1  # This is fine, it IS a number

# Watch out: these need quotes
verified_at: "2026-01-15"  # Could be parsed as date without quotes
```

**Empty arrays**: Use `[]` for empty inline arrays:

```yaml
tags: []
refs: []
```

**Special characters in strings**: Wrap in quotes if the value contains `:`, `#`, `{`, `}`, `[`, `]`, or starts with `*`, `&`, `!`:

```yaml
purpose: "Handles auth flow: login, register, and token refresh"
```

## File Location

`.ctx` files are always named exactly `.ctx` (with the leading dot). They sit in the directory they describe:

```
project/
  .ctx                    # Root-level context
  src/
    .ctx                  # src-level context
    auth/
      .ctx                # Auth module context
      login.ts
      register.ts
    db/
      .ctx                # Database layer context
      migrations/
        .ctx              # Migrations-specific context
```

## Next Steps

- Learn how `.ctx` files at different levels are [merged hierarchically](/guide/hierarchical-contexts)
- Understand how entries are [scored for relevance](/guide/scoring-algorithm)
- See [real-world examples](/examples/real-world) of complete `.ctx` setups
