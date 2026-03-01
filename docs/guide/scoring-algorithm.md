# Scoring Algorithm

ctxl scores every entry from the merged `.ctx` hierarchy to determine which items should be included in the Context Pack. This page describes the full scoring pipeline, from individual signal computation through final sort order.

## Overview

The scoring pipeline has four stages:

```
1. Compute individual signals (locality, tags, recency)
2. Combine signals with section-specific weights
3. Apply boosters (locked, contract scope, recent edits)
4. Sort by score with deterministic tiebreakers
```

Each entry receives a final score between 0.0 and 1.0.

## Signal 1: Locality

Locality measures the directory distance between the working directory and the `.ctx` file that contributed the entry.

```typescript
function scoreLocality(workingDir: string, ctxSourcePath: string, repoRoot: string): number
```

**Computation:**

1. Resolve both paths to absolute paths
2. Compute the relative path from the `.ctx` file's directory to the working directory
3. Count directory levels of separation
4. Apply linear decay: `max(0.1, 1.0 - distance * 0.2)`

**Score table:**

| Distance | Score | Example |
|----------|-------|---------|
| 0 (same dir) | 1.0 | Working in `src/auth/`, entry from `src/auth/.ctx` |
| 1 level | 0.8 | Working in `src/auth/`, entry from `src/.ctx` |
| 2 levels | 0.6 | Working in `src/auth/`, entry from `.ctx` (root) |
| 3 levels | 0.4 | Working in `src/auth/handlers/`, entry from `.ctx` (root) |
| 4 levels | 0.2 | Deeper nesting |
| 5+ levels | 0.1 | Minimum score (floor) |

The minimum score of 0.1 ensures that even distant entries are not completely ignored -- they can still be included if they have strong tag or contract matches.

## Signal 2: Tag Matching

Tag matching compares keywords extracted from the request text against an entry's tags.

```typescript
function scoreTags(requestKeywords: string[], entryTags: string[]): number
```

**Keyword extraction** from request text:

1. Convert to lowercase
2. Replace non-word characters (except hyphens) with spaces
3. Split on whitespace
4. Filter words shorter than 3 characters
5. Remove stop words (75+ common English words like "the", "and", "for", etc.)

**Matching algorithm:**

For each tag in the entry:
- **Exact match**: keyword equals tag (case-insensitive) -- counts as 1.0 match
- **Partial match**: keyword contains tag or tag contains keyword -- counts as 0.5 match (applied once per tag)

**Score**: `min(1.0, total_matches / number_of_tags)`

**Examples:**

| Request | Entry Tags | Score | Reason |
|---------|-----------|-------|--------|
| "fix auth bug" | `[auth, login]` | 0.5 | "auth" exact match (1.0 / 2 tags) |
| "fix auth login" | `[auth, login]` | 1.0 | Both tags match (2.0 / 2 tags) |
| "update authentication" | `[auth]` | 0.5 | "authentication" contains "auth" (partial) |
| "refactor database" | `[auth, login]` | 0.0 | No matches |

## Signal 3: Recency

Recency scores based on the entry's verification status.

```typescript
function scoreRecency(verifiedAt: string, isStale: boolean): number
```

| Condition | Score |
|-----------|-------|
| Entry marked as stale | 0.3 |
| No `verified_at` value | 0.5 |
| Has `verified_at` and not stale | 0.9 |

An entry is considered stale if its `verified_at` field is empty or whitespace-only. In practice, drift detection can also mark entries as stale based on git history analysis.

## Section-Specific Weights

Different sections combine signals with different weights, reflecting their relative importance:

### Key Files

```
score = locality * 0.4 + tagScore * 0.3 + recency * 0.2
```

Key files weigh locality highest because files near the working directory are most likely relevant.

### Contracts

```
score = locality * 0.3 + tagScore * 0.3 + 0.3
```

Contracts have an inherent base value of 0.3, reflecting their importance regardless of locality or tags. This ensures contracts always score at least 0.3 even with zero matches.

### Decisions

```
score = locality * 0.3 + tagScore * 0.4 + 0.1
```

Decisions weigh tag matching highest because their relevance depends more on topic than proximity. The title words are used as tags for matching.

### Gotchas

```
score = locality * 0.3 + tagScore * 0.4 + 0.1
```

Same weights as decisions. Gotchas are matched by their explicit tags.

### Summary

```
score = locality * 0.5
```

Summaries use only locality scoring and are always included when the `.ctx` file is in or near the working directory. They receive `LOCALITY_HIGH` if locality >= 0.8.

