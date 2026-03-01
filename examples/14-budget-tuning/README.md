# Example 14: Budget and Scoring Tuning

## What This Demonstrates

How ctxl scores `.ctx` entries for relevance and how the token budget
system works. Understanding the scoring formula helps you write better
`.ctx` files and configure budgets that produce the most useful Context
Packs.

## The Scoring System

Every `.ctx` entry is scored on a scale of 0.0 to 1.0 (before boosters).
The score determines which entries are included in the Context Pack and
in what order.

### Scoring Signals

There are three primary signals:

| Signal    | Description                                              |
|-----------|----------------------------------------------------------|
| Locality  | How close is the entry's .ctx file to the working dir?   |
| Tags      | How well do the entry's tags match the request?          |
| Recency   | How recently was the entry verified?                     |

### Signal Calculations

#### Locality Score

Measures the directory distance between the entry's `.ctx` file and
the current working directory:

```
Same directory:     1.0
One level up:       0.8  (1.0 - 0.2)
Two levels up:      0.6  (1.0 - 0.4)
Three levels up:    0.4  (1.0 - 0.6)
Four levels up:     0.2  (1.0 - 0.8)
Five+ levels up:    0.1  (minimum, never goes below 0.1)
```

Formula: `max(1.0 - (levels * 0.2), 0.1)`

Example:
```
Working dir: src/auth/handlers/
  src/auth/handlers/.ctx  -> locality = 1.0 (same dir)
  src/auth/.ctx           -> locality = 0.8 (1 level up)
  src/.ctx                -> locality = 0.6 (2 levels up)
  .ctx (root)             -> locality = 0.4 (3 levels up)
```

#### Tag Score

Measures how well the entry's tags match the request context:

```
Exact match:        1.0  (request mentions "auth", entry tagged "auth")
Partial match:      0.5  (request mentions "authentication", entry tagged "auth")
No match:           0.0
```

The tag score is the maximum across all tags on the entry. If an entry
has tags `[auth, api, security]` and the request matches "auth" exactly
and "api" partially, the tag score is 1.0 (the best match wins).

#### Recency Score

Based on the `verified_at` field and whether the entry is stale:

```
Verified (no drift):      0.9
No verification (missing): 0.5
Stale (drift detected):    0.3
```

### Section Weights

Different sections combine the signals with different weights:

#### key_files

```
score = locality * 0.4 + tags * 0.3 + recency * 0.2 + base * 0.1
```

Where `base = 0.5` (constant baseline).

Example:
```
locality = 0.8 (one level up)
tags = 1.0 (exact match)
recency = 0.9 (verified)

score = 0.8 * 0.4 + 1.0 * 0.3 + 0.9 * 0.2 + 0.5 * 0.1
      = 0.32 + 0.30 + 0.18 + 0.05
      = 0.85
```

#### contracts

```
score = locality * 0.3 + tags * 0.3 + scope_match * 0.3 + base * 0.1
```

Where `scope_match` is 1.0 if the contract's scope matches the request
(path or tag), 0.0 otherwise.

#### decisions

```
score = locality * 0.3 + tags * 0.3 + recency * 0.3 + base * 0.1
```

#### gotchas

```
score = locality * 0.4 + tags * 0.4 + recency * 0.1 + base * 0.1
```

Gotchas weight tags heavily because they should only appear when
directly relevant.

#### commands

```
score = locality * 0.5 + tags * 0.2 + base * 0.3
```

Commands weight locality heavily because you usually want the commands
for your current directory.

### Boosters

After the base score is calculated, boosters can increase it:

| Booster          | Effect                     | Description                           |
|------------------|----------------------------|---------------------------------------|
| `locked: true`   | `max(score, 0.80)`        | Locked entries are always high priority|
| Contract scope   | `max(score, 0.95)`        | Contracts matching scope are near-mandatory |
| Touched files    | `score += 0.20`           | Entries referencing touched files get a bump |

#### Booster Examples

```
Entry with base score 0.45, locked = true:
  Final score = max(0.45, 0.80) = 0.80

Contract with base score 0.60, scope matches request:
  Final score = max(0.60, 0.95) = 0.95

Entry with base score 0.55, references a touched file:
  Final score = 0.55 + 0.20 = 0.75
```

## Budget System

### How Budget Allocation Works

The token budget defines the maximum number of tokens in a Context Pack.
The default is 4,000 tokens. Allocation follows this order:

1. **Contracts with scope match**: Always included first with reason
   code `CONTRACT_REQUIRED`. These are mandatory.
2. **Remaining entries**: Sorted by final score (descending). Added
   one by one until the budget is exhausted.
3. **Omitted entries**: Everything that did not fit is listed with
   its score and exclusion reason.

