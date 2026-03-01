# Budget Management

ctxl enforces a strict token budget on every Context Pack. This page explains how the budget pipeline works, how entries are prioritized, why items get excluded, and when the deep-read fallback triggers.

## Token Budget Pipeline

The budget pipeline runs after scoring and sorting:

```
Scored entries (sorted by score) --> Partition (contracts / non-contracts) --> Pack contracts first --> Pack remaining by score --> Emit omitted list
```

The default budget is **4,000 tokens**, configurable via:
- `--budget` CLI flag
- Profile configuration (`budget.default_tokens`)
- Agent-specific overrides
- API `budget_tokens` parameter

## Token Estimation

ctxl estimates token counts using a simple heuristic (character-based approximation). The `estimateTokens` function provides a fast estimate without requiring a full tokenizer:

```typescript
import { estimateTokens } from '@ctxl/core'

const tokens = estimateTokens("Your content here")
```

For production accuracy, you can replace the default estimator via `createEstimator`:

```typescript
import { createEstimator } from '@ctxl/core'

const estimate = createEstimator(/* custom implementation */)
```

## Contract Priority

Contracts with the `CONTRACT_REQUIRED` reason code get **budget priority**. They are processed before all other entries:

```typescript
// Partition entries
const contractEntries = entries.filter(e =>
  e.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED)
);
const nonContractEntries = entries.filter(e =>
  !e.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED)
);

// Process contracts first
for (const entry of contractEntries) { ... }

// Then process non-contracts with remaining budget
for (const entry of nonContractEntries) { ... }
```

If a contract exceeds the remaining budget, ctxl **still includes it** with a warning:

```
[ctxl] Budget stretch: contract "security-policy" requires 320 tokens, budget remaining: 200
```

This ensures that critical safety invariants are never silently dropped. The budget may be exceeded by contract entries, but non-contract entries will not be added once the budget is full.

## Exclusion Reasons

When an entry is omitted, it receives one of these exclusion reasons:

| Reason | Description |
|--------|-------------|
| `BUDGET_EXCEEDED` | Adding this entry would push total tokens beyond the budget ceiling |
| `LOW_SCORE` | The entry's relevance score is below the useful threshold (< 0.3) |
| `IGNORED` | The entry matches an ignore policy (`never_read` pattern) |
| `STALE` | The entry is too stale to provide reliable context |

Each omitted item includes:
- A **content preview** (first 100 characters)
- The **source** `.ctx` file path
- The **section** it came from
- Its **score** (so you can see how close it was to being included)
- Its **token count** (so you can understand the budget impact)

## Budget Accounting

The Context Pack includes full budget accounting:

```typescript
interface ContextPack {
  version: number;
  items: PackItem[];
  omitted: OmittedItem[];
  total_tokens: number;      // Actual tokens used
  budget_tokens: number;     // Declared budget ceiling
  budget_used_pct: number;   // Percentage used (e.g., 87.5)
}
```

Example output:

```json
{
  "total_tokens": 3500,
  "budget_tokens": 4000,
  "budget_used_pct": 87.5
}
```

## Deep-Read Fallback

When the scoring pipeline produces low-confidence results, ctxl triggers a deep-read fallback that bypasses `.ctx` and reads files directly. The fallback is checked after scoring but before budget application.

### Trigger Conditions

The deep-read fallback triggers when **any** of these conditions are met:

1. **No `.ctx` files found** in the hierarchy
   - Rationale: "No .ctx files found in hierarchy"

2. **Zero tag matches** across all scored entries (when entries do exist)
   - Rationale: "Zero tag matches across all entries"

3. **Top score below 0.3** (when entries exist)
   - Rationale: "Top score (0.22) below threshold (0.3)"

4. **User intent signals** deep analysis -- request text contains:
   - "refactor"
   - "debug"
   - "failing test"
   - "investigate"
   - "deep dive"
   - "understand"
   - "trace"
   - "root cause"
   - Rationale: "User intent signals deep analysis: 'debug'"

Multiple reasons can combine:

```
Deep-read triggered: Zero tag matches across all entries; Top score (0.18) below threshold (0.3); User intent signals deep analysis: "debug"
```

### Deep-Read Items

When triggered, deep-read items are appended to the Context Pack with the `DEEP_READ` reason code:

```typescript
{
  content: "[Deep read: src/auth/login.ts]",
  source: "deep-read",
  section: "files",
  score: 0.5,
  tokens: 0,
  reason_codes: [ReasonCode.DEEP_READ]
}
```

Deep-read decisions are also recorded in the session timeline for observability.

## Tuning the Budget

### Increasing the Budget

If important entries are being omitted, increase the budget:

```bash
ctxkit inject --request "fix the auth bug" --budget 8000
```

Or set it in your workspace profile:

```yaml
# .ctxl/config.yaml
budget:
  default_tokens: 8000
```

### Per-Agent Budgets

Different agents may need different budgets:

```yaml
# .ctxl/config.yaml
agents:
  claude:
    budget_tokens: 8000
    mode: lexical
  copilot:
    budget_tokens: 4000
    mode: lexical
```

### Reducing Noise

If low-relevance entries are consuming budget, improve your `.ctx` files:

- Add specific tags to entries so they match the right requests
- Lock important entries so they get priority
- Use contracts for critical invariants that must always be included
- Remove stale entries that no longer provide value

## API Reference

```typescript
function applyBudget(entries: ScoredEntry[], options?: BudgetOptions): ContextPack

interface BudgetOptions {
  budgetTokens?: number;  // Default: 4000
}
```

## Next Steps

- Learn about [Contract](/guide/contracts) enforcement and scope matching
- Understand [Drift Detection](/guide/drift-detection) and staleness
- Configure [Profiles](/guide/profiles) for per-repo and per-agent budgets
