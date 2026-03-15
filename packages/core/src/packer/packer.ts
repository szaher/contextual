import { mergeCtxHierarchy } from '../ctx/merger.js';
import { scoreEntries } from '../scorer/scorer.js';
import type { ScoredEntry } from '../scorer/scorer.js';
import { applyBudget } from './budget.js';
import type { ContextPackResult, DeepReadDecision } from '../types/pack.js';
import { ReasonCode } from '../types/pack.js';
import { DEFAULT_BUDGET_TOKENS } from '../types/config.js';
import type { LoadedProfile } from '../config/loader.js';
import { readIndex } from '../index/generator.js';
import { selectFromIndex } from '../index/selector.js';
import { parseCtxFile } from '../ctx/parser.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CtxlIndex } from '../types/ctxl.js';
import type { CtxFile } from '../types/ctx.js';

export interface PackOptions {
  workingDir: string;
  repoRoot: string;
  requestText: string;
  touchedFiles?: string[];
  budgetTokens?: number;
  /** Loaded profile for config overrides */
  profile?: LoadedProfile;
  /** Force v1 directory-walk mode even if .ctxl exists */
  forceDirectoryWalk?: boolean;
}

/**
 * Assemble a Context Pack for a request.
 * Merges .ctx hierarchy, scores entries, applies budget, and checks for deep-read fallback.
 */
export function buildContextPack(options: PackOptions): ContextPackResult {
  const {
    workingDir,
    repoRoot,
    requestText,
    touchedFiles = [],
    budgetTokens = DEFAULT_BUDGET_TOKENS,
    forceDirectoryWalk = false,
  } = options;

  // Index-based fast path: if .ctxl exists, use selector instead of directory walk
  if (!forceDirectoryWalk) {
    const index = readIndex(repoRoot);
    if (index) {
      return buildContextPackFromIndex(index, options);
    }
  }

  // 1. Merge .ctx hierarchy (v1 fallback path)
  const merged = mergeCtxHierarchy({
    workingDir,
    repoRoot,
  });

  // 2. Score entries — use the closest source for locality attribution
  const primarySource = merged.sources.length > 0 ? merged.sources[0] : '.ctx';
  const scored = scoreEntries(
    [{ path: primarySource, ctx: merged.ctx }],
    {
      workingDir,
      repoRoot,
      requestText,
      touchedFiles,
    },
  );

  // 3. Filter entries based on profile ignore rules
  let filteredScored = scored;
  if (options.profile?.ignore) {
    const neverRead = options.profile.ignore.never_read;
    if (neverRead.length > 0) {
      filteredScored = scored.filter((entry) => {
        return !neverRead.some((pattern) => {
          if (pattern.endsWith('*')) {
            return entry.source.startsWith(pattern.slice(0, -1)) ||
                   entry.entry_id.startsWith(pattern.slice(0, -1));
          }
          if (pattern.endsWith('/')) {
            return entry.source === pattern.slice(0, -1) ||
                   entry.source.startsWith(pattern) ||
                   entry.entry_id === pattern.slice(0, -1) ||
                   entry.entry_id.startsWith(pattern);
          }
          return entry.source === pattern || entry.entry_id === pattern;
        });
      });
    }
  }

  // 4. Check deep-read fallback heuristic
  const deepRead = checkDeepRead(filteredScored, requestText, merged.sources.length === 0);

  // 5. Apply budget
  const effectiveBudget = budgetTokens ?? options.profile?.budget.default_tokens ?? DEFAULT_BUDGET_TOKENS;
  const pack = applyBudget(filteredScored, { budgetTokens: effectiveBudget });

  // 6. Add deep-read items if triggered
  if (deepRead.triggered) {
    for (const file of deepRead.files_read) {
      pack.items.push({
        content: `[Deep read: ${file}]`,
        source: 'deep-read',
        section: 'files',
        entry_id: file,
        score: 0.5,
        tokens: 0,
        reason_codes: [ReasonCode.DEEP_READ],
        staleness: { verified_at: '', is_stale: false },
      });
    }
  }

  return {
    event_id: null,
    pack,
    deep_read: deepRead.triggered ? deepRead : null,
  };
}

