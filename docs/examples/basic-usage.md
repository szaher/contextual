# Basic Usage

This page walks through a simple example of using ctxl from scratch: creating a `.ctx` file, validating it, building a Context Pack, and understanding the output.

## Setting Up a Simple .ctx File

Start with a minimal `.ctx` file at your project root:

```yaml
# .ctx
version: 1
summary: |
  A REST API for managing user accounts.
  Built with Node.js, Hono, and SQLite.
  Authentication uses JWT with refresh token rotation.

key_files:
  - path: src/server.ts
    purpose: "HTTP server setup and middleware chain"
    tags: [server, http]
    verified_at: "2026-01-15"
    locked: false
    owner: null

  - path: src/routes/users.ts
    purpose: "User CRUD endpoints (GET/POST/PATCH/DELETE)"
    tags: [api, users]
    verified_at: "2026-01-15"
    locked: false
    owner: null

  - path: src/routes/auth.ts
    purpose: "Login, register, and token refresh endpoints"
    tags: [auth, login, jwt]
    verified_at: "2026-01-15"
    locked: false
    owner: null

  - path: src/db/schema.ts
    purpose: "Database schema definitions and migrations"
    tags: [database, schema]
    verified_at: "2026-01-15"
    locked: false
    owner: null

contracts: []

decisions:
  - id: ADR-001
    title: "Use Hono instead of Express"
    status: accepted
    date: "2026-01-10"
    rationale: "Lighter weight, supports edge runtimes, better TypeScript support"
    alternatives:
      - name: Express
        reason_rejected: "Heavier runtime, weaker TypeScript types"
    verified_at: "2026-01-15"
    locked: false
    owner: null

commands:
  build: "pnpm build"
  dev: "pnpm dev"
  test: "vitest run"
  lint: "eslint ."

gotchas:
  - text: "The CORS middleware must be registered BEFORE route handlers or preflight requests will fail silently."
    tags: [cors, middleware]
    verified_at: "2026-01-20"
    locked: false

  - text: "SQLite requires WAL mode to be enabled for concurrent reads. Set it in the connection setup, not per-query."
    tags: [sqlite, concurrency]
    verified_at: "2026-01-20"
    locked: false

tags: [typescript, api, hono, sqlite]

refs: []

ignore:
  never_read: [".env", ".env.local"]
  never_log: [".env"]
```

## Validating the .ctx File

Check that the file is structurally correct:

```bash
ctxkit validate
```

Expected output:

```
/path/to/project/.ctx is valid
```

With file existence checks:

```bash
ctxkit validate --check-files
```

If `src/db/schema.ts` does not exist, you would see:

```
Validation results for /path/to/project/.ctx:

  WARN   key_files: src/db/schema.ts: Referenced file does not exist: src/db/schema.ts

  0 error(s), 1 warning(s)
```

## Building a Context Pack

### Auth-Related Request

```bash
ctxkit inject --request "fix the login endpoint that returns 500 on invalid credentials"
```

Output:

```
Context Pack (680 / 4000 tokens)
----------------------------------------

Included (4 items):
  1. [LOCALITY_HIGH, TAG_MATCH]  .ctx -> key_files/src/routes/auth.ts (65 tok)
  2. [TAG_MATCH]                 .ctx -> decisions/ADR-001 (120 tok)
  3. [LOCALITY_HIGH]             .ctx -> key_files/src/server.ts (55 tok)
  4. [LOCALITY_HIGH]             .ctx -> summary (180 tok)

Omitted (4 items):
  - .ctx -> key_files/src/routes/users.ts (score: 0.38, reason: BUDGET_EXCEEDED)
  - .ctx -> key_files/src/db/schema.ts (score: 0.35, reason: BUDGET_EXCEEDED)
  - .ctx -> gotchas/gotcha_0 (score: 0.28, reason: LOW_SCORE)
  - .ctx -> gotchas/gotcha_1 (score: 0.22, reason: LOW_SCORE)
```

Notice how:
- `auth.ts` is included because "login" matches its tags
- `ADR-001` is included because "endpoint" partially matches the decision keywords
- The summary is included for general context
- Users and database files are omitted because they do not match "login" or "auth"

### Database-Related Request

```bash
ctxkit inject --request "add a migration to rename the email column"
```

Output:

```
Context Pack (520 / 4000 tokens)
----------------------------------------

Included (3 items):
  1. [TAG_MATCH]        .ctx -> key_files/src/db/schema.ts (60 tok)
  2. [LOCALITY_HIGH]    .ctx -> summary (180 tok)
  3. [TAG_MATCH]        .ctx -> gotchas/gotcha_1 (80 tok)

Omitted (5 items):
  - .ctx -> key_files/src/routes/auth.ts (score: 0.35, reason: BUDGET_EXCEEDED)
  ...
```

Now the database schema file and the SQLite gotcha are included, while auth-related entries are omitted.

### Low-Confidence Request

```bash
ctxkit inject --request "debug the failing test for the payment processor"
```

Output:

```
Context Pack (180 / 4000 tokens)
----------------------------------------

Included (1 items):
  1. [LOCALITY_HIGH]    .ctx -> summary (180 tok)

Omitted (6 items):
  - .ctx -> key_files/src/routes/auth.ts (score: 0.35, reason: BUDGET_EXCEEDED)
  ...

Deep Read: Deep-read triggered: Zero tag matches across all entries; User intent signals deep analysis: "debug"
```

Since "payment processor" does not match any tags, and "debug" is a deep-analysis keyword, the deep-read fallback triggers.

## Understanding Reason Codes

Each included item has reason codes explaining why it was selected:

| Code | Meaning in This Example |
|------|------------------------|
| `LOCALITY_HIGH` | The entry comes from `.ctx` in the same directory (or close parent) |
| `TAG_MATCH` | The entry's tags match keywords from the request text |

If you had contracts or pinned entries, you would also see `CONTRACT_REQUIRED` and `PINNED`.

## Understanding Budget Accounting

The Context Pack header shows token accounting:

```
Context Pack (680 / 4000 tokens)
```

- **680** -- total tokens used by included items
- **4000** -- declared budget ceiling
- Percentage: 17.0%

Each included item shows its individual token count, and omitted items show what they would have cost.

## Using Auto-Generated .ctx

Instead of writing `.ctx` by hand, use `ctxkit init`:

```bash
ctxkit init
```

This scans the directory and generates a `.ctx` file pre-populated from metadata. You can then edit it to add contracts, decisions, and gotchas that the scanner cannot discover automatically.

## Next Steps

- See a [Real-World Setup](/examples/real-world) with hierarchical contexts
- Learn the full [.ctx File Format](/guide/ctx-format) reference
- Understand the [Scoring Algorithm](/guide/scoring-algorithm) in depth
