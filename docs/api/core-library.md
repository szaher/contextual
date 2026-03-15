# Core Library Reference

The `@ctxkit/core` package provides all context engine functionality: parsing, scoring, packing, diffing, drift detection, configuration, and secret redaction. This page documents every exported function and type.

## Installation

```bash
pnpm add @ctxkit/core
```

Or import from the monorepo:

```typescript
import { parseCtxFile, buildContextPack, scoreEntries } from '@ctxkit/core'
```

---

## Parser

### `parseCtxFile(content: string): CtxFile`

Parse a `.ctx` YAML string into a typed `CtxFile` object. Applies sensible defaults for missing optional fields.

```typescript
import { parseCtxFile } from '@ctxkit/core'

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
import { serializeCtxFile } from '@ctxkit/core'

const yaml = serializeCtxFile(ctx)
// version: 1
// summary: "My project"
// ...
```

### `validateCtxFile(ctx: CtxFile): ValidationError[]`

Validate a parsed `CtxFile` for structural correctness. Returns an array of errors and warnings.

```typescript
import { parseCtxFile, validateCtxFile } from '@ctxkit/core'

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
import { mergeCtxHierarchy } from '@ctxkit/core'

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
import { scoreEntries } from '@ctxkit/core'

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
import { scoreLocality } from '@ctxkit/core'

scoreLocality('/repo/src/auth', '/repo/src/auth/.ctx', '/repo')  // 1.0
scoreLocality('/repo/src/auth', '/repo/src/.ctx', '/repo')       // 0.8
scoreLocality('/repo/src/auth', '/repo/.ctx', '/repo')           // 0.6
```

### `scoreRecency(verifiedAt, isStale): number`

Compute recency score based on verification status.

```typescript
import { scoreRecency } from '@ctxkit/core'

scoreRecency('abc1234', false)  // 0.9 (verified, not stale)
scoreRecency('', false)          // 0.5 (no verification data)
scoreRecency('abc1234', true)    // 0.3 (marked stale)
```

### `scoreTags(requestKeywords, entryTags): number`

Compute tag matching score. Returns ratio of matched tags to total tags.

```typescript
import { scoreTags } from '@ctxkit/core'

scoreTags(['auth', 'login'], ['auth', 'login'])   // 1.0
scoreTags(['auth'], ['auth', 'login'])              // 0.5
scoreTags(['database'], ['auth', 'login'])          // 0.0
```

### `extractKeywords(requestText): string[]`

Extract keywords from request text for tag matching. Tokenizes, lowercases, filters short words and stop words.

```typescript
import { extractKeywords } from '@ctxkit/core'

extractKeywords('fix the auth bug in login handler')
// ['fix', 'auth', 'bug', 'login', 'handler']
```

---

## Packer

### `buildContextPack(options): ContextPackResult`

Assemble a complete Context Pack for a request. This is the main entry point that orchestrates merging, scoring, budget application, and deep-read fallback.

```typescript
import { buildContextPack } from '@ctxkit/core'

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
import { applyBudget } from '@ctxkit/core'

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
import { estimateTokens } from '@ctxkit/core'

const tokens = estimateTokens('This is some content')
```

### `createEstimator(): TokenEstimator`

Create a token estimator instance (for custom implementations).

---

## Differ

### `generateDiff(oldContent, newContent, filePath?): DiffResult`

Generate a unified diff between old and new content. Automatically redacts secrets.

```typescript
import { generateDiff } from '@ctxkit/core'

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
import { diffCtxFiles } from '@ctxkit/core'

const result = diffCtxFiles(oldCtx, newCtx, '.ctx')
```

### `scanForDeadReferences(ctxPath, repoRoot): PruneResult`

Scan a `.ctx` file for dead references (deleted/renamed files and missing ref targets). Returns proposals for fixing them.

```typescript
import { scanForDeadReferences } from '@ctxkit/core'

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
import { detectDrift } from '@ctxkit/core'

const result = detectDrift('/path/to/src/auth/.ctx', '/path/to/repo')

for (const entry of result.stale_entries) {
  console.log(`${entry.section}/${entry.entry_id}: ${entry.reason} - ${entry.details}`)
}
```

### `detectAllDrift(repoRoot): DriftResult[]`

