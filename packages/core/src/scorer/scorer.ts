import { scoreLocality } from './locality.js';
import { scoreRecency } from './recency.js';
import { scoreTags, extractKeywords } from './tags.js';
import type { CtxFile, KeyFile, Contract, Decision, Gotcha } from '../types/ctx.js';
import { ReasonCode } from '../types/pack.js';
import type { CtxlScoringConfig, CtxlIndex } from '../types/ctxl.js';

export interface ScoredEntry {
  content: string;
  source: string;
  section: string;
  entry_id: string;
  score: number;
  tokens: number;
  reason_codes: ReasonCode[];
  verified_at: string;
  is_stale: boolean;
  locked: boolean;
}

export interface ScoreOptions {
  workingDir: string;
  repoRoot: string;
  requestText: string;
  touchedFiles?: string[];
  /** Optional configurable scoring weights from .ctxl index */
  scoringConfig?: CtxlScoringConfig;
  /** Optional .ctxl index for dependency bonuses and cwd ancestor bonuses */
  index?: CtxlIndex;
}

/**
 * Score all entries from merged .ctx sources.
 * Returns entries sorted by score (highest first) with deterministic tiebreakers.
 */
export function scoreEntries(
  sources: Array<{ path: string; ctx: CtxFile }>,
  options: ScoreOptions,
): ScoredEntry[] {
  const { workingDir, repoRoot, requestText, touchedFiles = [], scoringConfig, index } = options;
  const keywords = extractKeywords(requestText);
  const entries: ScoredEntry[] = [];

  // Use configurable weights if provided, otherwise use hardcoded defaults
  const wLocality = scoringConfig?.locality_weight ?? 0.4;
  const wTag = scoringConfig?.tag_match_weight ?? 0.3;
  const wRecency = scoringConfig?.recency_weight ?? 0.2;
  const depBonus = scoringConfig?.dependency_bonus ?? 0;

  for (const { path: sourcePath, ctx } of sources) {
    const locality = scoreLocality(workingDir, sourcePath, repoRoot);

    // Apply dependency bonus if index is available
    let sourceDepBonus = 0;
    if (index && depBonus > 0) {
      const graphNode = index.graph[sourcePath];
      if (graphNode && graphNode.depended_by.length > 0) {
        sourceDepBonus = Math.min(graphNode.depended_by.length * depBonus, 0.3);
      }
    }

    // Check if source is a cwd ancestor
    const cwdRel = workingDir.startsWith(repoRoot) ? workingDir.slice(repoRoot.length + 1) : workingDir;
    const sourceDir = sourcePath.replace(/\/\.ctx$/, '').replace(/\.ctx$/, '');
    const isCwdAncestor = cwdRel.startsWith(sourceDir) || sourceDir === '.' || sourceDir === '';

    // Score key_files
    for (const kf of ctx.key_files) {
      const entry = scoreKeyFile(kf, sourcePath, locality, keywords, touchedFiles, repoRoot, wLocality, wTag, wRecency);
      // Apply dependency and cwd ancestor bonuses
      if (sourceDepBonus > 0) {
        entry.score = Math.round(Math.min(1.0, entry.score + sourceDepBonus) * 100) / 100;
        entry.reason_codes.push(ReasonCode.DEPENDENCY);
      }
      if (isCwdAncestor && !entry.reason_codes.includes(ReasonCode.CWD_ANCESTOR)) {
        entry.score = Math.round(Math.min(1.0, entry.score + 0.1) * 100) / 100;
        entry.reason_codes.push(ReasonCode.CWD_ANCESTOR);
      }
      entries.push(entry);
    }

    // Score contracts
    for (const contract of ctx.contracts) {
      const entry = scoreContract(contract, sourcePath, locality, keywords, touchedFiles, wLocality, wTag);
      if (sourceDepBonus > 0) {
        entry.score = Math.round(Math.min(1.0, entry.score + sourceDepBonus) * 100) / 100;
        entry.reason_codes.push(ReasonCode.DEPENDENCY);
      }
      if (isCwdAncestor && !entry.reason_codes.includes(ReasonCode.CWD_ANCESTOR)) {
        entry.score = Math.round(Math.min(1.0, entry.score + 0.1) * 100) / 100;
        entry.reason_codes.push(ReasonCode.CWD_ANCESTOR);
      }
      entries.push(entry);
    }

    // Score decisions
    for (const decision of ctx.decisions) {
      const entry = scoreDecision(decision, sourcePath, locality, keywords, wLocality, wTag);
      entries.push(entry);
    }

    // Score gotchas
    for (let i = 0; i < ctx.gotchas.length; i++) {
      const gotcha = ctx.gotchas[i];
      const entry = scoreGotcha(gotcha, i, sourcePath, locality, keywords, wLocality, wTag);
      entries.push(entry);
    }

    // Score summary (always included with base locality score)
    if (ctx.summary) {
      entries.push({
        content: ctx.summary,
        source: sourcePath,
        section: 'summary',
        entry_id: 'summary',
        score: locality * 0.5,
        tokens: 0, // will be calculated by packer
        reason_codes: locality >= 0.8 ? [ReasonCode.LOCALITY_HIGH] : [],
        verified_at: '',
        is_stale: false,
        locked: false,
      });
    }
  }

  // Sort by score descending, with deterministic tiebreakers
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tiebreaker 1: section priority (contracts > key_files > decisions > gotchas > summary)
    const sectionOrder: Record<string, number> = {
      contracts: 0,
      key_files: 1,
      decisions: 2,
      gotchas: 3,
      summary: 4,
    };
    const sA = sectionOrder[a.section] ?? 5;
    const sB = sectionOrder[b.section] ?? 5;
    if (sA !== sB) return sA - sB;
    // Tiebreaker 2: source path (alphabetical)
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    // Tiebreaker 3: entry_id (alphabetical)
    return a.entry_id.localeCompare(b.entry_id);
  });

  return entries;
}