## Boosters

After base scoring, boosters can increase an entry's score:

### Locked/Pinned Entries

If an entry has `locked: true`, its score is boosted to at least 0.8:

```typescript
if (entry.locked) {
  reasons.push(ReasonCode.PINNED);
  score = Math.max(score, 0.8);
}
```

This guarantees that pinned entries are included in the Context Pack unless the budget is extremely tight.

### Contract Scope Match

When touched files match a contract's scope paths (via glob matching), the contract score is boosted to at least 0.95:

```typescript
if (scopeMatches) {
  reasons.push(ReasonCode.CONTRACT_REQUIRED);
  score = Math.max(score, 0.95);
}
```

When request keywords strongly match contract tags (tag score >= 0.5), the contract is boosted to 0.9:

```typescript
if (tagScore >= 0.5) {
  reasons.push(ReasonCode.CONTRACT_REQUIRED);
  score = Math.max(score, 0.9);
}
```

### Recent Edits

If a key file's path appears in the `touchedFiles` list (matched bidirectionally), the entry gets a 0.2 boost:

```typescript
if (touchedFiles.some(f => kf.path.includes(f) || f.includes(kf.path))) {
  score = Math.min(1.0, score + 0.2);
  reasons.push(ReasonCode.RECENT_EDIT);
}
```

## Sort Order

After scoring, entries are sorted with deterministic tiebreakers:

1. **Score** (descending) -- highest-scoring entries first
2. **Section priority** (ascending) -- on equal score, contracts come before key files:
   - `contracts` (0)
   - `key_files` (1)
   - `decisions` (2)
   - `gotchas` (3)
   - `summary` (4)
3. **Source path** (alphabetical) -- on equal score and section
4. **Entry ID** (alphabetical) -- final tiebreaker

This deterministic ordering ensures that the same inputs always produce the same Context Pack, which is critical for reproducibility and debugging.

## Reason Codes

Each scored entry accumulates reason codes that explain why it scored the way it did:

| Code | When Applied |
|------|-------------|
| `LOCALITY_HIGH` | Locality score >= 0.8 (entry from same dir or one level up) |
| `TAG_MATCH` | Tag score > 0 (at least one tag matched request keywords) |
| `PINNED` | Entry has `locked: true` |
| `RECENT_EDIT` | Entry's file path appears in `touchedFiles` |
| `CONTRACT_REQUIRED` | Contract scope matches touched files or strong tag match |
| `DEEP_READ` | Entry was added by the deep-read fallback |

## Example Walkthrough

Given:
- Working directory: `src/auth/`
- Request: "fix the login bug"
- Budget: 4000 tokens

Entries after scoring:

| Entry | Section | Locality | Tags | Recency | Boosters | Final Score | Reason Codes |
|-------|---------|----------|------|---------|----------|-------------|-------------|
| auth-api contract | contracts | 1.0 | 0.5 | -- | CONTRACT_REQUIRED | 0.9 | LOCALITY_HIGH, TAG_MATCH, CONTRACT_REQUIRED |
| login.ts | key_files | 1.0 | 1.0 | 0.9 | -- | 0.88 | LOCALITY_HIGH, TAG_MATCH |
| security-policy | contracts | 0.6 | 0.5 | -- | CONTRACT_REQUIRED | 0.9 | TAG_MATCH, CONTRACT_REQUIRED |
| auth summary | summary | 1.0 | -- | -- | -- | 0.5 | LOCALITY_HIGH |
| root gotcha | gotchas | 0.6 | 0.0 | -- | -- | 0.28 | -- |

Sorted result: auth-api, security-policy, login.ts, auth summary, root gotcha

## API Reference

```typescript
function scoreEntries(
  sources: Array<{ path: string; ctx: CtxFile }>,
  options: ScoreOptions,
): ScoredEntry[]

interface ScoreOptions {
  workingDir: string;
  repoRoot: string;
  requestText: string;
  touchedFiles?: string[];
}

interface ScoredEntry {
  content: string;
  source: string;
  section: string;
  entry_id: string;
  score: number;
  tokens: number;
  reason_codes: ReasonCode[];
  verified_at: string;
  is_stale: boolean;
  locked: boolean;
}
```

## Next Steps

- Learn how scores feed into [Budget Management](/guide/budget-management)
- Understand [Contract](/guide/contracts) scope matching and enforcement
- See how [Drift Detection](/guide/drift-detection) affects recency scores