Detect drift for all `.ctx` files in a repository. Finds `.ctx` files recursively (excluding `node_modules/` and `.git/`).

```typescript
import { detectAllDrift } from '@ctxkit/core'

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
import { loadProfile } from '@ctxkit/core'

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
import { detectSecrets } from '@ctxkit/core'

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
import { redactSecrets } from '@ctxkit/core'

const safe = redactSecrets('api_key = sk-abcdefghijklmnop123456789012345678901234')
// 'api_key = [REDACTED:api_key]'
```

### `containsSecrets(text): boolean`

Check if text contains any potential secrets. Returns `true` if any pattern matches.

```typescript
import { containsSecrets } from '@ctxkit/core'

if (containsSecrets(proposedContent)) {
  console.warn('Content contains potential secrets')
}
```

---

## Index

### `generateIndex(repoRoot): IndexFile`

Scan all `.ctx` files in a repository and generate the `.ctxl` index.

```typescript
import { generateIndex } from '@ctxkit/core'

const index = generateIndex('/path/to/repo')

console.log(index.entries.length)    // Number of .ctx files found
console.log(index.generated_at)      // ISO 8601 timestamp
```

### `writeIndex(repoRoot, index): void`

Write an `IndexFile` to the `.ctxl` file at the repository root.

```typescript
import { generateIndex, writeIndex } from '@ctxkit/core'

const index = generateIndex('/path/to/repo')
writeIndex('/path/to/repo', index)
```

### `readIndex(repoRoot): IndexFile | null`

Read the `.ctxl` index file. Returns `null` if no index exists.

```typescript
import { readIndex } from '@ctxkit/core'

const index = readIndex('/path/to/repo')
if (index) {
  for (const entry of index.entries) {
    console.log(`${entry.path}: ${entry.token_estimate} tokens`)
  }
}
```

### `selectFromIndex(index, criteria): IndexEntry[]`

Select index entries matching the given criteria (tags, path prefix, budget).

```typescript
import { readIndex, selectFromIndex } from '@ctxkit/core'

const index = readIndex('/path/to/repo')
const selected = selectFromIndex(index, {
  tags: ['auth', 'security'],
  pathPrefix: 'src/',
  budgetTokens: 2000,
})
```

### `computeChecksum(content): string`

Compute the SHA-256 checksum of `.ctx` file content, excluding `_history` fields.

```typescript
import { computeChecksum } from '@ctxkit/core'

const checksum = computeChecksum(ctxFileContent)
// "sha256:a1b2c3d4e5f6..."
```

```typescript
interface IndexFile {
  version: number;
  generated_at: string;
  entries: IndexEntry[];
}

interface IndexEntry {
  path: string;
  summary: string;
  tags: string[];
  depth: number;
  ctx_version: number;
  last_modified: string;
  checksum: string;
  dependencies: {
    depends_on: string[];
    depended_by: string[];
  };
  weight: number;
  sections: string[];
  token_estimate: number;
}
```

---

## Versioning

### `bumpVersion(ctx, options): CtxFile`

Increment the `ctx_version` field and add a history entry.

```typescript
import { bumpVersion } from '@ctxkit/core'

const updated = bumpVersion(ctx, {
  author: 'claude:sess_abc123',
  session_id: 'sess_abc123',
  reason: 'Added new key_file for refactored handler',
  diff_summary: '+key_files/sign-in.ts, ~summary',
})

console.log(updated.ctx_version)  // previous + 1
```

### `generateDiffSummary(oldCtx, newCtx): string`

Generate a compact diff summary string describing what changed between two `CtxFile` versions.

```typescript
import { generateDiffSummary } from '@ctxkit/core'

const summary = generateDiffSummary(oldCtx, newCtx)
// "+key_files/sign-in.ts, ~summary, -gotchas/old-warning"
```

### `archiveHistory(ctxPath): void`

Move overflow history entries (beyond 20) to the `.ctxl.history/` archive directory.

```typescript
import { archiveHistory } from '@ctxkit/core'

archiveHistory('/path/to/src/auth/.ctx')
// Creates or appends to src/auth/.ctxl.history/
```

### `readMergedHistory(ctxPath): HistoryEntry[]`