/**
 * Deep-read fallback heuristic per FR-007.
 * Triggers when confidence is low:
 * - Zero tag matches among scored entries
 * - Top score < 0.3
 * - No .ctx files found
 * - User intent signals deep analysis (refactor, debug, etc.)
 */
function checkDeepRead(
  scored: ScoredEntry[],
  requestText: string,
  noCtxFiles: boolean,
): DeepReadDecision {
  const reasons: string[] = [];

  // Check: no .ctx files at all
  if (noCtxFiles) {
    reasons.push('No .ctx files found in hierarchy');
  }

  // Check: zero tag matches
  const hasTagMatch = scored.some((e) =>
    e.reason_codes.includes(ReasonCode.TAG_MATCH),
  );
  if (!hasTagMatch && scored.length > 0) {
    reasons.push('Zero tag matches across all entries');
  }

  // Check: top score too low
  const topScore = scored.length > 0 ? scored[0].score : 0;
  if (topScore < 0.3 && scored.length > 0) {
    reasons.push(`Top score (${topScore}) below threshold (0.3)`);
  }

  // Check: user intent signals deep analysis
  const deepAnalysisKeywords = [
    'refactor', 'debug', 'failing test', 'investigate',
    'deep dive', 'understand', 'trace', 'root cause',
  ];
  const lowerRequest = requestText.toLowerCase();
  const intentMatch = deepAnalysisKeywords.find((kw) =>
    lowerRequest.includes(kw),
  );
  if (intentMatch) {
    reasons.push(`User intent signals deep analysis: "${intentMatch}"`);
  }

  const triggered = reasons.length > 0;

  return {
    triggered,
    rationale: triggered
      ? `Deep-read triggered: ${reasons.join('; ')}`
      : 'Confidence sufficient, no deep-read needed',
    files_read: [], // actual file reading would happen here in full implementation
  };
}

/**
 * Build a context pack using the .ctxl index for fast, scored selection.
 * This is the v2 fast path — O(entries) instead of O(filesystem walk).
 */
function buildContextPackFromIndex(
  index: CtxlIndex,
  options: PackOptions,
): ContextPackResult {
  const {
    workingDir,
    repoRoot,
    requestText,
    touchedFiles = [],
    budgetTokens = DEFAULT_BUDGET_TOKENS,
  } = options;

  // Use index selector for scored selection
  const selection = selectFromIndex(index, {
    prompt: requestText,
    cwd: workingDir,
    repoRoot,
    budgetTokens: budgetTokens ?? options.profile?.budget.default_tokens ?? DEFAULT_BUDGET_TOKENS,
    touchedFiles,
  });

  // Read and score the selected .ctx files
  const sources: Array<{ path: string; ctx: CtxFile }> = [];
  for (const selected of selection.selected) {
    try {
      const content = readFileSync(join(repoRoot, selected.entry.path), 'utf-8');
      const { ctx } = parseCtxFile(content);
      sources.push({ path: selected.entry.path, ctx });
    } catch {
      // skip unreadable files
    }
  }

  // Score entries using existing scorer with index config
  const scored = scoreEntries(sources, {
    workingDir,
    repoRoot,
    requestText,
    touchedFiles,
    scoringConfig: index.defaults?.scoring,
    index,
  });

  // Filter by profile ignore rules
  let filteredScored = scored;
  if (options.profile?.ignore) {
    const neverRead = options.profile.ignore.never_read;
    if (neverRead.length > 0) {
      filteredScored = scored.filter((entry) => {
        return !neverRead.some((pattern) => {
          if (pattern.endsWith('*')) {
            return entry.source.startsWith(pattern.slice(0, -1)) ||
                   entry.entry_id.startsWith(pattern.slice(0, -1));
          }
          if (pattern.endsWith('/')) {
            return entry.source === pattern.slice(0, -1) ||
                   entry.source.startsWith(pattern) ||
                   entry.entry_id === pattern.slice(0, -1) ||
                   entry.entry_id.startsWith(pattern);
          }
          return entry.source === pattern || entry.entry_id === pattern;
        });
      });
    }
  }

  // Apply budget
  const effectiveBudget = budgetTokens ?? options.profile?.budget.default_tokens ?? DEFAULT_BUDGET_TOKENS;
  const pack = applyBudget(filteredScored, { budgetTokens: effectiveBudget });

  return {
    event_id: null,
    pack,
    deep_read: null,
  };
}