```
Budget: 4,000 tokens

Step 1: Include matching contracts
  - auth-security-requirements: 280 tokens [CONTRACT_REQUIRED]
  Remaining budget: 3,720 tokens

Step 2: Include scored entries (highest score first)
  - key_files/handler.ts: 45 tokens (score: 0.85)  -> included
  - gotchas/0: 80 tokens (score: 0.72)             -> included
  - decisions/d001: 95 tokens (score: 0.68)         -> included
  - summary: 120 tokens (score: 0.65)               -> included
  Remaining budget: 3,380 tokens

Step 3: Continue until budget exhausted or all entries included
  - key_files/database.ts: 50 tokens (score: 0.42)  -> included
  - gotchas/1: 200 tokens (score: 0.35)             -> included
  ...
```

### Budget Warnings

If contracts alone exceed the budget:

```
WARNING: Contract items (1,200 tokens) exceed budget (1,000 tokens).
  All contracts included (mandatory). Non-contract items truncated.
  Consider increasing the budget to at least 2,000 tokens.
```

If the budget is too small for meaningful context:

```
ERROR: Budget (100 tokens) too small for meaningful context.
  Minimum recommended: 500 tokens.
  Highest-priority item alone requires 280 tokens.
```

## Tuning Tips

### 1. Right-size Your Budget

| Project Size      | Recommended Budget | Rationale                        |
|-------------------|--------------------|----------------------------------|
| Small (1-3 .ctx)  | 2,000 tokens       | Not much context to assemble     |
| Medium (4-10 .ctx)| 4,000 tokens       | Good default balance             |
| Large (10+ .ctx)  | 6,000-8,000 tokens | More context available and useful |

```yaml
# .ctxl/config.yaml
budget:
  default_tokens: 4000
```

### 2. Use Tags Strategically

Tags are the primary mechanism for matching entries to requests. Poor
tags lead to irrelevant context being injected.

Bad tags (too generic):
```yaml
tags: [code, project, backend]
```

Good tags (specific and descriptive):
```yaml
tags: [auth, jwt, bcrypt, login, security]
```

### 3. Keep Entries Concise

Each entry consumes tokens from the budget. Long entries push out other
useful context:

Bad (wastes 200 tokens):
```yaml
- path: src/auth/handler.ts
  why: |
    This file contains the authentication handler which is responsible
    for handling all authentication-related HTTP requests including
    login, logout, token refresh, password reset, and account
    verification. It uses Express.js middleware pattern and calls
    into the auth service layer for business logic...
```

Good (uses 45 tokens):
```yaml
- path: src/auth/handler.ts
  why: "Auth handler: login, logout, token refresh. Uses JWT."
```

### 4. Leverage Locality

Place `.ctx` files close to the code they describe. Entries in a `.ctx`
file in the same directory as the working directory get the highest
locality score (1.0).

If you find that important entries are being omitted because they are
too far up the tree, consider:
- Moving the entry to a closer `.ctx` file
- Using `locked: true` to boost its score
- Using `refs` to bring it in from a closer context

### 5. Verify Regularly

Stale entries get a recency score of 0.3 instead of 0.9. This is a
significant scoring penalty. Keep `verified_at` current to maintain
high scores:

```bash
ctxkit verify src/auth/handler.ts
```

### 6. Use Contracts for Must-Include Items

If an entry must always appear when a certain area is touched, make it
a contract instead of a regular entry. Contracts get a boosted score
of 0.95 and are allocated before the budget is filled with regular
entries.

### 7. Monitor with --preview

Use `ctxkit inject --preview` to see exactly how entries are scored:

```bash
ctxkit inject --preview --verbose \
  --request "fix the login bug" \
  --cwd src/auth \
  --budget 4000
```

The `--verbose` flag shows the full scoring breakdown for each entry:

```
Scoring Details:
  src/auth/.ctx -> key_files/handler.ts
    locality: 1.0 (same dir)
    tags: 0.8 (partial: "login" ~ "auth")
    recency: 0.9 (verified, no drift)
    base: 0.5
    formula: 1.0*0.4 + 0.8*0.3 + 0.9*0.2 + 0.5*0.1 = 0.87
    boosters: none
    final: 0.87
```

### 8. Tune for Specific Agents

Different agents benefit from different budgets and context styles:

```yaml
# .ctxl/config.yaml
agents:
  claude:
    budget_tokens: 8000    # Handles large context well
  copilot:
    budget_tokens: 2000    # Works better with focused context
```

## Scoring Quick Reference

```
LOCALITY: same_dir=1.0, per_level=-0.2, min=0.1
TAGS:     exact=1.0, partial=0.5, none=0.0
RECENCY:  verified=0.9, unverified=0.5, stale=0.3

key_files:  locality*0.4 + tags*0.3 + recency*0.2 + 0.05
contracts:  locality*0.3 + tags*0.3 + scope*0.3 + 0.05
decisions:  locality*0.3 + tags*0.3 + recency*0.3 + 0.05
gotchas:    locality*0.4 + tags*0.4 + recency*0.1 + 0.05
commands:   locality*0.5 + tags*0.2 + 0.15

BOOSTERS:
  locked=true     -> max(score, 0.80)
  contract scope  -> max(score, 0.95)
  touched files   -> score += 0.20

BUDGET ORDER:
  1. CONTRACT_REQUIRED items (always first)
  2. Remaining by score (descending)
  3. Omitted (with reasons)
```
