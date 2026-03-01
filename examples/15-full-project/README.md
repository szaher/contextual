# Example 15: Full Real-World Project

## What This Demonstrates

A complete, realistic project setup showing all ctxl features working
together: hierarchical `.ctx` files, contracts, decisions, gotchas,
key files, ignore policies, workspace profiles, cross-references, and
proper use of locking and verification.

This example models "TaskFlow", a SaaS task management application with
a monorepo structure.

## Project Structure

```
15-full-project/
  .ctx                      # Root context: project overview, global decisions
  .ctxl/
    config.yaml             # Workspace profile: budgets, agents, policies
  src/
    .ctx                    # Source-level: cross-cutting conventions
    index.ts                # Server entry point
    auth/
      .ctx                  # Auth module: security contracts
      middleware.ts          # JWT validation middleware
    api/
      .ctx                  # API routes: endpoint conventions
      routes.ts             # Route registration
```

## .ctx Hierarchy

When working in `src/auth/`, ctxl loads four levels of context:

```
Level 1 (highest priority): src/auth/.ctx
  - Auth security contract
  - Auth key files and gotchas

Level 2: src/.ctx
  - TypeScript conventions contract
  - Error handling contract
  - Layered architecture decision
  - asyncHandler gotcha

Level 3: .ctx (root)
  - Project summary
  - Root key files (package.json, docker-compose.yml)
  - API response envelope contract (via ref from src/.ctx)
  - Monorepo and database decisions
  - Build/test/dev commands
  - Ignore policies

Level 4 (lowest priority): refs
  - src/auth/.ctx contracts referenced by src/api/.ctx
```

## Walkthrough: Working on the Auth Module

### Step 1: Start the daemon

```bash
ctxkit daemon start
```

### Step 2: Preview context for an auth-related task

```bash
ctxkit inject --preview \
  --request "add OAuth2 support to the login flow" \
  --cwd src/auth \
  --agent claude \
  --budget 8000
```

Expected output:

```
Context Pack (3,420 / 8,000 tokens)

Included (9 items):
  1. [CONTRACT_REQUIRED] src/auth/.ctx -> contracts/auth-security-contract (320 tok)
     Scope match: path *.ts in src/auth/
  2. [CONTRACT_REQUIRED] src/.ctx -> contracts/typescript-strict-mode (240 tok)
     Scope match: path **/*.ts
  3. [CONTRACT_REQUIRED] src/.ctx -> contracts/error-handling (200 tok)
     Scope match: path **/*.ts
  4. [LOCALITY_HIGH]     src/auth/.ctx -> summary (130 tok)
  5. [LOCALITY_HIGH]     src/auth/.ctx -> key_files/middleware.ts (80 tok)
  6. [TAG_MATCH]         src/auth/.ctx -> gotchas/0 "JWT_SECRET length" (110 tok)
  7. [LOCALITY_HIGH]     src/.ctx -> decisions/d-src-001 "Layered architecture" (160 tok)
  8. [LOCALITY_HIGH]     src/.ctx -> gotchas/0 "asyncHandler" (120 tok)
  9. [LOCALITY_HIGH]     .ctx -> summary (150 tok)

Omitted (8 items):
  - .ctx -> decisions/d001 (score: 0.42, reason: LOW_SCORE)
  - .ctx -> decisions/d002 (score: 0.38, reason: LOW_SCORE)
  - .ctx -> gotchas/0 "pnpm hoisting" (score: 0.25, reason: LOW_SCORE)
  - .ctx -> gotchas/1 "Docker V2" (score: 0.22, reason: LOW_SCORE)
  - .ctx -> key_files/package.json (score: 0.20, reason: LOW_SCORE)
  - .ctx -> key_files/docker-compose.yml (score: 0.18, reason: LOW_SCORE)
  - .ctx -> commands (score: 0.35, reason: BUDGET_OK but LOW_SCORE)
  - .ctx -> contracts/api-response-envelope (score: 0.30, reason: SCOPE_MISMATCH)
```

Key observations:
- Three contracts are included because their scopes match: the auth
  security contract (path match), TypeScript conventions (path match),
  and error handling (path match).
- The API response envelope contract is NOT included because its scope
  (`src/api/*`) does not match the auth working directory.
- The auth summary and key files score highest on locality (same dir).
- Root-level decisions about monorepo and database are omitted because
  they are not relevant to an OAuth2 task.
- The 8,000-token Claude budget allows more items than the default 4,000.

### Step 3: Wrap the agent

```bash
ctxkit run --agent claude --cwd src/auth \
  -- claude "add OAuth2 support to the login flow"
```

### Step 4: After the task, check for drift

```bash
ctxkit drift
```

If the agent modified `src/auth/middleware.ts`, drift detection will flag
the key_files entry:

```
STALE: src/auth/.ctx -> key_files/middleware.ts
  Verified at: d4e5f6a (1 commit behind)
  File modified in: g7h8i9j
  Action: LOCKED -- manual review required (owner: security)
```

### Step 5: Propose updates

```bash
ctxkit propose
```

