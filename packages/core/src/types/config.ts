import type { IgnorePolicy } from './ctx.js';
import type { HookConfig } from './hook.js';

export interface GitHooksConfig {
  auto_install: 'auto' | 'prompt' | 'skip';
}

export interface WorkspaceProfile {
  version: number;
  budget: BudgetConfig;
  scoring: ScoringConfig;
  ignore: IgnorePolicy;
  agents: Record<string, AgentConfig>;
  auto_approve: AutoApproveConfig;
  retention: RetentionConfig;
  hooks?: HookConfig;
  git_hooks?: GitHooksConfig;
}

export interface GlobalProfile {
  version: number;
  global_ctx: string;
  budget: BudgetConfig;
  ignore: IgnorePolicy;
}

export interface BudgetConfig {
  default_tokens: number;
  /** Per-category budget fractions (v2). All fractions should sum to 1.0. */
  category_budgets?: CategoryBudgets;
}

/** Per-category budget allocation fractions */
export interface CategoryBudgets {
  /** Fraction for contracts (default 0.20) */
  contracts: number;
  /** Fraction for cwd ancestor .ctx files (default 0.30) */
  local_ctx: number;
  /** Fraction for highest-scored remaining (default 0.35) */
  related_ctx: number;
  /** Fraction for _history of selected files (default 0.10) */
  history: number;
  /** Fraction for deep-read fallback (default 0.05) */
  reserve: number;
}

export interface ScoringConfig {
  mode: 'lexical' | 'hybrid';
  /** Configurable scoring weights (v2). If not set, defaults are used. */
  weights?: ScoringWeights;
}

/** Configurable scoring weight fields for index-based selection */
export interface ScoringWeights {
  /** Weight for path distance scoring (0-1, default 0.5) */
  locality_weight: number;
  /** Weight for modification recency (0-1, default 0.3) */
  recency_weight: number;
  /** Weight for tag/keyword matching (0-1, default 0.2) */
  tag_match_weight: number;
  /** Bonus per depended-by edge (0-1, default 0.1) */
  dependency_bonus: number;
  /** Minimum score for scope-matched contracts (0-1, default 0.9) */
  contract_floor: number;
}

export interface AgentConfig {
  budget_tokens: number;
  mode: 'lexical' | 'hybrid';
}

export interface AutoApproveConfig {
  sections: string[];
  excluded_owners: string[];
}

export interface RetentionConfig {
  sessions_days: number;
  audit_days: number;
}

/** System defaults */
export const DEFAULT_BUDGET_TOKENS = 4000;
export const DEFAULT_SCORING_MODE: ScoringConfig['mode'] = 'lexical';
export const DEFAULT_SESSIONS_RETENTION_DAYS = 30;
export const DEFAULT_AUDIT_RETENTION_DAYS = 90;
