import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import yaml from 'js-yaml';
import type { CtxFile } from '../types/ctx.js';
import type { HistoryEntry } from '../types/history.js';
import { MAX_INLINE_HISTORY } from '../types/history.js';

/**
 * Archive the oldest inline history entries to `.ctxl.history/<path>/ctx-history.yaml`
 * when _history exceeds MAX_INLINE_HISTORY (20).
 *
 * Returns the updated CtxFile with trimmed _history.
 */
export function archiveHistory(
  ctx: CtxFile,
  ctxRelativePath: string,
  repoRoot: string,
): CtxFile {
  if (!ctx._history || ctx._history.length <= MAX_INLINE_HISTORY) {
    return ctx;
  }

  // Split: keep newest MAX_INLINE_HISTORY inline, archive the rest
  const inline = ctx._history.slice(0, MAX_INLINE_HISTORY);
  const toArchive = ctx._history.slice(MAX_INLINE_HISTORY);

  // Write to archive file
  const archivePath = getArchivePath(ctxRelativePath, repoRoot);
  const existing = readArchivedHistory(ctxRelativePath, repoRoot);
  const merged = [...toArchive, ...existing];

  mkdirSync(dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, yaml.dump(merged, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  }), 'utf-8');

  return {
    ...ctx,
    _history: inline,
  };
}

/**
 * Read archived history entries from `.ctxl.history/<path>/ctx-history.yaml`.
 */
export function readArchivedHistory(
  ctxRelativePath: string,
  repoRoot: string,
): HistoryEntry[] {
  const archivePath = getArchivePath(ctxRelativePath, repoRoot);

  if (!existsSync(archivePath)) {
    return [];
  }

  try {
    const content = readFileSync(archivePath, 'utf-8');
    const entries = yaml.load(content) as HistoryEntry[];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

/**
 * Read merged history: inline _history + archived history.
 */
export function readMergedHistory(
  ctx: CtxFile,
  ctxRelativePath: string,
  repoRoot: string,
): HistoryEntry[] {
  const inline = ctx._history ?? [];
  const archived = readArchivedHistory(ctxRelativePath, repoRoot);
  return [...inline, ...archived];
}

/**
 * Get the archive file path for a given .ctx file.
 */
function getArchivePath(ctxRelativePath: string, repoRoot: string): string {
  // .ctxl.history/src/auth/ctx-history.yaml for src/auth/.ctx
  const dir = dirname(ctxRelativePath);
  return join(repoRoot, '.ctxl.history', dir, 'ctx-history.yaml');
}
