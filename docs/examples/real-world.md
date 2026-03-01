# Real-World Setup

This example shows a complete ctxl setup for a real project: a TypeScript monorepo with multiple packages, hierarchical `.ctx` files, contracts, profiles, and agent integration.

## Project Structure

```
my-app/
  .ctx                           # Root-level context
  .ctxl/
    config.yaml                  # Workspace profile
  packages/
    api/
      .ctx                       # API package context
      src/
        routes/
          .ctx                   # Routes-specific context
          users.ts
          auth.ts
          orders.ts
        middleware/
          auth.ts
          rate-limit.ts
        db/
          .ctx                   # Database context
          schema.ts
          migrations/
    shared/
      .ctx                       # Shared contracts and types
      src/
        types.ts
        validators.ts
    web/
      .ctx                       # Web frontend context
      src/
        App.tsx
        pages/
```

## Root .ctx

The root `.ctx` captures project-wide knowledge:

```yaml
# .ctx
version: 1
summary: |
  E-commerce platform monorepo with 3 packages:
  - api: REST API (Hono + SQLite)
  - shared: Types and validators
  - web: React frontend (Vite)
  Uses pnpm workspaces. TypeScript 5.x throughout.

key_files:
  - path: package.json
    purpose: "Root package manifest with workspace scripts"
    tags: [config]
    verified_at: "2026-02-01"
    locked: false
    owner: null
  - path: pnpm-workspace.yaml
    purpose: "Workspace package definitions"
    tags: [config, monorepo]
    verified_at: "2026-02-01"
    locked: false
    owner: null
  - path: tsconfig.json
    purpose: "Root TypeScript config with project references"
    tags: [config, typescript]
    verified_at: "2026-02-01"
    locked: false
    owner: null

contracts:
  - name: code-quality
    scope:
      paths: ["packages/**"]
      tags: [code, quality]
    content: |
      All code must:
      1. Pass eslint with zero warnings
      2. Pass prettier format check
      3. Have TypeScript strict mode enabled
      4. Not use 'any' type without a comment explaining why
    verified_at: "2026-02-01"
    locked: true
    owner: null

decisions:
  - id: ADR-001
    title: "Monorepo with pnpm workspaces"
    status: accepted
    date: "2026-01-05"
    rationale: "Shared types and validators across API and web. pnpm for fast installs and strict dependency resolution."
    alternatives:
      - name: Separate repositories
        reason_rejected: "Duplicated types, version sync overhead"
      - name: npm workspaces
        reason_rejected: "Slower installs, less strict hoisting"
    verified_at: "2026-02-01"
    locked: false
    owner: null

  - id: ADR-002
    title: "SQLite for data storage"
    status: accepted
    date: "2026-01-05"
    rationale: "Zero deployment overhead, ACID transactions, excellent read performance for single-server deployments."
    alternatives:
      - name: PostgreSQL
        reason_rejected: "Requires separate process, overkill for MVP"
    verified_at: "2026-02-01"
    locked: false
    owner: null

commands:
  build: "pnpm -r build"
  dev: "pnpm -r --parallel dev"
  test: "vitest run"
  lint: "eslint ."
  format: "prettier --write ."
  clean: "pnpm -r clean"

gotchas:
  - text: "pnpm workspace dependencies must use 'workspace:*' protocol, not version ranges"
    tags: [pnpm, dependencies]
    verified_at: "2026-02-01"
    locked: false
  - text: "Build order matters: shared must build before api and web (handled by pnpm -r)"
    tags: [build, monorepo]
    verified_at: "2026-02-01"
    locked: false

tags: [typescript, monorepo, pnpm, ecommerce]

refs: []

ignore:
  never_read: [".env", ".env.*", "*.pem", ".aws/*"]
  never_log: [".env", ".env.local"]
```

## Shared Package .ctx

The shared package contains types and validators used by both API and web. Its `.ctx` defines contracts that apply to both consumers:

