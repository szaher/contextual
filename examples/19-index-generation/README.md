# Example 19: Index Generation and Context Selection

The `.ctxl` index is the compiled, queryable representation of all `.ctx`
files in a repository. Instead of scanning every `.ctx` file on each request,
ctxl generates an index that pre-computes relationships, scores, and budget
allocations. This example demonstrates how index generation works, how the
context selection algorithm uses the index, and how to inspect and tune the
result.

## What This Demonstrates

- Generating a `.ctxl` index from a multi-directory `.ctx` setup
- The structure of a `.ctxl` index file (entries, graph, scoring, budgets, policies)
- Context selection using the scoring formula with all five signals
- Category-based budget allocation (contracts, local_ctx, related_ctx, history, reserve)
- Inspecting the index with `ctxkit index show`
- Running a selection query with `ctxkit index select`

## Files in This Example

- **`.ctx`** -- Root-level context file with project summary and global contracts
- **`src/auth/.ctx`** -- Authentication module context with key files, decisions, and contracts
- **`src/api/.ctx`** -- API layer context with route definitions and gotchas
- **`src/utils/.ctx`** -- Utilities context with helper descriptions
- **`.ctxl`** -- The generated index file (shown inline and as a sample file)

## How Index Generation Works

When you run `ctxkit index generate`, ctxl performs the following steps:

1. **Discovery**: Walks the repository tree to find all `.ctx` files.
2. **Parsing**: Validates and parses each `.ctx` file using the v2 schema.
3. **Flattening**: Extracts every entry (key_files, contracts, decisions,
   gotchas, commands) into a flat list with source metadata.
4. **Graph building**: Creates a dependency graph from `refs` fields,
   recording which `.ctx` files reference each other.
5. **Scoring pre-computation**: For each entry, computes baseline scores
   that are independent of request context (e.g., recency, lock status).
6. **Budget configuration**: Reads budget settings from `.ctxl/config.yaml`
   or uses defaults.
7. **Policy collection**: Gathers all ignore rules, scope constraints, and
   lock metadata.
8. **Output**: Writes the `.ctxl` index file (YAML format).

## The Scoring Formula

Each entry is scored at query time using five signals:

```
score = locality * w_locality
      + tagMatch * w_tag
      + recency * w_recency
      + depBonus
      + cwdBonus
```

### Signal Definitions

| Signal     | Range     | Description                                              |
|------------|-----------|----------------------------------------------------------|
| locality   | 0.1 - 1.0 | Directory distance from the entry to the working dir    |
| tagMatch   | 0.0 - 1.0 | Best tag overlap between entry tags and request tokens  |
| recency    | 0.3 - 0.9 | Based on verified_at freshness (stale=0.3, verified=0.9)|
| depBonus   | 0.0 - 0.15| Bonus if the entry is in the dependency graph of cwd    |
| cwdBonus   | 0.0 - 0.10| Bonus if the entry's .ctx file is exactly in the cwd    |

### Weight Defaults by Section

| Section    | w_locality | w_tag | w_recency | depBonus | cwdBonus |
|------------|-----------|-------|-----------|----------|----------|
| key_files  | 0.40      | 0.30  | 0.20      | 0.10     | 0.05     |
| contracts  | 0.30      | 0.30  | 0.10      | 0.15     | 0.05     |
| decisions  | 0.30      | 0.30  | 0.30      | 0.10     | 0.05     |
| gotchas    | 0.40      | 0.40  | 0.10      | 0.05     | 0.05     |
| commands   | 0.50      | 0.20  | 0.00      | 0.10     | 0.10     |

### Worked Example

```
Entry: src/auth/.ctx -> key_files/handler.ts
Working dir: src/auth/handlers/
Request: "fix the JWT validation bug"

locality  = 0.8  (one level up from cwd)
tagMatch  = 1.0  (entry tag "jwt" exact-matches request token "jwt")
recency   = 0.9  (verified, no drift)
depBonus  = 0.10 (src/auth is in the dep graph of src/auth/handlers)
cwdBonus  = 0.00 (entry is not in the exact cwd)

score = 0.8 * 0.40 + 1.0 * 0.30 + 0.9 * 0.20 + 0.10 + 0.00
      = 0.32 + 0.30 + 0.18 + 0.10 + 0.00
      = 0.90
```

## Category Budgets

The total token budget is divided into five categories. Each category has a
percentage allocation that determines how many tokens it can consume:

| Category    | Default % | Purpose                                           |
|-------------|-----------|---------------------------------------------------|
| contracts   | 20%       | Must-include invariants and guardrails             |
| local_ctx   | 30%       | Entries from the cwd and immediate parent          |
| related_ctx | 30%       | Entries from elsewhere in the repo (via scoring)   |
| history     | 10%       | Recent session history and activity log            |
| reserve     | 10%       | Headroom for runtime additions (e.g., tool output) |