function scoreKeyFile(
  kf: KeyFile,
  sourcePath: string,
  locality: number,
  keywords: string[],
  touchedFiles: string[],
  repoRoot: string,
  wLocality = 0.4,
  wTag = 0.3,
  wRecency = 0.2,
): ScoredEntry {
  const tagScore = scoreTags(keywords, kf.tags);
  const recency = scoreRecency(kf.verified_at, repoRoot);
  const reasons: ReasonCode[] = [];

  let score = locality * wLocality + tagScore * wTag + recency * wRecency;

  if (locality >= 0.8) reasons.push(ReasonCode.LOCALITY_HIGH);
  if (tagScore > 0) reasons.push(ReasonCode.TAG_MATCH);
  if (kf.locked) {
    reasons.push(ReasonCode.PINNED);
    score = Math.max(score, 0.8); // pinned items get minimum 0.8
  }

  // Boost if file is in touched files
  if (touchedFiles.some((f) => kf.path.includes(f) || f.includes(kf.path))) {
    score = Math.min(1.0, score + 0.2);
    if (!reasons.includes(ReasonCode.RECENT_EDIT)) {
      reasons.push(ReasonCode.RECENT_EDIT);
    }
  }

  return {
    content: `${kf.path}: ${kf.purpose}`,
    source: sourcePath,
    section: 'key_files',
    entry_id: kf.path,
    score: Math.round(score * 100) / 100,
    tokens: 0,
    reason_codes: reasons,
    verified_at: kf.verified_at,
    is_stale: !kf.verified_at,
    locked: kf.locked,
  };
}