```yaml
# packages/shared/.ctx
version: 1
summary: |
  Shared types and validators used by both API and web packages.
  Contains Zod schemas for all API request/response types.
  Source of truth for type definitions.

key_files:
  - path: src/types.ts
    purpose: "All shared TypeScript interfaces and type aliases"
    tags: [types, shared]
    verified_at: "2026-02-01"
    locked: true
    owner: null
  - path: src/validators.ts
    purpose: "Zod schemas for runtime validation of API payloads"
    tags: [validation, zod, shared]
    verified_at: "2026-02-01"
    locked: false
    owner: null

contracts:
  - name: type-compatibility
    scope:
      paths: ["packages/shared/src/**"]
      tags: [types, shared]
    content: |
      Breaking changes to shared types require updating BOTH api and web packages.
      Before modifying any exported type:
      1. Search for all usages across packages/api and packages/web
      2. Update all consumers in the same PR
      3. Run full test suite: pnpm test
    verified_at: "2026-02-01"
    locked: true
    owner: null

  - name: validator-schema-sync
    scope:
      paths: ["packages/shared/src/validators.ts", "packages/shared/src/types.ts"]
      tags: [validation, types]
    content: |
      Every TypeScript interface in types.ts must have a corresponding Zod schema
      in validators.ts. They must be kept in sync. When adding a new type:
      1. Define the interface in types.ts
      2. Create the Zod schema in validators.ts
      3. Add a test verifying they match
    verified_at: "2026-02-01"
    locked: true
    owner: null

decisions: []
commands:
  build: "tsc -p tsconfig.json"
  test: "vitest run"

gotchas:
  - text: "Zod schemas must use .strict() to reject unknown properties in API payloads"
    tags: [zod, validation]
    verified_at: "2026-02-01"
    locked: false

tags: [types, validation, zod, shared]
refs: []
ignore:
  never_read: []
  never_log: []
```

## API Package .ctx

```yaml
# packages/api/.ctx
version: 1
summary: |
  REST API built with Hono. Handles user management, authentication,
  and order processing. Uses SQLite via better-sqlite3.
  All endpoints return JSON with consistent error format.

key_files:
  - path: src/server.ts
    purpose: "Hono app setup, middleware registration, route mounting"
    tags: [server, hono]
    verified_at: "2026-02-01"
    locked: false
    owner: null
  - path: src/middleware/auth.ts
    purpose: "JWT validation middleware, extracts user from token"
    tags: [auth, jwt, middleware]
    verified_at: "2026-02-01"
    locked: false
    owner: null
  - path: src/middleware/rate-limit.ts
    purpose: "Token bucket rate limiter, per-IP and per-user"
    tags: [rate-limit, middleware, security]
    verified_at: "2026-02-01"
    locked: false
    owner: null

contracts:
  - name: api-error-format
    scope:
      paths: ["packages/api/src/routes/**"]
      tags: [api, error]
    content: |
      All API errors must return:
      {
        "error": {
          "code": "MACHINE_READABLE_CODE",
          "message": "Human-readable description"
        }
      }
      Status codes: 400 (bad input), 401 (unauthenticated), 403 (forbidden),
      404 (not found), 409 (conflict), 429 (rate limited), 500 (internal).
    verified_at: "2026-02-01"
    locked: true
    owner: api-team

  - name: auth-security
    scope:
      paths: ["packages/api/src/routes/auth*", "packages/api/src/middleware/auth*"]
      tags: [auth, security, jwt]
    content: |
      Authentication requirements:
      1. JWT tokens expire after 15 minutes
      2. Refresh tokens expire after 7 days and are single-use
      3. Failed login attempts are logged (but not the password)
      4. Rate limit: 10 failed attempts per IP per hour
      5. Never return internal error details in auth responses
    verified_at: "2026-02-01"
    locked: true
    owner: security-team

decisions:
  - id: ADR-003
    title: "Use JWT with refresh token rotation"
    status: accepted
    date: "2026-01-08"
    rationale: "Stateless auth (no session store needed), rotation limits exposure window of compromised tokens."
    alternatives:
      - name: Session cookies
        reason_rejected: "Requires session store, does not work well with mobile clients"
      - name: JWT without refresh
        reason_rejected: "Long-lived tokens are a security risk"
    verified_at: "2026-02-01"
    locked: false
    owner: null

commands:
  dev: "tsx watch src/server.ts"
  build: "tsc && node dist/server.js"
  test: "vitest run"
  seed: "tsx scripts/seed.ts"

gotchas:
  - text: "The auth middleware must be registered BEFORE route handlers. Hono processes middleware in registration order."
    tags: [auth, middleware, hono]
    verified_at: "2026-02-01"
    locked: false
  - text: "better-sqlite3 operations are synchronous. Do not wrap in async/await or Promises -- it adds overhead with no benefit."
    tags: [sqlite, performance]
    verified_at: "2026-02-01"
    locked: false

tags: [api, hono, jwt, sqlite, rest]

refs:
  - target: "../shared/.ctx"
    sections: [contracts]
    reason: "Shared type contracts apply to API endpoints"

ignore:
  never_read: [".env", "test/fixtures/credentials*"]
  never_log: [".env"]
```

