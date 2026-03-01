# Core Library Reference

The `@ctxl/core` package provides all context engine functionality: parsing, scoring, packing, diffing, drift detection, configuration, and secret redaction. This page documents every exported function and type.

## Installation

```bash
pnpm add @ctxl/core
```

Or import from the monorepo:

```typescript
import { parseCtxFile, buildContextPack, scoreEntries } from '@ctxl/core'
```

---

## Parser

### `parseCtxFile(content: string): CtxFile`

Parse a `.ctx` YAML string into a typed `CtxFile` object. Applies sensible defaults for missing optional fields.

```typescript
import { parseCtxFile } from '@ctxl/core'

const ctx = parseCtxFile(`
version: 1
summary: "My project"
key_files:
  - path: src/index.ts
    purpose: "Entry point"
    tags: [entry]
    verified_at: "2026-01-15"
    locked: false
    owner: null
tags: [typescript]
`)

console.log(ctx.summary)     // "My project"
console.log(ctx.key_files)   // [{path: "src/index.ts", ...}]
```

Throws an `Error` if the input is not valid YAML or is not a mapping.

### `serializeCtxFile(ctx: CtxFile): string`

Serialize a `CtxFile` object to a YAML string. Uses double-quoting, 80-character line width, and preserves key order.

```typescript
import { serializeCtxFile } from '@ctxl/core'

const yaml = serializeCtxFile(ctx)
// version: 1
// summary: "My project"
// ...
```

### `validateCtxFile(ctx: CtxFile): ValidationError[]`

Validate a parsed `CtxFile` for structural correctness. Returns an array of errors and warnings.

```typescript
import { parseCtxFile, validateCtxFile } from '@ctxl/core'

const ctx = parseCtxFile(content)
const errors = validateCtxFile(ctx)

for (const err of errors) {
  console.log(`[${err.severity}] ${err.path}: ${err.message}`)
}
```

```typescript
interface ValidationError {
  path: string;       // Location in the .ctx structure (e.g., "key_files[0].path")
  message: string;    // Human-readable error description
  severity: 'error' | 'warning';
}
```

---

## Merger

### `mergeCtxHierarchy(options: MergeOptions): MergedContext`

Load and merge `.ctx` files hierarchically from `workingDir` up to `repoRoot`. Follows refs with cycle detection.

```typescript
import { mergeCtxHierarchy } from '@ctxl/core'

const merged = mergeCtxHierarchy({
  workingDir: '/path/to/repo/src/auth',
  repoRoot: '/path/to/repo',
})

console.log(merged.sources)   // ["src/auth/.ctx", "src/.ctx", ".ctx"]
console.log(merged.warnings)  // Any merge warnings (cycles, parse errors)
console.log(merged.ctx)       // The merged CtxFile
```

```typescript
interface MergeOptions {
  workingDir: string;         // Directory to start loading from
  repoRoot: string;           // Repository root directory
  maxRefDepth?: number;       // Maximum ref following depth (default: 10)
  ignorePolicy?: IgnorePolicy; // Additional ignore rules to apply
}

interface MergedContext {
  ctx: CtxFile;               // The merged .ctx data
  sources: string[];          // Source .ctx files (relative to repo root, highest priority first)
  warnings: string[];         // Warnings (cycles, max depth, parse errors)
}
```

---

## Scorer

### `scoreEntries(sources, options): ScoredEntry[]`

Score all entries from merged `.ctx` sources. Returns entries sorted by score (highest first) with deterministic tiebreakers.

```typescript
import { scoreEntries } from '@ctxl/core'

const scored = scoreEntries(
  [{ path: '.ctx', ctx: parsedCtx }],
  {
    workingDir: '/path/to/repo/src/auth',
    repoRoot: '/path/to/repo',
    requestText: 'fix the auth bug',
    touchedFiles: ['src/auth/login.ts'],
  }
)

for (const entry of scored) {
  console.log(`${entry.entry_id}: ${entry.score} [${entry.reason_codes.join(', ')}]`)
}
```

```typescript
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

### `scoreLocality(workingDir, ctxSourcePath, repoRoot): number`

Compute locality score based on directory distance. Returns 1.0 for same directory, decays by 0.2 per level, minimum 0.1.

```typescript
import { scoreLocality } from '@ctxl/core'

scoreLocality('/repo/src/auth', '/repo/src/auth/.ctx', '/repo')  // 1.0
scoreLocality('/repo/src/auth', '/repo/src/.ctx', '/repo')       // 0.8
scoreLocality('/repo/src/auth', '/repo/.ctx', '/repo')           // 0.6
```

### `scoreRecency(verifiedAt, isStale): number`

Compute recency score based on verification status.

```typescript
import { scoreRecency } from '@ctxl/core'

scoreRecency('abc1234', false)  // 0.9 (verified, not stale)
scoreRecency('', false)          // 0.5 (no verification data)
scoreRecency('abc1234', true)    // 0.3 (marked stale)
```

### `scoreTags(requestKeywords, entryTags): number`

Compute tag matching score. Returns ratio of matched tags to total tags.

```typescript
import { scoreTags } from '@ctxl/core'