function scoreContract(
  contract: Contract,
  sourcePath: string,
  locality: number,
  keywords: string[],
  touchedFiles: string[],
  wLocality = 0.3,
  wTag = 0.3,
): ScoredEntry {
  const tagScore = scoreTags(keywords, contract.scope.tags);
  const reasons: ReasonCode[] = [];

  let score = locality * wLocality + tagScore * wTag + 0.3; // contracts have inherent value

  if (locality >= 0.8) reasons.push(ReasonCode.LOCALITY_HIGH);
  if (tagScore > 0) reasons.push(ReasonCode.TAG_MATCH);

  // Check if any touched files match contract scope paths
  const scopeMatches = touchedFiles.some((f) =>
    contract.scope.paths.some((sp) => matchGlob(f, sp)),
  );
  if (scopeMatches) {
    reasons.push(ReasonCode.CONTRACT_REQUIRED);
    score = Math.max(score, 0.95); // contracts matching scope are near-mandatory
  }

  // Also trigger CONTRACT_REQUIRED if request keywords strongly match contract tags
  if (tagScore >= 0.5 && !reasons.includes(ReasonCode.CONTRACT_REQUIRED)) {
    reasons.push(ReasonCode.CONTRACT_REQUIRED);
    score = Math.max(score, 0.9);
  }

  if (contract.locked) {
    reasons.push(ReasonCode.PINNED);
    score = Math.max(score, 0.8);
  }

  return {
    content: `${contract.name}: ${contract.content}`,
    source: sourcePath,
    section: 'contracts',
    entry_id: contract.name,
    score: Math.round(score * 100) / 100,
    tokens: 0,
    reason_codes: reasons,
    verified_at: contract.verified_at,
    is_stale: !contract.verified_at,
    locked: contract.locked,
  };
}

function scoreDecision(
  decision: Decision,
  sourcePath: string,
  locality: number,
  keywords: string[],
  wLocality = 0.3,
  wTag = 0.4,
): ScoredEntry {
  const titleWords = decision.title.toLowerCase().split(/\s+/);
  const tagScore = scoreTags(keywords, titleWords);
  const reasons: ReasonCode[] = [];

  let score = locality * wLocality + tagScore * wTag + 0.1;

  if (locality >= 0.8) reasons.push(ReasonCode.LOCALITY_HIGH);
  if (tagScore > 0) reasons.push(ReasonCode.TAG_MATCH);
  if (decision.locked) {
    reasons.push(ReasonCode.PINNED);
    score = Math.max(score, 0.8);
  }

  return {
    content: `${decision.id}: ${decision.title}\n${decision.rationale}`,
    source: sourcePath,
    section: 'decisions',
    entry_id: decision.id,
    score: Math.round(score * 100) / 100,
    tokens: 0,
    reason_codes: reasons,
    verified_at: decision.verified_at,
    is_stale: !decision.verified_at,
    locked: decision.locked,
  };
}

function scoreGotcha(
  gotcha: Gotcha,
  index: number,
  sourcePath: string,
  locality: number,
  keywords: string[],
  wLocality = 0.3,
  wTag = 0.4,
): ScoredEntry {
  const tagScore = scoreTags(keywords, gotcha.tags);
  const reasons: ReasonCode[] = [];

  const score = locality * wLocality + tagScore * wTag + 0.1;

  if (locality >= 0.8) reasons.push(ReasonCode.LOCALITY_HIGH);
  if (tagScore > 0) reasons.push(ReasonCode.TAG_MATCH);

  return {
    content: gotcha.text,
    source: sourcePath,
    section: 'gotchas',
    entry_id: `gotcha_${index}`,
    score: Math.round(score * 100) / 100,
    tokens: 0,
    reason_codes: reasons,
    verified_at: gotcha.verified_at,
    is_stale: !gotcha.verified_at,
    locked: gotcha.locked,
  };
}

/**
 * Simple glob matching for contract scope paths.
 * Supports trailing * wildcards (e.g., "src/auth/*") and ** recursive globs.
 */
function matchGlob(filePath: string, pattern: string): boolean {
  if (pattern.endsWith('**') || pattern.endsWith('**/*')) {
    const prefix = pattern.replace(/\*\*\/?(\*)?$/, '');
    return filePath.startsWith(prefix);
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return filePath.startsWith(prefix);
  }
  return filePath === pattern;
}
