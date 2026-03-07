import { readFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseCtxFile, serializeCtxFile } from '../ctx/parser.js';
import type { CtxFile } from '../types/ctx.js';
import { containsSecrets, redactSecrets } from '../redact/secrets.js';

export interface DiffResult {
  /** The unified diff string */
  diff: string;
  /** Whether any changes were detected */
  hasChanges: boolean;
  /** Whether secrets were redacted from the diff */
  secretsRedacted: boolean;
}

export interface PruneProposal {
  /** Section of the .ctx file (key_files, contracts, decisions) */
  section: string;
  /** Entry identifier within the section */
  entryId: string;
  /** The action to take */
  action: 'remove' | 'update';
  /** Human-readable justification */
  reason: string;
  /** Details about what changed */
  details: string;
}

export interface PruneResult {
  /** Path to the .ctx file scanned */
  ctxPath: string;
  /** List of proposed changes */
  proposals: PruneProposal[];
  /** Generated diff if proposals exist */
  diff: DiffResult | null;
}

/**
 * Generate a unified diff between old and new .ctx content.
 * Runs secret redaction before producing output (FR-033).
 */
export function generateDiff(oldContent: string, newContent: string, filePath: string = '.ctx'): DiffResult {
  let secretsRedacted = false;

  // Redact secrets from both old and new content
  let safeOld = oldContent;
  let safeNew = newContent;

  if (containsSecrets(oldContent)) {
    safeOld = redactSecrets(oldContent);
    secretsRedacted = true;
  }
  if (containsSecrets(newContent)) {
    safeNew = redactSecrets(newContent);
    secretsRedacted = true;
  }

  const oldLines = safeOld.split('\n');
  const newLines = safeNew.split('\n');

  if (safeOld === safeNew) {
    return { diff: '', hasChanges: false, secretsRedacted };
  }

  // Generate unified diff
  const diff = unifiedDiff(oldLines, newLines, `a/${filePath}`, `b/${filePath}`);

  return { diff, hasChanges: true, secretsRedacted };
}

/**
 * Generate a diff between two CtxFile objects.
 */
export function diffCtxFiles(oldCtx: CtxFile, newCtx: CtxFile, filePath: string = '.ctx'): DiffResult {
  const oldContent = serializeCtxFile(oldCtx);
  const newContent = serializeCtxFile(newCtx);
  return generateDiff(oldContent, newContent, filePath);
}

/**
 * Scan a .ctx file for dead references (deleted/renamed files)
 * and generate removal/update proposals per FR-020.
 */
export function scanForDeadReferences(
  ctxPath: string,
  repoRoot: string,
): PruneResult {
  const proposals: PruneProposal[] = [];

  if (!existsSync(ctxPath)) {
    return { ctxPath, proposals, diff: null };
  }

  const content = readFileSync(ctxPath, 'utf-8');
  const { ctx } = parseCtxFile(content);
  const ctxDir = dirname(ctxPath);

  // Check key_files for dead references
  for (const kf of ctx.key_files) {
    const absPath = resolve(ctxDir, kf.path);
    if (!existsSync(absPath)) {
      proposals.push({
        section: 'key_files',
        entryId: kf.path,
        action: 'remove',
        reason: 'Referenced file no longer exists',
        details: `File ${kf.path} was not found at ${relative(repoRoot, absPath)}`,
      });
    }
  }

  // Check refs for dead targets
  for (const ref of ctx.refs) {
    const absTarget = resolve(ctxDir, ref.target);
    if (!existsSync(absTarget)) {
      proposals.push({
        section: 'refs',
        entryId: ref.target,
        action: 'remove',
        reason: 'Referenced .ctx file no longer exists',
        details: `Ref target ${ref.target} was not found at ${relative(repoRoot, absTarget)}`,
      });
    }
  }

  // Generate diff if proposals exist
  let diff: DiffResult | null = null;
  if (proposals.length > 0) {
    const prunedCtx = applyPruneProposals(ctx, proposals);
    const relPath = relative(repoRoot, ctxPath);
    diff = diffCtxFiles(ctx, prunedCtx, relPath);
  }

  return { ctxPath, proposals, diff };
}

/**
 * Apply prune proposals to a CtxFile to produce the pruned version.
 */
