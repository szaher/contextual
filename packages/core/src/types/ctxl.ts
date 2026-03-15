/** .ctxl index schema — central registry of all .ctx files in a repository */

/** Scoring weight configuration for index-based context selection */
export interface CtxlScoringConfig {
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

/** Token budget allocation by category */
export interface CtxlBudgetConfig {
  /** Total token budget (default 4000) */
  total: number;
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

/** Project-level default configuration */
export interface CtxlDefaults {
  scoring: CtxlScoringConfig;
  budget: CtxlBudgetConfig;
}

/** Project-level policy configuration */
export interface CtxlPolicies {
  /** Auto-apply clean proposals (default false) */
  auto_update: boolean;
  /** Queue proposals for human review (default true) */
  require_review: boolean;
  /** Maximum .ctx file line count (default 200) */
  max_ctx_size_lines: number;
  /** Days before file is considered stale (default 30) */
  staleness_threshold_days: number;
  /** Validate checksums on read (default true) */
  enforce_checksums: boolean;
  /** Auto-bootstrap new directories (default false) */
  bootstrap_on_new_dir: boolean;
}

/** Dependency graph node for a single .ctx file */
export interface CtxlGraphNode {
  /** Paths this .ctx file depends on */
  depends_on: string[];
  /** Paths that depend on this .ctx file */
  depended_by: string[];
}

/** A single entry in the .ctxl index representing one .ctx file */
export interface CtxlEntry {
  /** Relative path to .ctx file from repo root */
  path: string;
  /** First-line summary from .ctx file */
  summary: string;
  /** Tags from .ctx file */
  tags: string[];
  /** Directory depth from repo root (0 = root .ctx) */
  depth: number;
  /** Current content revision number */
  ctx_version: number;
  /** Timestamp of last .ctx modification (ISO 8601) */
  last_modified: string;
  /** Author of last modification */
  last_modified_by: string;
  /** SHA-256 of .ctx content excluding _history */
  checksum: string;
  /** Paths of .ctx files this file depends on */
  dependencies: string[];
  /** Manual weight adjustment (default 1.0) */
  weight: number;
  /** List of section names present in .ctx */
  sections: string[];
  /** Whether file has unresolved conflicts */
  has_conflicts: boolean;
  /** Estimated token count for this .ctx file */
  token_estimate: number;
}

/** The central .ctxl index file schema */
export interface CtxlIndex {
  /** Index schema version (always 1 for v2) */
  version: number;
  /** Repository name or identifier */
  repo: string;
  /** Timestamp of full index generation (ISO 8601) */
  generated_at: string;
  /** Timestamp of last incremental update (ISO 8601) */
  updated_at: string;
  /** Project-level scoring, budget, and policy configuration */
  defaults: CtxlDefaults;
  /** Array of all indexed .ctx files */
  entries: CtxlEntry[];
  /** Dependency graph keyed by .ctx path */
  graph: Record<string, CtxlGraphNode>;
  /** Project-level policy configuration */
  policies: CtxlPolicies;
}

/** Default scoring configuration */
export const DEFAULT_SCORING_CONFIG: CtxlScoringConfig = {
  locality_weight: 0.5,
  recency_weight: 0.3,
  tag_match_weight: 0.2,
  dependency_bonus: 0.1,
  contract_floor: 0.9,
};

/** Default budget configuration */
export const DEFAULT_BUDGET_CONFIG: CtxlBudgetConfig = {
  total: 4000,
  contracts: 0.20,
  local_ctx: 0.30,
  related_ctx: 0.35,
  history: 0.10,
  reserve: 0.05,
};

/** Default policies */
export const DEFAULT_POLICIES: CtxlPolicies = {
  auto_update: false,
  require_review: true,
  max_ctx_size_lines: 200,
  staleness_threshold_days: 30,
  enforce_checksums: true,
  bootstrap_on_new_dir: false,
};

/** Default index configuration */
export const DEFAULT_CTXL_DEFAULTS: CtxlDefaults = {
  scoring: DEFAULT_SCORING_CONFIG,
  budget: DEFAULT_BUDGET_CONFIG,
};
