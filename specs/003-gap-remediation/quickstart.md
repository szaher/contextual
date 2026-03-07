# Quickstart: Gap Remediation Implementation

**Branch**: `003-gap-remediation` | **Date**: 2026-03-04

---

## Overview

This feature remediates 17 bugs, 3 gaps, and 4 scoring improvements across 4 packages. Changes are organized into 5 implementation phases ordered by dependency and risk.

## Prerequisites

```bash
git checkout 003-gap-remediation
pnpm install
pnpm build    # verify clean baseline
pnpm test     # verify 147/147 pass
pnpm test:e2e # verify 79/79 pass
```

## Implementation Order

### Phase A: Security Fixes (no dependencies)
1. `packages/core/src/differ/drift.ts` — Replace all `execSync` with `execFileSync` + args array
2. `packages/daemon/src/routes/drift.ts` — Add path traversal validation after `resolve()`

### Phase B: Scoring Fixes (no dependencies)
3. `packages/core/src/scorer/locality.ts` — Fix no-op ternary to differentiate ancestors from siblings
4. `packages/core/src/scorer/recency.ts` — Replace binary scoring with exponential time-decay
5. `packages/core/src/scorer/tags.ts` — Cap partial match accumulation
6. `packages/core/src/scorer/recency.ts` — Unify `isEntryStale()` and `scoreRecency()` staleness

### Phase C: Data Integrity (B→C for retention column fix)
7. `packages/daemon/src/store/db.ts` — Make `request_text` nullable; add `source_hash` column
8. `packages/daemon/src/store/events.ts` — Fix `insertToolEvent` column mapping
9. `packages/daemon/src/scheduler/retention.ts` — Fix `created_at` → `started_at`; fix console.log → console.error
10. `packages/daemon/src/index.ts` — Call `startRetentionScheduler()` on startup

### Phase D: Proposal Apply (depends on schema change in C)
11. `packages/daemon/src/routes/proposals.ts` — Implement full-file replacement with conflict detection

### Phase E: Input Validation & Convention Fixes (no dependencies)
12. `packages/cli/src/commands/inject.ts` — Add budget validation
13. `packages/cli/src/commands/run.ts` — Add budget validation
14. `packages/core/src/ctx/parser.ts` — Add type guards, return warnings
15. `packages/core/src/packer/budget.ts` — Replace console.warn with warnings array
16. `packages/core/src/ctx/merger.ts` — Fix ignore pattern directory boundaries
17. `packages/daemon/src/store/db.ts`, `packages/core/src/config/loader.ts`, `packages/cli/src/commands/daemon.ts` — Replace HOME/'~' with os.homedir()

## Verification

After each phase:
```bash
pnpm build && pnpm test && pnpm test:e2e
```

All 226 existing tests must continue to pass. New tests are added for each fix.

## Key Decisions

- **Proposal apply**: Full-file replacement (not patch), conflict detection via SHA-256 content hash
- **Locality scoring**: Ancestors score higher than siblings at same depth
- **Recency scoring**: Exponential decay, 30-day half-life, floor of 0.3
- **Tool events**: Nullable columns (not separate table)
- **Parser errors**: Lenient with warnings (skip malformed, continue parsing)
- **Ignore patterns**: Directory boundary fix (not full glob library)