scoreTags(['auth', 'login'], ['auth', 'login'])   // 1.0
scoreTags(['auth'], ['auth', 'login'])              // 0.5
scoreTags(['database'], ['auth', 'login'])          // 0.0
```

### `extractKeywords(requestText): string[]`

Extract keywords from request text for tag matching. Tokenizes, lowercases, filters short words and stop words.

```typescript
import { extractKeywords } from '@ctxl/core'

extractKeywords('fix the auth bug in login handler')
// ['fix', 'auth', 'bug', 'login', 'handler']
```

---

## Packer

### `buildContextPack(options): ContextPackResult`

Assemble a complete Context Pack for a request. This is the main entry point that orchestrates merging, scoring, budget application, and deep-read fallback.

```typescript
import { buildContextPack } from '@ctxl/core'

const result = buildContextPack({
  workingDir: '/path/to/repo/src/auth',
  repoRoot: '/path/to/repo',
  requestText: 'fix the auth bug',
  touchedFiles: ['src/auth/login.ts'],
  budgetTokens: 4000,
})

console.log(result.pack.items.length)     // Number of included items
console.log(result.pack.total_tokens)      // Total tokens used
console.log(result.pack.omitted.length)    // Number of omitted items
console.log(result.deep_read)              // Deep-read decision (or null)
```

```typescript
interface PackOptions {
  workingDir: string;
  repoRoot: string;
  requestText: string;
  touchedFiles?: string[];
  budgetTokens?: number;         // Default: 4000
  profile?: LoadedProfile;       // Optional profile for config overrides
}

interface ContextPackResult {
  event_id: string | null;
  pack: ContextPack;
  deep_read: DeepReadDecision | null;
}
```

### `applyBudget(entries, options?): ContextPack`

Apply token budget to scored entries. Contracts get priority. Returns a `ContextPack` with included items and omitted items list.

```typescript
import { applyBudget } from '@ctxl/core'

const pack = applyBudget(scoredEntries, { budgetTokens: 4000 })
```

```typescript
interface BudgetOptions {
  budgetTokens?: number;  // Default: 4000
}
```

### `estimateTokens(text): number`

Estimate token count for a text string.

```typescript
import { estimateTokens } from '@ctxl/core'

const tokens = estimateTokens('This is some content')
```

### `createEstimator(): TokenEstimator`

Create a token estimator instance (for custom implementations).

---

## Differ

### `generateDiff(oldContent, newContent, filePath?): DiffResult`

Generate a unified diff between old and new content. Automatically redacts secrets.

```typescript
import { generateDiff } from '@ctxl/core'

const result = generateDiff(oldYaml, newYaml, 'src/auth/.ctx')

console.log(result.diff)              // Unified diff string
console.log(result.hasChanges)        // true if content differs
console.log(result.secretsRedacted)   // true if secrets were found
```

```typescript
interface DiffResult {
  diff: string;
  hasChanges: boolean;
  secretsRedacted: boolean;
}
```

### `diffCtxFiles(oldCtx, newCtx, filePath?): DiffResult`

Generate a diff between two `CtxFile` objects. Serializes both to YAML first, then computes the unified diff.

```typescript
import { diffCtxFiles } from '@ctxl/core'

const result = diffCtxFiles(oldCtx, newCtx, '.ctx')
```

### `scanForDeadReferences(ctxPath, repoRoot): PruneResult`

Scan a `.ctx` file for dead references (deleted/renamed files and missing ref targets). Returns proposals for fixing them.

```typescript
import { scanForDeadReferences } from '@ctxl/core'

const result = scanForDeadReferences('/path/to/.ctx', '/path/to/repo')

for (const proposal of result.proposals) {
  console.log(`${proposal.action} ${proposal.section}/${proposal.entryId}: ${proposal.reason}`)
}

if (result.diff) {
  console.log(result.diff.diff)
}
```

```typescript
interface PruneResult {
  ctxPath: string;
  proposals: PruneProposal[];
  diff: DiffResult | null;
}

interface PruneProposal {
  section: string;        // key_files, refs, etc.
  entryId: string;        // Entry identifier
  action: 'remove' | 'update';
  reason: string;         // Human-readable justification
  details: string;        // Specific details about what changed
}
```

---

## Drift

### `detectDrift(ctxPath, repoRoot): DriftResult`

Detect drift for a single `.ctx` file by checking referenced files against git history.

```typescript
import { detectDrift } from '@ctxl/core'

const result = detectDrift('/path/to/src/auth/.ctx', '/path/to/repo')

for (const entry of result.stale_entries) {
  console.log(`${entry.section}/${entry.entry_id}: ${entry.reason} - ${entry.details}`)
}
```

### `detectAllDrift(repoRoot): DriftResult[]`

Detect drift for all `.ctx` files in a repository. Finds `.ctx` files recursively (excluding `node_modules/` and `.git/`).

```typescript
import { detectAllDrift } from '@ctxl/core'

