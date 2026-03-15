export enum ReasonCode {
  LOCALITY_HIGH = 'LOCALITY_HIGH',
  TAG_MATCH = 'TAG_MATCH',
  PINNED = 'PINNED',
  RECENT_EDIT = 'RECENT_EDIT',
  CONTRACT_REQUIRED = 'CONTRACT_REQUIRED',
  DEEP_READ = 'DEEP_READ',
  /** Selected because of dependency graph edge */
  DEPENDENCY = 'DEPENDENCY',
  /** Selected because it is a cwd ancestor */
  CWD_ANCESTOR = 'CWD_ANCESTOR',
  /** Score boosted by manual weight in .ctxl entry */
  WEIGHT_BOOST = 'WEIGHT_BOOST',
  /** Pinned via .ctxl index selector input */
  PINNED_INDEX = 'PINNED_INDEX',
}

export enum ExclusionReason {
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  LOW_SCORE = 'LOW_SCORE',
  IGNORED = 'IGNORED',
  STALE = 'STALE',
}

export interface PackItem {
  content: string;
  source: string;
  section: string;
  entry_id: string;
  score: number;
  tokens: number;
  reason_codes: ReasonCode[];
  staleness: StalenessInfo;
}

export interface StalenessInfo {
  verified_at: string;
  is_stale: boolean;
}

export interface OmittedItem {
  content_preview: string;
  source: string;
  section: string;
  score: number;
  tokens: number;
  reason: ExclusionReason;
}

export interface ContextPack {
  version: number;
  items: PackItem[];
  omitted: OmittedItem[];
  total_tokens: number;
  budget_tokens: number;
  budget_used_pct: number;
  warnings: string[];
}

export interface ContextPackResult {
  event_id: string | null;
  pack: ContextPack;
  deep_read: DeepReadDecision | null;
}

export interface DeepReadDecision {
  triggered: boolean;
  rationale: string;
  files_read: string[];
}