Read the complete history for a `.ctx` file, merging inline `_history` with archived entries. Returns entries sorted by version (ascending).

```typescript
import { readMergedHistory } from '@ctxkit/core'

const history = readMergedHistory('/path/to/src/auth/.ctx')
for (const entry of history) {
  console.log(`v${entry.version}: ${entry.reason} (${entry.author})`)
}
```

### `diffCtxVersions(ctxPath, fromVersion, toVersion): string`

Generate a unified diff between two historical versions of a `.ctx` file.

```typescript
import { diffCtxVersions } from '@ctxkit/core'

const diff = diffCtxVersions('/path/to/src/auth/.ctx', 1, 5)
console.log(diff)  // Unified diff output
```

```typescript
interface HistoryEntry {
  version: number;
  timestamp: string;
  author: string;
  session_id: string | null;
  reason: string;
  checksum: string;
  diff_summary: string;
}
```

---

## Conflicts

### `threeWayMerge(base, ours, theirs): MergeResult`

Perform a three-way merge on `.ctx` files. Returns the merged result with any unresolvable conflicts marked.

```typescript
import { threeWayMerge } from '@ctxkit/core'

const result = threeWayMerge(baseCtx, oursCtx, theirsCtx)

if (result.has_conflicts) {
  console.log(`${result.conflicts.length} conflicts found`)
} else {
  console.log('Merge successful')
}
```

### `resolveConflict(mergeResult, pick): CtxFile`

Resolve all conflicts in a merge result by picking a side.

```typescript
import { threeWayMerge, resolveConflict } from '@ctxkit/core'

const result = threeWayMerge(base, ours, theirs)
const resolved = resolveConflict(result, 'ours')
```

### `extractConflicts(mergeResult): ConflictEntry[]`

Extract conflict entries from a merge result.

```typescript
import { threeWayMerge, extractConflicts } from '@ctxkit/core'

const result = threeWayMerge(base, ours, theirs)
const conflicts = extractConflicts(result)
for (const conflict of conflicts) {
  console.log(`${conflict.section}: ours="${conflict.ours}" theirs="${conflict.theirs}"`)
}
```

### `acquireLock(ctxPath, options): LockResult`

Acquire an advisory lock on a `.ctx` file to prevent concurrent modification.

```typescript
import { acquireLock } from '@ctxkit/core'

const lock = acquireLock('/path/to/.ctx', {
  session_id: 'sess_abc123',
  agent_id: 'claude',
})

if (lock.acquired) {
  // Safe to modify
} else {
  console.log(`Held by ${lock.holder.agent_id}`)
}
```

### `releaseLock(ctxPath, lockId): void`

Release a previously acquired lock.

```typescript
import { acquireLock, releaseLock } from '@ctxkit/core'

const lock = acquireLock(ctxPath, options)
// ... modify the file ...
releaseLock(ctxPath, lock.id)
```

```typescript
interface MergeResult {
  ctx: CtxFile;
  has_conflicts: boolean;
  conflicts: ConflictEntry[];
}

interface ConflictEntry {
  section: string;
  ours: any;
  theirs: any;
  base: any;
  created_at: string;
  session_ours: string;
  session_theirs: string;
}

interface LockResult {
  acquired: boolean;
  id: string;
  holder: {
    session_id: string;
    agent_id: string;
    acquired_at: string;
  };
}
```

---

## Bootstrap

### `analyzeDirectory(dirPath, options?): DirectoryAnalysis`

Inspect a directory's contents and extract metadata for `.ctx` generation.

```typescript
import { analyzeDirectory } from '@ctxkit/core'

const analysis = analyzeDirectory('/path/to/repo/src/auth', {
  mode: 'full',
})

console.log(analysis.summary)      // "Authentication module"
console.log(analysis.key_files)    // [{path: 'login.ts', purpose: '...'}]
console.log(analysis.tags)         // ['auth', 'typescript']
console.log(analysis.commands)     // {test: 'vitest run'}
```

### `generateProposal(analysis): CtxFile`

Generate a `.ctx` file proposal from a directory analysis result.

```typescript
import { analyzeDirectory, generateProposal } from '@ctxkit/core'

const analysis = analyzeDirectory('/path/to/src/auth', { mode: 'quick' })
const ctx = generateProposal(analysis)
```