const results = detectAllDrift('/path/to/repo')

for (const result of results) {
  if (result.total_stale > 0) {
    console.log(`${result.ctx_path}: ${result.total_stale} stale entries`)
  }
}
```

```typescript
interface DriftResult {
  ctx_path: string;
  stale_entries: StaleEntry[];
  total_stale: number;
}

interface StaleEntry {
  section: string;
  entry_id: string;
  verified_at: string;
  current_commit: string;
  reason: 'file_deleted' | 'file_renamed' | 'file_modified' | 'commit_unknown';
  details: string;
}
```

---

## Config

### `loadProfile(repoRoot, overrides?): LoadedProfile`

Load the configuration profile with the full precedence chain: defaults -> global -> workspace -> agent -> request overrides.

```typescript
import { loadProfile } from '@ctxl/core'

const profile = loadProfile('/path/to/repo', {
  budgetTokens: 8000,
  scoringMode: 'lexical',
  agentId: 'claude',
})

console.log(profile.budget.default_tokens)  // 8000
console.log(profile.scoring.mode)            // "lexical"
console.log(profile.ignore.never_read)       // Combined ignore rules
console.log(profile.sources)                 // ["defaults", "~/.ctxl/config.yaml", ...]
```

```typescript
interface LoadedProfile {
  budget: BudgetConfig;
  scoring: ScoringConfig;
  ignore: IgnorePolicy;
  auto_approve: AutoApproveConfig;
  retention: RetentionConfig;
  sources: string[];       // Which config files contributed
}

interface ProfileOverrides {
  budgetTokens?: number;
  scoringMode?: 'lexical' | 'hybrid';
  agentId?: string;
}
```

---

## Security

### `detectSecrets(text): SecretMatch[]`

Scan text for potential secrets. Returns an array of matches with pattern name, position, and line number.

```typescript
import { detectSecrets } from '@ctxl/core'

const matches = detectSecrets(content)
for (const match of matches) {
  console.log(`Found ${match.name} at line ${match.line}`)
}
```

```typescript
interface SecretMatch {
  name: string;    // Pattern name (e.g., "aws_access_key")
  index: number;   // Character index in the line
  length: number;  // Length of the match
  line: number;    // Line number (1-based)
}
```

### `redactSecrets(text): string`

Redact all detected secrets from text, replacing with `[REDACTED:<type>]` markers.

```typescript
import { redactSecrets } from '@ctxl/core'

const safe = redactSecrets('api_key = sk-abcdefghijklmnop123456789012345678901234')
// 'api_key = [REDACTED:api_key]'
```

### `containsSecrets(text): boolean`

Check if text contains any potential secrets. Returns `true` if any pattern matches.

```typescript
import { containsSecrets } from '@ctxl/core'

if (containsSecrets(proposedContent)) {
  console.warn('Content contains potential secrets')
}
```

---

## Migration

### `migrateCtx(content): string`

Migrate a `.ctx` file content string to the latest version.

### `migrateCtxFile(ctx): CtxFile`

Migrate a parsed `CtxFile` object to the latest version.

### `needsMigration(ctx): boolean`

Check if a `CtxFile` needs migration to a newer version.

```typescript
import { parseCtxFile, needsMigration, migrateCtxFile } from '@ctxl/core'

const ctx = parseCtxFile(content)
if (needsMigration(ctx)) {
  const migrated = migrateCtxFile(ctx)
  // Use migrated version
}
```

---

## Types

### `CtxFile`

```typescript
interface CtxFile {
  version: number;
  summary: string;
  key_files: KeyFile[];
  contracts: Contract[];
  decisions: Decision[];
  commands: Record<string, string>;
  gotchas: Gotcha[];
  tags: string[];
  refs: CtxRef[];
  ignore: IgnorePolicy;
}
```

### `ContextPack`

```typescript
interface ContextPack {
  version: number;
  items: PackItem[];
  omitted: OmittedItem[];
  total_tokens: number;
  budget_tokens: number;
  budget_used_pct: number;
}
```

### `ReasonCode` (enum)

```typescript
enum ReasonCode {
  LOCALITY_HIGH = 'LOCALITY_HIGH',
  TAG_MATCH = 'TAG_MATCH',
  PINNED = 'PINNED',
  RECENT_EDIT = 'RECENT_EDIT',
  CONTRACT_REQUIRED = 'CONTRACT_REQUIRED',
  DEEP_READ = 'DEEP_READ',
}
```

### `ExclusionReason` (enum)

```typescript
enum ExclusionReason {
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  LOW_SCORE = 'LOW_SCORE',
  IGNORED = 'IGNORED',
  STALE = 'STALE',
}
```

### Constants

```typescript
const CURRENT_CTX_VERSION = 1;
const DEFAULT_BUDGET_TOKENS = 4000;
const DEFAULT_SCORING_MODE = 'lexical';
const DEFAULT_SESSIONS_RETENTION_DAYS = 30;
const DEFAULT_AUDIT_RETENTION_DAYS = 90;
```

For complete type definitions, see the source files in `packages/core/src/types/`.