## API Routes .ctx

Deeper in the API package, the routes directory has its own `.ctx` with specific knowledge:

```yaml
# packages/api/src/routes/.ctx
version: 1
summary: |
  API route handlers. Each file exports a Hono router.
  Routes are mounted in server.ts.
  All routes use shared validators for input validation.

key_files:
  - path: users.ts
    purpose: "User CRUD: GET /users, GET /users/:id, POST /users, PATCH /users/:id, DELETE /users/:id"
    tags: [users, api, crud]
    verified_at: "2026-02-15"
    locked: false
    owner: null
  - path: auth.ts
    purpose: "Auth endpoints: POST /auth/login, POST /auth/register, POST /auth/refresh, POST /auth/logout"
    tags: [auth, login, jwt]
    verified_at: "2026-02-15"
    locked: false
    owner: null
  - path: orders.ts
    purpose: "Order management: POST /orders, GET /orders, GET /orders/:id, PATCH /orders/:id/status"
    tags: [orders, api]
    verified_at: "2026-02-15"
    locked: false
    owner: null

contracts: []
decisions: []
commands: {}

gotchas:
  - text: "The orders.ts file uses database transactions for status transitions. Always call db.transaction() not individual statements."
    tags: [orders, database, transactions]
    verified_at: "2026-02-15"
    locked: false

tags: [routes, api, hono]
refs: []
ignore:
  never_read: []
  never_log: []
```

## Database .ctx

```yaml
# packages/api/src/db/.ctx
version: 1
summary: |
  Database layer using better-sqlite3.
  Schema defined in schema.ts, migrations in migrations/.
  Uses WAL mode for concurrent read access.

key_files:
  - path: schema.ts
    purpose: "Table definitions, indices, and initial seed data"
    tags: [database, schema, sqlite]
    verified_at: "2026-02-15"
    locked: false
    owner: null

contracts:
  - name: migration-rules
    scope:
      paths: ["packages/api/src/db/migrations/**"]
      tags: [database, migration]
    content: |
      Migration rules:
      1. Never drop columns without a 2-release deprecation period
      2. Add indices for columns used in WHERE clauses
      3. Use db.transaction() for multi-statement migrations
      4. Test migrations against a copy of production data
    verified_at: "2026-02-15"
    locked: true
    owner: null

decisions: []

commands:
  migrate: "tsx scripts/migrate.ts"
  seed: "tsx scripts/seed.ts"

gotchas:
  - text: "Enable WAL mode ONCE at database open, not per-connection: db.pragma('journal_mode = WAL')"
    tags: [sqlite, wal, performance]
    verified_at: "2026-02-15"
    locked: false

tags: [database, sqlite, migrations]
refs: []
ignore:
  never_read: []
  never_log: []
```

## Workspace Profile