### `applyProposals(repoRoot, proposals, options?): ApplyResult[]`

Write `.ctx` files and generate the index.

```typescript
import { applyProposals } from '@ctxkit/core'

const results = applyProposals('/path/to/repo', proposals, {
  skipExisting: true,
  dryRun: false,
})

for (const result of results) {
  console.log(`${result.path}: ${result.action}`)  // "created" or "skipped"
}
```

```typescript
interface DirectoryAnalysis {
  dirPath: string;
  summary: string;
  key_files: Array<{ path: string; purpose: string }>;
  tags: string[];
  commands: Record<string, string>;
  contracts: Array<{ name: string; content: string }>;
}

interface ApplyResult {
  path: string;
  action: 'created' | 'updated' | 'skipped';
}
```

---

## PR Context

### `collectPrContext(options): PrContext`

Collect session data for PR context generation.

```typescript
import { collectPrContext } from '@ctxkit/core'

const context = await collectPrContext({
  daemonUrl: 'http://localhost:3742',
  branch: 'feature/auth-refactor',
  sessionId: 'sess_abc123',
})
```

### `renderPrMarkdown(context): string`

Render PR context as a markdown string.

```typescript
import { collectPrContext, renderPrMarkdown } from '@ctxkit/core'

const context = await collectPrContext(options)
const md = renderPrMarkdown(context)
```

### `renderPrJson(context): object`

Render PR context as a structured JSON object.

```typescript
import { collectPrContext, renderPrJson } from '@ctxkit/core'

const context = await collectPrContext(options)
const json = renderPrJson(context)
```

### `renderGhBody(context): string`

Render PR context formatted for GitHub PR descriptions, with collapsible sections.

```typescript
import { collectPrContext, renderGhBody } from '@ctxkit/core'

const context = await collectPrContext(options)
const body = renderGhBody(context)
```

```typescript
interface PrContext {
  summary: string;
  prompt_chain: Array<{ index: number; text: string; timestamp: string }>;
  decisions: Array<{ description: string; rationale: string }>;
  file_changes: Array<{ path: string; action: string; lines_added: number; lines_removed: number }>;
  context_used: Array<{ source: string; section: string; entry_id: string; score: number; reason_codes: string[] }>;
  stats: {
    session_id: string;
    duration_seconds: number;
    request_count: number;
    tokens_used: number;
    tokens_budget: number;
    files_changed: number;
    ctx_files_updated: number;
  };
}
```

---

## Auto-Update

### `StalenessTracker`

Tracks which directories have been modified during a session.

```typescript
import { StalenessTracker } from '@ctxkit/core'

const tracker = new StalenessTracker()

tracker.markStale('/path/to/src/auth', {
  file: 'login.ts',
  action: 'modified',
  timestamp: new Date().toISOString(),
})

tracker.isStale('/path/to/src/auth')         // true
tracker.getStaleDirectories()                 // [{ dir: '...', files: [...], lastModified: '...' }]
tracker.clearAll()                            // Reset
```

### `extractModifiedPath(event): string | null`

Extract the file path modified by a tool event.

```typescript
import { extractModifiedPath } from '@ctxkit/core'

const path = extractModifiedPath({
  tool_name: 'file_edit',
  tool_input: { file_path: '/path/to/src/auth/login.ts' },
})
// '/path/to/src/auth/login.ts'
```

### `generateUpdateProposals(staleDirectories, repoRoot): Proposal[]`

Generate `.ctx` update proposals for directories that have been modified.

```typescript
import { StalenessTracker, generateUpdateProposals } from '@ctxkit/core'

const tracker = new StalenessTracker()
// ... after session modifications ...

const proposals = generateUpdateProposals(
  tracker.getStaleDirectories(),
  '/path/to/repo',
)

for (const proposal of proposals) {
  console.log(`${proposal.ctx_path}: ${proposal.diff_summary}`)
}
```

---

## Migration

### `needsV2Init(ctx): boolean`

Check if a `CtxFile` needs v2 initialization (has `version: 1` or is missing v2 fields).

```typescript
import { parseCtxFile, needsV2Init } from '@ctxkit/core'

const ctx = parseCtxFile(content)
if (needsV2Init(ctx)) {
  // File needs migration
}
```

