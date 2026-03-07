import type { ScoredEntry } from '../scorer/scorer.js';
import type { PackItem, OmittedItem, ContextPack } from '../types/pack.js';
import { ExclusionReason, ReasonCode } from '../types/pack.js';
import { estimateTokens } from './tokens.js';
import { DEFAULT_BUDGET_TOKENS } from '../types/config.js';

export interface BudgetOptions {
  budgetTokens?: number;
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
