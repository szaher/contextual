# Contracts

Contracts define invariants, API rules, and safety constraints that must be injected when code in their scope is touched. Unlike regular entries that compete on score alone, contracts receive budget priority and are included before all non-contract items.

## What Contracts Are For

Contracts are ideal for:

- **Security rules** -- "All auth endpoints must validate JWT tokens"
- **API compatibility** -- "The /api/v1/users response must include `id`, `email`, and `created_at`"
- **Architectural invariants** -- "Never import from `internal/` outside the package boundary"
- **Performance constraints** -- "Database queries must use indices; no table scans on tables over 1M rows"

The key property: if an agent is working on code that falls within a contract's scope, the contract content is injected automatically, ensuring the agent respects the constraint.

## Defining a Contract

```yaml
contracts:
  - name: auth-security
    scope:
      paths: ["src/auth/**", "src/middleware/auth*"]
      tags: [auth, security, jwt]
    content: |
      All authentication endpoints must:
      1. Validate JWT signature and expiration before processing
      2. Apply rate limiting (100 req/min per IP)
      3. Log failed authentication attempts to the audit trail
      4. Never return raw error stack traces to the client
      5. Use constant-time comparison for token validation
    verified_at: "abc1234"
    locked: true
    owner: security-team
```

### Scope

The `scope` field defines when this contract is triggered. It has two sub-fields:

**`scope.paths`** -- Glob patterns matched against touched files:

| Pattern | Matches |
|---------|---------|
| `src/auth/*` | Files directly in `src/auth/` |
| `src/auth/**` | Files recursively under `src/auth/` |
| `src/auth/**/*` | Same as above |
| `src/middleware/auth*` | Files in `src/middleware/` starting with "auth" |
| `src/auth/login.ts` | Exact file match |

**`scope.tags`** -- Tags matched against request keywords:

```yaml
scope:
  tags: [auth, security, jwt, login]
```

When request keywords match these tags with a score >= 0.5, the contract is triggered via tag matching.

### Triggering

A contract becomes `CONTRACT_REQUIRED` in two ways:

1. **Path match** -- Any file in `touchedFiles` matches a `scope.paths` glob pattern. Score is boosted to at least **0.95**.

2. **Tag match** -- Request keywords match `scope.tags` with a tag score >= 0.5. Score is boosted to at least **0.9**.

Both mechanisms add the `CONTRACT_REQUIRED` reason code.

## Budget Priority

Contracts with `CONTRACT_REQUIRED` are processed **before** all non-contract entries during budget application:

```
1. Partition entries into contracts and non-contracts
2. Include all CONTRACT_REQUIRED entries (even if they exceed budget)
3. Fill remaining budget with non-contract entries by score
```

If a required contract exceeds the remaining budget, it is **still included** with a warning logged to stderr. This is by design: safety invariants should not be silently dropped due to budget pressure.

## Locking Contracts

Contracts are often locked to prevent automated proposals from modifying them:

```yaml
contracts:
  - name: security-policy
    locked: true
    owner: security-team
    # ...
```

When `locked: true`:
- Automated proposals skip this contract entirely
- Drift detection warns about stale locked contracts but does not propose changes
- The `PINNED` reason code is added, boosting the minimum score to 0.8
- Manual edits via the `.ctx` file are still possible

## Ownership

The `owner` field assigns responsibility:

```yaml
contracts:
  - name: api-compatibility
    owner: api-team
    # ...
```

Owners interact with the auto-approve system. When auto-approve is configured with `excluded_owners`, proposals affecting entries owned by those teams require manual review:

```yaml
# .ctxl/config.yaml
auto_approve:
  sections: [key_files, gotchas]
  excluded_owners: [security-team, compliance]
```

## Contract Validation

The `ctxkit validate` command checks contracts for:

- **Required field**: `name` must be non-empty and unique
- **Content warning**: empty `content` is flagged
- **Scope warning**: empty scope (no paths AND no tags) is flagged

```bash
ctxkit validate --check-files
```

## Contract in Hierarchical Context

Contracts follow the standard merge rules: child contracts override parent contracts with the same `name`. This allows a subdirectory to specialize a project-wide contract:

```yaml
# root .ctx
contracts:
  - name: error-handling
    scope:
      paths: ["src/**"]
      tags: [api]
    content: "All endpoints must return JSON error responses with 'code' and 'message'"

# src/auth/.ctx
contracts:
  - name: error-handling
    scope:
      paths: ["src/auth/**"]
      tags: [auth]
    content: |
      Auth endpoints must return JSON error responses with:
      - 401 for invalid credentials (never 403)
      - 429 for rate-limited requests
      - Never include internal error details
```

When working from `src/auth/`, the auth-specific `error-handling` contract is used.

## Examples

### API Compatibility Contract

```yaml
contracts:
  - name: api-v1-users
    scope:
      paths: ["src/routes/users*", "src/models/user*"]
      tags: [api, users]
    content: |
      GET /api/v1/users/:id response schema:
      {
        "id": string (UUID),
        "email": string,
        "name": string,
        "created_at": string (ISO 8601),
        "role": "admin" | "user" | "viewer"
      }
      Breaking changes require a new API version.
    verified_at: "def5678"
    locked: true
    owner: api-team
```

### Database Invariant Contract

```yaml
contracts:
  - name: db-migration-rules
    scope:
      paths: ["src/db/migrations/**", "src/models/**"]
      tags: [database, migration, schema]
    content: |
      Migration rules:
      1. All migrations must be reversible (include down())
      2. Never drop columns in production without a 2-release deprecation period
      3. Add indices for any column used in WHERE clauses on tables > 100k rows
      4. Use transactions for multi-statement migrations
    verified_at: "2026-02-01"
    locked: true
    owner: null
```

## Next Steps

- Understand the full [Scoring Algorithm](/guide/scoring-algorithm) that ranks contracts
- Learn about [Budget Management](/guide/budget-management) and contract priority
- Read about [Security](/guide/security) for secret redaction in contract content