### `initV2Features(ctx, options): CtxFile`

Initialize v2 features on a v1 `CtxFile`: sets `version: 2`, adds `ctx_version`, `_history`, and computes the checksum.

```typescript
import { parseCtxFile, needsV2Init, initV2Features } from '@ctxkit/core'

const ctx = parseCtxFile(content)
if (needsV2Init(ctx)) {
  const migrated = initV2Features(ctx, {
    author: 'migration',
    reason: 'Migrated from v1 to v2',
  })
  // Write migrated file
}
```

### `migrateCtx(content): string`

Migrate a `.ctx` file content string to the latest version.

### `migrateCtxFile(ctx): CtxFile`

Migrate a parsed `CtxFile` object to the latest version.

### `needsMigration(ctx): boolean`

Check if a `CtxFile` needs migration to a newer version.

```typescript
import { parseCtxFile, needsMigration, migrateCtxFile } from '@ctxkit/core'

const ctx = parseCtxFile(content)
if (needsMigration(ctx)) {
  const migrated = migrateCtxFile(ctx)
  // Use migrated version
}
```

---

## Git Trailers

### `formatTrailers(data: TrailerData): string`

Format context data into `Ctxkit-*` git trailer lines. Applies secret redaction to all values before formatting. Returns an empty string if no meaningful data is present.

```typescript
import { formatTrailers } from '@ctxkit/core'

const trailers = formatTrailers({
  sessionId: 'sess_7d2f4a1b',
  files: ['src/auth/.ctx', 'src/api/.ctx'],
  entries: 3,
  timestamp: new Date().toISOString(),
})
// "Ctxkit-Session: sess_7d2f4a1b\nCtxkit-Files: src/auth/.ctx, src/api/.ctx\nCtxkit-Entries: 3\nCtxkit-Timestamp: 2026-03-15T14:30:00Z"
```

### `parseTrailers(commitMessage: string): ParsedTrailer | null`

Extract `Ctxkit-*` trailers from a commit message. Returns `null` if no `Ctxkit-*` trailers are found.

```typescript
import { parseTrailers } from '@ctxkit/core'

const parsed = parseTrailers(commitMessage)
if (parsed) {
  console.log(parsed.sessionId)  // "sess_7d2f4a1b"
  console.log(parsed.files)      // ["src/auth/.ctx", "src/api/.ctx"]
  console.log(parsed.entries)    // 3
  console.log(parsed.timestamp)  // "2026-03-15T14:30:00Z"
}
```

### `queryCommitsWithTrailers(cwd, options): CommitContextRecord[]`

Query git log and parse `Ctxkit-*` trailers from each commit. Supports filtering by date range, session ID, and result limit.

```typescript
import { queryCommitsWithTrailers } from '@ctxkit/core'

const commits = queryCommitsWithTrailers('/path/to/repo', {
  since: '2026-03-01',
  limit: 50,
  sessionId: 'sess_7d2f4a1b',
})

for (const commit of commits) {
  console.log(`${commit.commitHash}: ${commit.messageSubject}`)
  console.log(`  Session: ${commit.sessionId}`)
  console.log(`  Files: ${commit.filesChanged.join(', ')}`)
}
```

```typescript
interface TrailerData {
  sessionId?: string;
  files?: string[];
  entries?: number;
  timestamp: string;
}

interface ParsedTrailer {
  sessionId: string | null;
  files: string[];
  entries: number | null;
  timestamp: string;
}

interface CommitContextRecord {
  commitHash: string;
  sessionId: string | null;
  filesChanged: string[];
  entryCount: number;
  trailerTimestamp: string;
  author: string;
  messageSubject: string;
  indexedAt?: string;
}

interface CommitLogOptions {
  since?: string;
  until?: string;
  limit?: number;
  sessionId?: string;
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
const CURRENT_CTX_VERSION = 2;
const DEFAULT_BUDGET_TOKENS = 4000;
const DEFAULT_SCORING_MODE = 'lexical';
const DEFAULT_SESSIONS_RETENTION_DAYS = 30;
const DEFAULT_AUDIT_RETENTION_DAYS = 90;
const MAX_INLINE_HISTORY = 20;
```

For complete type definitions, see the source files in `packages/core/src/types/`.
