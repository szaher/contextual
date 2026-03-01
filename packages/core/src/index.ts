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
  ScoringConfig,
  AgentConfig,
  AutoApproveConfig,
  RetentionConfig,
} from './types/config.js';
export {
  DEFAULT_BUDGET_TOKENS,
  DEFAULT_SCORING_MODE,
  DEFAULT_SESSIONS_RETENTION_DAYS,
  DEFAULT_AUDIT_RETENTION_DAYS,
} from './types/config.js';

// Ctx operations
export { parseCtxFile, serializeCtxFile } from './ctx/parser.js';
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
export { detectDrift, detectAllDrift } from './differ/drift.js';
export type { StaleEntry, DriftResult } from './differ/drift.js';

// Config
export { loadProfile } from './config/loader.js';
export type { LoadedProfile, ProfileOverrides } from './config/loader.js';

// Hook types
export type { HookInputBase, HookOutput, HookConfig } from './types/hook.js';
export { DEFAULT_HOOK_CONFIG } from './types/hook.js';

// Utilities
export { detectSecrets, redactSecrets, containsSecrets } from './redact/secrets.js';