With a 4,000-token budget, the allocation is:

```
contracts:    800 tokens
local_ctx:  1,200 tokens
related_ctx:1,200 tokens
history:      400 tokens
reserve:      400 tokens
```

If a category is underused, its remaining tokens overflow into the next
category in priority order: contracts > local_ctx > related_ctx > history.
Reserve tokens are never redistributed.

## Try It Out

### Step 1: Generate the index

```bash
ctxkit index generate
```

Expected output:

```
Scanning for .ctx files...
  Found: .ctx
  Found: src/auth/.ctx
  Found: src/api/.ctx
  Found: src/utils/.ctx

Building index...
  Entries: 14
  Graph edges: 3
  Policies: 2

Index written to .ctxl (2.1 KB)
```

### Step 2: Inspect the generated index

```bash
ctxkit index show
```

Expected output:

```
ctxl Index
==========
Version: 2
Generated: 2026-03-15T10:30:00Z
Sources: 4 .ctx files

Entries (14):
  contracts:  3 entries (est. 680 tokens)
  key_files:  6 entries (est. 420 tokens)
  decisions:  2 entries (est. 310 tokens)
  gotchas:    1 entry   (est. 90 tokens)
  commands:   2 entries (est. 140 tokens)

Graph:
  .ctx -> src/auth/.ctx (ref)
  .ctx -> src/api/.ctx (ref)
  src/api/.ctx -> src/auth/.ctx (dep)

Budget: 4,000 tokens
  contracts:    800 (20%)
  local_ctx:  1,200 (30%)
  related_ctx:1,200 (30%)
  history:      400 (10%)
  reserve:      400 (10%)

Policies:
  never_read: [".env", "secrets/*"]
  never_log: ["*.key", "*.pem"]
```

### Step 3: Run a context selection query

```bash
ctxkit index select \
  --prompt "fix the JWT validation bug in the auth handler" \
  --cwd src/auth
```

Expected output:

```
Context Selection (1,840 / 4,000 tokens)
========================================

contracts (680 / 800 tokens):
  1. [0.95] auth-security-requirements (280 tok) CONTRACT_REQUIRED
  2. [0.95] input-validation-contract  (220 tok) CONTRACT_REQUIRED
  3. [0.88] api-versioning-contract    (180 tok) SCORE

local_ctx (720 / 1,200 tokens):
  1. [0.90] src/auth/.ctx -> key_files/handler.ts     (45 tok)
  2. [0.87] src/auth/.ctx -> key_files/jwt-service.ts  (50 tok)
  3. [0.85] src/auth/.ctx -> decisions/d001            (95 tok)
  4. [0.82] src/auth/.ctx -> summary                   (120 tok)
  5. [0.72] src/auth/.ctx -> gotchas/0                 (80 tok)
  6. [0.68] src/auth/.ctx -> commands                  (140 tok)
  7. [0.55] src/auth/.ctx -> key_files/middleware.ts    (40 tok)
  8. [0.50] src/auth/.ctx -> key_files/types.ts         (50 tok)

related_ctx (440 / 1,200 tokens):
  1. [0.62] .ctx -> summary                (120 tok)
  2. [0.58] src/api/.ctx -> gotchas/0       (80 tok)
  3. [0.45] src/api/.ctx -> key_files/routes.ts (40 tok)
  4. [0.42] src/utils/.ctx -> summary       (100 tok)
  5. [0.38] .ctx -> commands                (100 tok)

history (0 / 400 tokens):
  (no active session history)

reserve (0 / 400 tokens):
  (reserved for runtime)

Omitted (2 entries):
  - src/utils/.ctx -> key_files/logger.ts  (score: 0.25, below threshold)
  - src/utils/.ctx -> key_files/config.ts  (score: 0.22, below threshold)
```

### Step 4: Re-generate after changes

After editing any `.ctx` file, re-generate the index:

```bash
ctxkit index generate
```

The index is also regenerated automatically by the daemon when `.ctx` files
change on disk.

## Key Takeaways

- The `.ctxl` index is a compiled, queryable snapshot of all `.ctx` files
  in the repository. It avoids re-scanning on every request.
- The scoring formula combines five signals (locality, tagMatch, recency,
  depBonus, cwdBonus) with section-specific weights.
- Category budgets (contracts, local_ctx, related_ctx, history, reserve)
  partition the total token budget so that each type of context gets a
  fair share.
- Contracts are always included first and get the highest priority
  allocation.
- Use `ctxkit index show` to inspect the index and `ctxkit index select`
  to test how context would be assembled for a given prompt.
