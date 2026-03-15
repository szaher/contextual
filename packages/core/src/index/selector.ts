import { extractKeywords } from '../scorer/tags.js';
import type { CtxlIndex, CtxlEntry, CtxlScoringConfig } from '../types/ctxl.js';
import { DEFAULT_SCORING_CONFIG, DEFAULT_BUDGET_CONFIG } from '../types/ctxl.js';
import { ReasonCode } from '../types/pack.js';
import { relative, dirname } from 'node:path';

/** A scored entry from index-based selection */
export interface IndexScoredEntry {
  entry: CtxlEntry;
  score: number;
  reasons: ReasonCode[];
  category: 'contracts' | 'local_ctx' | 'related_ctx' | 'history';
}

/** Selection result */
export interface SelectionResult {
  selected: IndexScoredEntry[];
  omitted: Array<{ entry: CtxlEntry; reason: string }>;
  budget_used: {
    contracts: number;
    local_ctx: number;
    related_ctx: number;
    history: number;
    reserve: number;
    total: number;
  };
}

export interface SelectOptions {
  /** Prompt/request text for keyword extraction */
  prompt: string;
  /** Current working directory (absolute) */
  cwd: string;
  /** Repository root (absolute) */
  repoRoot: string;
  /** Total token budget override */
  budgetTokens?: number;
  /** Files touched in current session */
  touchedFiles?: string[];
  /** Pinned .ctx paths (always include) */
  pinned?: string[];
  /** Excluded .ctx paths (never include) */
  excluded?: string[];
}

/**
 * Select .ctx files from the index using scored, categorized, budget-constrained selection.
 *
 * Algorithm: score = locality * w_locality + tagMatch * w_tag + recency * w_recency + depBonus + cwdBonus + (weight - 1.0)
 * Then greedy selection with category budgets: contracts first, then local_ctx, then related_ctx.
 */