```
Proposal prop_001:
  File: src/auth/.ctx
  Section: key_files
  Type: re-verification
  Note: Entry is locked (owner: security). Requires manual review.

--- a/src/auth/.ctx
+++ b/src/auth/.ctx
@@ key_files @@
   - path: middleware.ts
     why: "Express middleware that validates JWT on every API request."
-    verified_at: "d4e5f6a"
+    verified_at: "g7h8i9j"
     locked: true
     owner: security

[a]pprove / [e]dit / [r]eject? _
```

### Step 6: Inspect the session

```bash
ctxkit sessions show <session-id>
```

The session timeline shows exactly what context the agent received,
how many tokens were used, and which items were omitted.

## Walkthrough: Working on API Routes

### Preview context from the API directory

```bash
ctxkit inject --preview \
  --request "add a new endpoint for task comments" \
  --cwd src/api \
  --budget 4000
```

Expected output:

```
Context Pack (2,150 / 4,000 tokens)

Included (7 items):
  1. [CONTRACT_REQUIRED] src/api/.ctx -> contracts/api-endpoint-conventions (250 tok)
  2. [CONTRACT_REQUIRED] src/.ctx -> contracts/typescript-strict-mode (240 tok)
  3. [CONTRACT_REQUIRED] .ctx -> contracts/api-response-envelope (180 tok)
     Scope match: tag "api"
  4. [CONTRACT_REQUIRED] src/auth/.ctx -> contracts/auth-security-contract (320 tok)
     Via ref from src/api/.ctx
  5. [LOCALITY_HIGH]     src/api/.ctx -> key_files/routes.ts (60 tok)
  6. [LOCALITY_HIGH]     src/api/.ctx -> gotchas/0 "route order" (100 tok)
  7. [LOCALITY_HIGH]     src/api/.ctx -> summary (110 tok)

Omitted (6 items):
  ...
```

The auth security contract is included via the ref from `src/api/.ctx`
to `src/auth/.ctx`. This ensures that any API route development also
gets the auth constraints.

## Feature Interaction Map

This project demonstrates how features interact:

```
.ctxl/config.yaml
  |-- Sets budget: 4000 default, 8000 for Claude
  |-- Sets ignore: .env, secrets/, node_modules/
  |-- Sets auto-approve: commands and tags sections
  |
  v
.ctx (root)
  |-- summary: project overview
  |-- key_files: package.json, docker-compose.yml, src/index.ts
  |-- contracts: api-response-envelope
  |-- decisions: monorepo choice, database choice
  |-- gotchas: pnpm hoisting, Docker V2
  |-- commands: build, test, dev, lint
  |-- refs: -> src/.ctx contracts
  |-- ignore: .env, *.key, node_modules/, dist/
  |
  v (hierarchical loading)
src/.ctx
  |-- contracts: typescript-strict-mode, error-handling
  |-- decisions: layered architecture
  |-- gotchas: asyncHandler wrapper
  |
  +---> src/auth/.ctx
  |       |-- contracts: auth-security-contract (locked, owner: security)
  |       |-- key_files: middleware.ts (locked, owner: security)
  |       |-- gotchas: JWT_SECRET length
  |
  +---> src/api/.ctx
          |-- contracts: api-endpoint-conventions
          |-- key_files: routes.ts
          |-- gotchas: route order
          |-- refs: -> src/auth/.ctx contracts
```

## Best Practices Demonstrated

1. **Hierarchical organization**: Root has project-wide context, `src/`
   has cross-cutting conventions, modules have specific rules.

2. **Contract scoping**: Each contract uses precise path and tag scopes
   so it only fires when relevant.

3. **Locking sensitive entries**: Auth contracts and key files are locked
   with `owner: security` to prevent automated changes.

4. **Cross-references**: API routes reference auth contracts so they are
   always available when working on endpoints.

5. **Workspace profile**: Agent-specific budgets, auto-approve for
   low-risk sections, and global ignore policies.

6. **Concise entries**: Key files, gotchas, and summaries are written
   for maximum information density.

7. **Verified_at tracking**: Every entry has a verification commit hash
   for drift detection.

8. **Ignore policies**: Sensitive files (.env, keys) are excluded at
   both the `.ctx` and `.ctxl/config.yaml` levels.

## How to Use This Example

Copy this entire directory into a git repository:

```bash
mkdir /tmp/taskflow && cd /tmp/taskflow && git init
cp -r /path/to/examples/15-full-project/* .
cp -r /path/to/examples/15-full-project/.ctx .
cp -r /path/to/examples/15-full-project/.ctxl .
git add -A && git commit -m "initial commit"
```

Then experiment:

```bash
# Validate all .ctx files
ctxkit validate

# Preview context from different directories
ctxkit inject --preview --request "fix a bug" --cwd .
ctxkit inject --preview --request "fix a bug" --cwd src/auth
ctxkit inject --preview --request "fix a bug" --cwd src/api

# Check for drift
ctxkit drift

# Start the daemon and wrap an agent
ctxkit daemon start
ctxkit run --agent claude -- your-agent "add task comments feature"

# Inspect the session
ctxkit sessions
ctxkit sessions show <id>

# Open the dashboard
ctxkit dashboard
```
