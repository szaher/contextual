# Hierarchical Contexts

ctxl loads `.ctx` files from the working directory up through parent directories to the repository root. This hierarchical loading ensures that both specific (local) and broad (project-wide) knowledge are available, with clear rules for how entries merge and override.

## Loading Order

When you run a command from `src/auth/`, ctxl collects `.ctx` files in this order (child-first):

```
1. src/auth/.ctx       (highest priority)
2. src/.ctx
3. .ctx                (root, lowest priority)
```

Files are discovered by walking from the working directory up to the repository root (detected by the presence of a `.git` directory). Only directories that actually contain a `.ctx` file contribute; directories without one are silently skipped.

## Merge Rules

The merge processes files from root (lowest priority) to child (highest priority), applying these rules per section:

### Summary

The child's summary **replaces** the parent's. If the child has no summary (empty string), the parent's summary is inherited.

```yaml
# root .ctx
summary: "Full-stack web application with REST API and React frontend"

# src/auth/.ctx
summary: "Authentication module: JWT-based login, registration, token refresh"
```

Result when working from `src/auth/`: the auth-specific summary is used.

### Key Files

Union by path. Child entries **override** parent entries with the same `path`. Parent-only entries are inherited.

```yaml
# root .ctx
key_files:
  - path: package.json
    purpose: "Root package manifest"
  - path: tsconfig.json
    purpose: "TypeScript config"

# src/auth/.ctx
key_files:
  - path: login.ts
    purpose: "Login endpoint"
  - path: package.json
    purpose: "Auth module package manifest"  # overrides root entry
```

Result: `[login.ts, package.json (auth version), tsconfig.json]`

### Contracts

Union by name. Child contracts **override** parent contracts with the same `name`.

```yaml
# root .ctx
contracts:
  - name: error-handling
    content: "All endpoints must return structured error responses"

# src/auth/.ctx
contracts:
  - name: error-handling
    content: "Auth endpoints must return 401 for invalid credentials, never leak internal details"
```

Result: the auth-specific `error-handling` contract is used.

### Decisions

Union by ID. Child decisions **override** parent decisions with the same `id`.

### Commands

Child commands **override** parent commands with the same key. This uses simple object spread: `{ ...parent.commands, ...child.commands }`.

```yaml
# root .ctx
commands:
  build: "pnpm build"
  test: "pnpm test"

# src/auth/.ctx
commands:
  test: "vitest run src/auth/"  # overrides root test command
  seed: "node scripts/seed-auth.js"  # new command
```

Result: `{ build: "pnpm build", test: "vitest run src/auth/", seed: "node scripts/seed-auth.js" }`

### Gotchas

**Concatenated**, child first. No deduplication -- all gotchas from all levels are included.

```yaml
# root .ctx
gotchas:
  - text: "Do not use console.log in production code"

# src/auth/.ctx
gotchas:
  - text: "Auth middleware must run before CORS"
```

Result: `["Auth middleware must run before CORS", "Do not use console.log in production code"]`

### Tags

**Union** (deduplicated). All tags from all levels are combined.

```yaml
# root .ctx
tags: [typescript, api]

# src/auth/.ctx
tags: [auth, jwt]
```

Result: `[typescript, api, auth, jwt]`

### Refs

**Concatenated**, child first. All refs from all levels are included. Refs are followed during loading with cycle detection.

### Ignore

**Union** (deny-list grows monotonically). This is a critical design choice: if a parent says "never read `.env`", no child can override that. Ignore rules accumulate and can never be removed down the hierarchy.

```yaml
# root .ctx
ignore:
  never_read: [".env", "secrets/*"]

# src/auth/.ctx
ignore:
  never_read: ["test-fixtures/*"]
```

Result: `never_read: [".env", "secrets/*", "test-fixtures/*"]`

## Cross-References (Refs)

Refs allow a `.ctx` file to pull entries from another `.ctx` file without duplicating content:

```yaml
# src/auth/.ctx
refs:
  - target: "../shared/.ctx"
    sections: [contracts, decisions]
    reason: "Shared API contracts apply to auth endpoints"
```

When ctxl processes refs, it:

1. Resolves the target path relative to the `.ctx` file's directory
2. Checks for cycles (if the target was already visited, it emits a warning and skips)
3. Loads and parses the target `.ctx` file
4. Includes the target's entries in the merge
5. Recursively follows the target's refs (up to a maximum depth of 10)

### Cycle Detection

ctxl tracks visited `.ctx` file paths and detects cycles:

```
src/a/.ctx  -refs->  src/b/.ctx  -refs->  src/a/.ctx
                                           ^ Circular reference detected (skipped)
```

The warning is included in the `MergedContext.warnings` array but does not cause an error.

### Max Ref Depth

To prevent runaway reference chains, ctxl limits ref following to 10 levels deep (configurable via `maxRefDepth` in `MergeOptions`). Exceeding this produces a warning.

## Practical Patterns

### Shared Contracts

Place shared contracts in a common `.ctx` file and reference it from multiple directories:

```
shared/
  .ctx          # Contains cross-cutting contracts
src/
  auth/
    .ctx        # refs: [../../shared/.ctx]
  api/
    .ctx        # refs: [../../shared/.ctx]
```

### Layered Commands

Root-level `.ctx` contains project-wide commands, and each directory overrides with more specific ones:

```yaml
# root .ctx
commands:
  build: "pnpm build"
  test: "pnpm test"

# packages/core/.ctx
commands:
  test: "vitest run packages/core/"
  build: "tsc -p packages/core/tsconfig.json"
```

### Scoped Gotchas

General gotchas at the root, specific gotchas at the module level. Since gotchas concatenate rather than override, agents always see both levels:

```yaml
# root .ctx
gotchas:
  - text: "Always use UTC for timestamps stored in the database"

# src/auth/.ctx
gotchas:
  - text: "JWT expiration must be checked BEFORE signature verification for performance"
```

## API Reference

The merge function signature:

```typescript
function mergeCtxHierarchy(options: MergeOptions): MergedContext

interface MergeOptions {
  workingDir: string;    // Directory to start loading from
  repoRoot: string;      // Repository root directory
  maxRefDepth?: number;  // Maximum ref following depth (default: 10)
  ignorePolicy?: IgnorePolicy;  // Additional ignore rules to apply
}

interface MergedContext {
  ctx: CtxFile;          // The merged .ctx data
  sources: string[];     // Contributing .ctx file paths (relative to repo root)
  warnings: string[];    // Warnings (cycles, max depth, parse errors)
}
```

## Next Steps

- Learn how merged entries are [scored for relevance](/guide/scoring-algorithm)
- Understand how [contracts are enforced](/guide/contracts) across scopes
- See how [drift detection](/guide/drift-detection) works with hierarchical contexts
