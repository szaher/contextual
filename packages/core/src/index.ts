// Types
export type {
  CtxFile,
  KeyFile,
  Contract,
  ContractScope,
  Decision,
  Alternative,
  Gotcha,
  CtxRef,
  IgnorePolicy,
} from './types/ctx.js';
export { CURRENT_CTX_VERSION } from './types/ctx.js';

export type {
  CtxlIndex,
  CtxlEntry,
  CtxlGraphNode,
  CtxlScoringConfig,
  CtxlBudgetConfig,
  CtxlDefaults,
  CtxlPolicies,
} from './types/ctxl.js';
export {
  DEFAULT_SCORING_CONFIG,
  DEFAULT_BUDGET_CONFIG,
  DEFAULT_POLICIES,
  DEFAULT_CTXL_DEFAULTS,
} from './types/ctxl.js';

export type {
  HistoryEntry,
  CtxDiff,
  SectionDiff,
} from './types/history.js';
export { MAX_INLINE_HISTORY } from './types/history.js';

export type {
  LockInfo,
  LockHandle,
  LockOperation,
} from './types/lock.js';
export { DEFAULT_LOCK_TTL_MS } from './types/lock.js';

export type {
  ConflictEntry,
  MergeResult,
  MergeStrategy,
  ResolutionChoice,
  ResolutionRequest,
} from './types/conflict.js';
export { SECTION_MERGE_STRATEGIES } from './types/conflict.js';

export type {
  ActivityEvent,
  ActivityEventType,
} from './types/activity.js';

export type {
  AnalysisResult,
  BootstrapOptions,
  BootstrapProposal,
} from './types/bootstrap.js';
export { DEFAULT_BOOTSTRAP_OPTIONS } from './types/bootstrap.js';

export type {
  PrContext,
  PromptEntry,
  AgentDecision,
  DecisionSource,
  ContextUsed,
  FileChange,
  FileChangeType,
  CtxUpdate,
  SpecReference,
  PrStats,
} from './types/pr-context.js';

export type {
  PackItem,
  OmittedItem,
  ContextPack,
  ContextPackResult,
  DeepReadDecision,
  StalenessInfo,
} from './types/pack.js';
export { ReasonCode, ExclusionReason } from './types/pack.js';

export type {
  WorkspaceProfile,
  GlobalProfile,
  BudgetConfig,
  CategoryBudgets,
  ScoringConfig,
  ScoringWeights,
  AgentConfig,
  AutoApproveConfig,
  RetentionConfig,
  GitHooksConfig,
} from './types/config.js';
export {
  DEFAULT_BUDGET_TOKENS,
  DEFAULT_SCORING_MODE,
  DEFAULT_SESSIONS_RETENTION_DAYS,
  DEFAULT_AUDIT_RETENTION_DAYS,
} from './types/config.js';

// Ctx operations
export { parseCtxFile, serializeCtxFile } from './ctx/parser.js';
export type { ParseResult } from './ctx/parser.js';
export { validateCtxFile } from './ctx/validator.js';
export type { ValidationError } from './ctx/validator.js';
export { mergeCtxHierarchy } from './ctx/merger.js';
export type { MergeOptions, MergedContext } from './ctx/merger.js';
export { migrateCtx, migrateCtxFile, needsMigration } from './ctx/migrator.js';
export type { MigrationResult } from './ctx/migrator.js';

// Scoring
export { scoreEntries } from './scorer/scorer.js';
export type { ScoredEntry, ScoreOptions } from './scorer/scorer.js';
export { scoreLocality } from './scorer/locality.js';
export { scoreRecency, isEntryStale } from './scorer/recency.js';
export { scoreTags, extractKeywords } from './scorer/tags.js';

// Packing
export { buildContextPack } from './packer/packer.js';
export type { PackOptions } from './packer/packer.js';
export { applyBudget } from './packer/budget.js';
export type { BudgetOptions } from './packer/budget.js';
export { estimateTokens, createEstimator } from './packer/tokens.js';
export type { TokenEstimator } from './packer/tokens.js';

// Differ
export { generateDiff, diffCtxFiles, scanForDeadReferences } from './differ/differ.js';
export type { DiffResult, PruneProposal, PruneResult } from './differ/differ.js';
export { detectDrift, detectAllDrift, isValidVerifiedAt } from './differ/drift.js';
export type { StaleEntry, DriftResult } from './differ/drift.js';

// Config
export { loadProfile } from './config/loader.js';
export type { LoadedProfile, ProfileOverrides } from './config/loader.js';

// Hook types
export type { HookInputBase, HookOutput, HookConfig } from './types/hook.js';
export { DEFAULT_HOOK_CONFIG } from './types/hook.js';

// Versioning
export { bumpVersion, generateDiffSummary } from './versioning/bumper.js';
export { archiveHistory, readArchivedHistory, readMergedHistory } from './versioning/archive.js';
export { diffCtxVersions } from './versioning/differ.js';

// Index
export { findCtxFiles as findAllCtxFiles, generateIndex, writeIndex, readIndex } from './index/generator.js';
export { computeChecksum } from './index/checksum.js';
export { selectFromIndex } from './index/selector.js';
export type { IndexScoredEntry, SelectionResult, SelectOptions } from './index/selector.js';

// Conflict
export { threeWayMerge } from './conflict/merge-engine.js';
export { resolveConflict, resolveAllConflicts, extractConflicts } from './conflict/resolver.js';
export { acquireLock, releaseLock, checkLockStatus, getActiveLock, isLockExpired, ensureLockInGitignore } from './conflict/lock-manager.js';

// Migration v2
export { needsV2Init, initV2Features, initV2FeaturesFile } from './ctx/migrator.js';

// Bootstrap
export { analyzeDirectory, analyzeDirectories } from './bootstrap/analyzer.js';
export { generateProposal, generateProposals, applyProposals } from './bootstrap/generator.js';

// PR Context
export { collectPrContext } from './pr-context/collector.js';
export type { SessionData, RequestEventData, ToolEventData, CollectorOptions } from './pr-context/collector.js';
export { renderMarkdown as renderPrMarkdown, renderJson as renderPrJson, renderGhBody } from './pr-context/renderer.js';

// Auto-update
export { StalenessTracker, extractModifiedPath } from './auto-update/staleness-tracker.js';
export type { StaleSummary } from './auto-update/staleness-tracker.js';
export { generateProposals as generateUpdateProposals } from './auto-update/proposal-generator.js';
export type { UpdateProposal, ProposedChange } from './auto-update/proposal-generator.js';

// Index updater
export { updateIndexEntry } from './index/updater.js';

// Additional checksum exports
export { isValidChecksum, computeChecksumFromString } from './index/checksum.js';

// Git trailers
export type {
  TrailerData,
  ParsedTrailer,
  CommitContextRecord,
  HookPolicyMode,
  HookPolicy,
  HookFileStatus,
  HookInstallStatus,
} from './git/index.js';
export { formatTrailers } from './git/index.js';
export { parseTrailers } from './git/index.js';
export { queryCommitsWithTrailers } from './git/index.js';
export type { CommitLogOptions } from './git/commit-log.js';

// Utilities
export { detectSecrets, redactSecrets, containsSecrets } from './redact/secrets.js';