function applyPruneProposals(ctx: CtxFile, proposals: PruneProposal[]): CtxFile {
  const result = { ...ctx };

  const keyFileRemovals = new Set(
    proposals
      .filter((p) => p.section === 'key_files' && p.action === 'remove')
      .map((p) => p.entryId),
  );
  if (keyFileRemovals.size > 0) {
    result.key_files = ctx.key_files.filter((kf) => !keyFileRemovals.has(kf.path));
  }

  const refRemovals = new Set(
    proposals
      .filter((p) => p.section === 'refs' && p.action === 'remove')
      .map((p) => p.entryId),
  );
  if (refRemovals.size > 0) {
    result.refs = ctx.refs.filter((r) => !refRemovals.has(r.target));
  }

  return result;
}

/**
 * Simple unified diff implementation.
 * Produces a minimal diff output with context lines.
 */
function unifiedDiff(
  oldLines: string[],
  newLines: string[],
  oldPath: string,
  newPath: string,
  contextLines: number = 3,
): string {
  const output: string[] = [];
  output.push(`--- ${oldPath}`);
  output.push(`+++ ${newPath}`);

  // Simple line-by-line diff using LCS
  const lcs = longestCommonSubsequence(oldLines, newLines);

  // Generate hunks
  const hunks = buildHunks(oldLines, newLines, lcs, contextLines);

  for (const hunk of hunks) {
    output.push(
      `@@ -${hunk.oldStart + 1},${hunk.oldCount} +${hunk.newStart + 1},${hunk.newCount} @@`,
    );
    output.push(...hunk.lines);
  }

  return output.join('\n');
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

function longestCommonSubsequence(a: string[], b: string[]): boolean[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find which lines are common
  const inLCS: boolean[][] = [
    Array(m).fill(false),
    Array(n).fill(false),
  ];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      inLCS[0][i - 1] = true;
      inLCS[1][j - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return inLCS;
}

function buildHunks(
  oldLines: string[],
  newLines: string[],
  lcs: boolean[][],
  contextLines: number,
): Hunk[] {
  // Build raw diff lines
  const rawDiff: Array<{ type: 'keep' | 'remove' | 'add'; line: string; oldIdx: number; newIdx: number }> = [];

  let oi = 0;
  let ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && lcs[0][oi] && lcs[1][ni]) {
      rawDiff.push({ type: 'keep', line: oldLines[oi], oldIdx: oi, newIdx: ni });
      oi++;
      ni++;
    } else if (oi < oldLines.length && !lcs[0][oi]) {
      rawDiff.push({ type: 'remove', line: oldLines[oi], oldIdx: oi, newIdx: ni });
      oi++;
    } else if (ni < newLines.length && !lcs[1][ni]) {
      rawDiff.push({ type: 'add', line: newLines[ni], oldIdx: oi, newIdx: ni });
      ni++;
    } else {
      // Both are in LCS but somehow misaligned, advance both
      if (oi < oldLines.length) {
        rawDiff.push({ type: 'keep', line: oldLines[oi], oldIdx: oi, newIdx: ni });
        oi++;
      }
      if (ni < newLines.length) {
        ni++;
      }
    }
  }

  // Group into hunks with context
  const hunks: Hunk[] = [];
  let currentHunk: Hunk | null = null;
  let keepCount = 0;

  for (let idx = 0; idx < rawDiff.length; idx++) {
    const entry = rawDiff[idx];
    if (entry.type === 'keep') {
      keepCount++;
      if (currentHunk && keepCount > contextLines * 2) {
        // End current hunk
        hunks.push(currentHunk);
        currentHunk = null;
      }
    } else {
      keepCount = 0;
      if (!currentHunk) {
        // Start new hunk with context before
        const start = Math.max(0, idx - contextLines);
        currentHunk = {
          oldStart: rawDiff[start].oldIdx,
          newStart: rawDiff[start].newIdx,
          oldCount: 0,
          newCount: 0,
          lines: [],
        };
        // Add context lines before
        for (let c = start; c < idx; c++) {
          if (rawDiff[c].type === 'keep') {
            currentHunk.lines.push(` ${rawDiff[c].line}`);
            currentHunk.oldCount++;
            currentHunk.newCount++;
          }
        }
      }
    }

    if (currentHunk) {
      if (entry.type === 'keep') {
        currentHunk.lines.push(` ${entry.line}`);
        currentHunk.oldCount++;
        currentHunk.newCount++;
      } else if (entry.type === 'remove') {
        currentHunk.lines.push(`-${entry.line}`);
        currentHunk.oldCount++;
      } else {
        currentHunk.lines.push(`+${entry.line}`);
        currentHunk.newCount++;
      }
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}