```yaml
# .ctxl/config.yaml
version: 1
budget:
  default_tokens: 6000
scoring:
  mode: lexical
ignore:
  never_read:
    - ".env"
    - ".env.*"
    - "*.pem"
    - ".aws/*"
    - "test/fixtures/credentials*"
  never_log:
    - ".env"
    - ".env.local"
agents:
  claude:
    budget_tokens: 12000
    mode: lexical
  copilot:
    budget_tokens: 4000
    mode: lexical
auto_approve:
  sections:
    - key_files
    - gotchas
  excluded_owners:
    - security-team
retention:
  sessions_days: 14
  audit_days: 60
```

## How Hierarchical Merge Works

When an agent works from `packages/api/src/routes/`:

```
packages/api/src/routes/.ctx   (highest priority)
packages/api/.ctx
.ctx                            (root, lowest priority)
```

The merged context includes:
- **Summary**: routes-specific summary (overrides parent)
- **Key files**: `users.ts`, `auth.ts`, `orders.ts` (routes) + `server.ts`, auth middleware, rate-limit middleware (api) + `package.json`, `pnpm-workspace.yaml` (root)
- **Contracts**: `api-error-format`, `auth-security` (api) + `code-quality` (root) + `type-compatibility`, `validator-schema-sync` (shared, via ref)
- **Decisions**: `ADR-003` (api) + `ADR-001`, `ADR-002` (root)
- **Commands**: routes has none, so inherits api commands (overridden test/dev) + root commands
- **Gotchas**: all gotchas from all levels concatenated
- **Tags**: union of all tags

## Scoring Example

Request from `packages/api/src/routes/`: "fix the auth endpoint that returns wrong error format"

| Entry | Locality | Tag Score | Other | Final Score | Reason Codes |
|-------|----------|-----------|-------|-------------|-------------|
| auth-security contract | 0.8 | 0.5 | CONTRACT_REQUIRED | 0.9 | LOCALITY_HIGH, TAG_MATCH, CONTRACT_REQUIRED |
| api-error-format contract | 0.8 | 0.5 | CONTRACT_REQUIRED | 0.9 | LOCALITY_HIGH, TAG_MATCH, CONTRACT_REQUIRED |
| auth.ts (routes) | 1.0 | 1.0 | -- | 0.88 | LOCALITY_HIGH, TAG_MATCH |
| auth middleware | 0.8 | 0.5 | -- | 0.67 | LOCALITY_HIGH, TAG_MATCH |
| routes summary | 1.0 | -- | -- | 0.5 | LOCALITY_HIGH |
| ADR-003 (JWT) | 0.8 | 0.4 | -- | 0.5 | LOCALITY_HIGH, TAG_MATCH |
| root summary | 0.4 | -- | -- | 0.2 | -- |

Both security contracts are included first (budget priority), then remaining entries by score.

## Running with an Agent

```bash
# Start daemon
ctxkit daemon start

# Run agent from the routes directory
cd packages/api/src/routes
ctxkit run --agent claude --budget 12000 \
  --request "fix the auth endpoint error format" \
  -- claude-code

# Check the session afterward
ctxkit sessions
ctxkit sessions show <session-id>

# Check for drift after changes
ctxkit drift
```

## CI Integration

Add drift detection to CI:

```yaml
# .github/workflows/ci.yml
jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm build
      - run: pnpm lint
      - run: pnpm test

  ctx-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm build
      - name: Check .ctx drift
        run: npx ctxkit drift
      - name: Validate all .ctx files
        run: |
          find . -name ".ctx" -not -path "*/node_modules/*" | while read f; do
            npx ctxkit validate "$f" --check-files
          done
```

## Key Takeaways

1. **Root .ctx** provides project-wide knowledge (tech stack, build commands, architectural decisions)
2. **Package .ctx files** add domain-specific contracts and gotchas
3. **Directory .ctx files** provide granular, file-level knowledge
4. **Contracts** ensure safety invariants are always injected when relevant code is touched
5. **Refs** let packages pull shared contracts without duplicating content
6. **Profiles** configure per-agent budgets and ignore policies
7. **Drift detection in CI** catches stale context early
