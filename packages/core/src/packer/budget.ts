import type { ScoredEntry } from '../scorer/scorer.js';
import type { PackItem, OmittedItem, ContextPack } from '../types/pack.js';
import { ExclusionReason, ReasonCode } from '../types/pack.js';
import { estimateTokens } from './tokens.js';
import { DEFAULT_BUDGET_TOKENS } from '../types/config.js';
import type { CtxlBudgetConfig } from '../types/ctxl.js';

export interface BudgetOptions {
  budgetTokens?: number;
  /** Per-category budget configuration from .ctxl index */
  categoryBudgets?: CtxlBudgetConfig;
}

/**
 * Apply token budget to scored entries.
 * Returns a ContextPack with included items and omitted items list.
 */
export function applyBudget(
  entries: ScoredEntry[],
  options: BudgetOptions = {},
): ContextPack {
  const budget = options.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const items: PackItem[] = [];
  const omitted: OmittedItem[] = [];
  const warnings: string[] = [];
  let totalTokens = 0;

  // If category budgets are provided, use per-category allocation
  if (options.categoryBudgets) {
    return applyBudgetWithCategories(entries, budget, options.categoryBudgets);
  }

  // Partition: contracts first (they get budget priority)
  const contractEntries = entries.filter((e) =>
    e.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED),
  );
  const nonContractEntries = entries.filter((e) =>
    !e.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED),
  );

  // Process contract entries first (must-include)
  for (const entry of contractEntries) {
    const tokens = estimateTokens(entry.content);

    if (totalTokens + tokens <= budget) {
      items.push(createPackItem(entry, tokens));
      totalTokens += tokens;
    } else {
      // Contract exceeds budget — include with warning
      warnings.push(
        `Budget stretch: contract "${entry.entry_id}" requires ${tokens} tokens, budget remaining: ${budget - totalTokens}`,
      );
      items.push(createPackItem(entry, tokens));
      totalTokens += tokens;
    }
  }

  // Process non-contract entries with remaining budget
  for (const entry of nonContractEntries) {
    const tokens = estimateTokens(entry.content);

    if (totalTokens + tokens <= budget) {
      items.push(createPackItem(entry, tokens));
      totalTokens += tokens;
    } else {
      omitted.push({
        content_preview: entry.content.slice(0, 100) + (entry.content.length > 100 ? '...' : ''),
        source: entry.source,
        section: entry.section,
        score: entry.score,
        tokens,
        reason: totalTokens + tokens > budget
          ? ExclusionReason.BUDGET_EXCEEDED
          : entry.score < 0.3
            ? ExclusionReason.LOW_SCORE
            : ExclusionReason.BUDGET_EXCEEDED,
      });
    }
  }

  return {
    version: 1,
    items,
    omitted,
    total_tokens: totalTokens,
    budget_tokens: budget,
    budget_used_pct: Math.round((totalTokens / budget) * 1000) / 10,
    warnings,
  };
}

/**
 * Apply budget with per-category allocation (contracts, local_ctx, related_ctx, history).
 */
function applyBudgetWithCategories(
  entries: ScoredEntry[],
  totalBudget: number,
  categoryConfig: CtxlBudgetConfig,
): ContextPack {
  const items: PackItem[] = [];
  const omitted: OmittedItem[] = [];
  const warnings: string[] = [];

  const catBudgets = {
    contracts: Math.floor(totalBudget * categoryConfig.contracts),
    local_ctx: Math.floor(totalBudget * categoryConfig.local_ctx),
    related_ctx: Math.floor(totalBudget * categoryConfig.related_ctx),
    history: Math.floor(totalBudget * categoryConfig.history),
  };

  const catUsed = { contracts: 0, local_ctx: 0, related_ctx: 0, history: 0 };

  // Classify entries into categories
  const contractEntries = entries.filter((e) =>
    e.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED),
  );
  const localEntries = entries.filter((e) =>
    !e.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED) &&
    e.reason_codes.includes(ReasonCode.CWD_ANCESTOR),
  );
  const relatedEntries = entries.filter((e) =>
    !e.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED) &&
    !e.reason_codes.includes(ReasonCode.CWD_ANCESTOR),
  );

  // Process in priority order: contracts → local → related
  for (const entry of contractEntries) {
    const tokens = estimateTokens(entry.content);
    if (catUsed.contracts + tokens <= catBudgets.contracts) {
      items.push(createPackItem(entry, tokens));
      catUsed.contracts += tokens;
    } else {
      // Contracts stretch budget
      warnings.push(
        `Budget stretch: contract "${entry.entry_id}" requires ${tokens} tokens`,
      );
      items.push(createPackItem(entry, tokens));
      catUsed.contracts += tokens;
    }
  }

  for (const entry of localEntries) {
    const tokens = estimateTokens(entry.content);
    if (catUsed.local_ctx + tokens <= catBudgets.local_ctx) {
      items.push(createPackItem(entry, tokens));
      catUsed.local_ctx += tokens;
    } else {
      omitted.push({
        content_preview: entry.content.slice(0, 100) + (entry.content.length > 100 ? '...' : ''),
        source: entry.source,
        section: entry.section,
        score: entry.score,
        tokens,
        reason: ExclusionReason.BUDGET_EXCEEDED,
      });
    }
  }

  for (const entry of relatedEntries) {
    const tokens = estimateTokens(entry.content);
    if (catUsed.related_ctx + tokens <= catBudgets.related_ctx) {
      items.push(createPackItem(entry, tokens));
      catUsed.related_ctx += tokens;
    } else {
      omitted.push({
        content_preview: entry.content.slice(0, 100) + (entry.content.length > 100 ? '...' : ''),
        source: entry.source,
        section: entry.section,
        score: entry.score,
        tokens,
        reason: ExclusionReason.BUDGET_EXCEEDED,
      });
    }
  }

  const totalTokens = catUsed.contracts + catUsed.local_ctx + catUsed.related_ctx + catUsed.history;
  return {
    version: 1,
    items,
    omitted,
    total_tokens: totalTokens,
    budget_tokens: totalBudget,
    budget_used_pct: Math.round((totalTokens / totalBudget) * 1000) / 10,
    warnings,
  };
}

function createPackItem(entry: ScoredEntry, tokens: number): PackItem {
  return {
    content: entry.content,
    source: entry.source,
    section: entry.section,
    entry_id: entry.entry_id,
    score: entry.score,
    tokens,
    reason_codes: entry.reason_codes,
    staleness: {
      verified_at: entry.verified_at,
      is_stale: entry.is_stale,
    },
  };
}