export function selectFromIndex(index: CtxlIndex, options: SelectOptions): SelectionResult {
  const scoring = index.defaults?.scoring ?? DEFAULT_SCORING_CONFIG;
  const budget = index.defaults?.budget ?? DEFAULT_BUDGET_CONFIG;
  const totalBudget = options.budgetTokens ?? budget.total;
  const keywords = extractKeywords(options.prompt);
  const cwdRel = relative(options.repoRoot, options.cwd);
  const excluded = new Set(options.excluded ?? []);

  // Score all entries
  const scored: IndexScoredEntry[] = [];

  for (const entry of index.entries) {
    if (excluded.has(entry.path)) continue;

    const { score, reasons, category } = scoreEntry(
      entry,
      index,
      scoring,
      keywords,
      cwdRel,
      options.touchedFiles ?? [],
      options.pinned ?? [],
    );

    scored.push({ entry, score, reasons, category });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Greedy selection with category budgets
  const categoryBudgets = {
    contracts: Math.floor(totalBudget * budget.contracts),
    local_ctx: Math.floor(totalBudget * budget.local_ctx),
    related_ctx: Math.floor(totalBudget * budget.related_ctx),
    history: Math.floor(totalBudget * budget.history),
    reserve: Math.floor(totalBudget * budget.reserve),
  };

  const categoryUsed = { contracts: 0, local_ctx: 0, related_ctx: 0, history: 0, reserve: 0 };
  const selected: IndexScoredEntry[] = [];
  const omitted: Array<{ entry: CtxlEntry; reason: string }> = [];

  // First pass: pinned entries (always include)
  for (const s of scored) {
    if (options.pinned?.includes(s.entry.path)) {
      s.reasons.push(ReasonCode.PINNED_INDEX);
      selected.push(s);
      categoryUsed[s.category] += s.entry.token_estimate;
    }
  }

  // Second pass: contracts first
  for (const s of scored) {
    if (selected.includes(s)) continue;
    if (s.category !== 'contracts') continue;

    if (categoryUsed.contracts + s.entry.token_estimate <= categoryBudgets.contracts) {
      selected.push(s);
      categoryUsed.contracts += s.entry.token_estimate;
    } else {
      omitted.push({ entry: s.entry, reason: 'contracts budget exceeded' });
    }
  }

  // Third pass: local_ctx
  for (const s of scored) {
    if (selected.includes(s)) continue;
    if (s.category !== 'local_ctx') continue;

    if (categoryUsed.local_ctx + s.entry.token_estimate <= categoryBudgets.local_ctx) {
      selected.push(s);
      categoryUsed.local_ctx += s.entry.token_estimate;
    } else {
      omitted.push({ entry: s.entry, reason: 'local_ctx budget exceeded' });
    }
  }

  // Track omitted paths to avoid duplicates
  const omittedPaths = new Set(omitted.map((o) => o.entry.path));

  // Fourth pass: related_ctx (everything else)
  for (const s of scored) {
    if (selected.includes(s)) continue;
    if (omittedPaths.has(s.entry.path)) continue;

    if (categoryUsed.related_ctx + s.entry.token_estimate <= categoryBudgets.related_ctx) {
      selected.push(s);
      categoryUsed.related_ctx += s.entry.token_estimate;
    } else {
      omitted.push({ entry: s.entry, reason: 'related_ctx budget exceeded' });
    }
  }

  return {
    selected,
    omitted,
    budget_used: {
      ...categoryUsed,
      total: categoryUsed.contracts + categoryUsed.local_ctx + categoryUsed.related_ctx + categoryUsed.history + categoryUsed.reserve,
    },
  };
}

function scoreEntry(
  entry: CtxlEntry,
  index: CtxlIndex,
  scoring: CtxlScoringConfig,
  keywords: string[],
  cwdRel: string,
  touchedFiles: string[],
  pinned: string[],
): { score: number; reasons: ReasonCode[]; category: 'contracts' | 'local_ctx' | 'related_ctx' | 'history' } {
  const reasons: ReasonCode[] = [];
  const entryDir = dirname(entry.path);

  // Locality: how close is the entry to cwd
  const locality = computeLocality(entryDir, cwdRel);

  // Tag match: overlap between keywords and entry tags
  const tagMatch = computeTagMatch(keywords, entry.tags, entry.summary);

  // Recency: how recently was the entry modified
  const recency = computeRecency(entry.last_modified);

  // Base score
  let score = locality * scoring.locality_weight +
              tagMatch * scoring.tag_match_weight +
              recency * scoring.recency_weight;

  // Dependency bonus
  const graphNode = index.graph[entry.path];
  if (graphNode && graphNode.depended_by.length > 0) {
    const depBonus = Math.min(graphNode.depended_by.length * scoring.dependency_bonus, 0.3);
    score += depBonus;
    if (depBonus > 0) reasons.push(ReasonCode.DEPENDENCY);
  }

  // CWD ancestor bonus
  const isCwdAncestor = cwdRel.startsWith(entryDir) || entryDir === '.';
  if (isCwdAncestor) {
    score += 0.15;
    reasons.push(ReasonCode.CWD_ANCESTOR);
  }

  // Weight adjustment
  if (entry.weight !== 1.0) {
    score += (entry.weight - 1.0);
    if (entry.weight > 1.0) reasons.push(ReasonCode.WEIGHT_BOOST);
  }

  // Reason codes
  if (locality >= 0.8) reasons.push(ReasonCode.LOCALITY_HIGH);
  if (tagMatch > 0) reasons.push(ReasonCode.TAG_MATCH);
  if (recency >= 0.7) reasons.push(ReasonCode.RECENT_EDIT);
  if (pinned.includes(entry.path)) reasons.push(ReasonCode.PINNED_INDEX);

  // Determine category
  let category: 'contracts' | 'local_ctx' | 'related_ctx' | 'history' = 'related_ctx';
  if (entry.sections.includes('contracts') && tagMatch > 0 && score >= scoring.contract_floor) {
    category = 'contracts';
    reasons.push(ReasonCode.CONTRACT_REQUIRED);
  } else if (isCwdAncestor) {
    category = 'local_ctx';
  }

  score = Math.round(Math.min(1.5, Math.max(0, score)) * 100) / 100;

  return { score, reasons, category };
}

function computeLocality(entryDir: string, cwdRel: string): number {
  if (entryDir === cwdRel) return 1.0;
  if (entryDir === '.') return 0.3; // root .ctx
  // Count common path segments
  const entryParts = entryDir.split('/');
  const cwdParts = cwdRel.split('/');
  let common = 0;
  for (let i = 0; i < Math.min(entryParts.length, cwdParts.length); i++) {
    if (entryParts[i] === cwdParts[i]) common++;
    else break;
  }
  const maxLen = Math.max(entryParts.length, cwdParts.length);
  return maxLen > 0 ? common / maxLen : 0;
}

function computeTagMatch(keywords: string[], tags: string[], summary: string): number {
  if (keywords.length === 0) return 0;
  const allTerms = [...tags, ...summary.toLowerCase().split(/\s+/)];
  let matches = 0;
  for (const kw of keywords) {
    if (allTerms.some((t) => t.includes(kw) || kw.includes(t))) {
      matches++;
    }
  }
  return matches / keywords.length;
}

function computeRecency(lastModified: string): number {
  if (!lastModified) return 0;
  try {
    const modTime = new Date(lastModified).getTime();
    const now = Date.now();
    const daysSince = (now - modTime) / (1000 * 60 * 60 * 24);
    if (daysSince <= 1) return 1.0;
    if (daysSince <= 7) return 0.8;
    if (daysSince <= 30) return 0.5;
    if (daysSince <= 90) return 0.3;
    return 0.1;
  } catch {
    return 0;
  }
}
