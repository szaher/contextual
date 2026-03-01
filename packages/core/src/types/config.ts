import type { IgnorePolicy } from './ctx.js';

export interface WorkspaceProfile {
  version: number;
  budget: BudgetConfig;
  scoring: ScoringConfig;
  ignore: IgnorePolicy;
  agents: Record<string, AgentConfig>;
  auto_approve: AutoApproveConfig;
  retention: RetentionConfig;
}

export interface GlobalProfile {
  version: number;
  global_ctx: string;
  budget: BudgetConfig;
  ignore: IgnorePolicy;
}

export interface BudgetConfig {
  default_tokens: number;
}

export interface ScoringConfig {
  mode: 'lexical' | 'hybrid';
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
