import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppEnv } from '../types.js';
import { parseCtxFile, readMergedHistory } from '@ctxkit/core';

export const historyRoutes = new Hono<AppEnv>();

// GET /history — Get version history for a .ctx file
historyRoutes.get('/history', async (c) => {
  const ctxPath = c.req.query('ctx_path');
  const repoRoot = c.req.query('repo_root');
  const count = parseInt(c.req.query('count') ?? '20', 10);
  const includeArchived = c.req.query('include_archived') === 'true';

  if (!ctxPath || !repoRoot) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'ctx_path and repo_root are required' } }, 400);
  }

  const fullPath = join(repoRoot, ctxPath);
  let content: string;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch {
    return c.json({ error: { code: 'NOT_FOUND', message: `File not found: ${ctxPath}` } }, 404);
  }

  const { ctx } = parseCtxFile(content);

  const history = includeArchived
    ? readMergedHistory(ctx, ctxPath, repoRoot)
    : (ctx._history ?? []);

  const entries = history.slice(0, count);

  return c.json({
    path: ctxPath,
    current_version: ctx.version,
    entries,
    has_more: history.length > count,
  });
});

// GET /history/diff — Get diff between two versions
historyRoutes.get('/history/diff', async (c) => {
  const ctxPath = c.req.query('ctx_path');
  const repoRoot = c.req.query('repo_root');
  const fromVersion = parseInt(c.req.query('from_version') ?? '0', 10);
  const toVersion = parseInt(c.req.query('to_version') ?? '0', 10);

  if (!ctxPath || !repoRoot) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'ctx_path and repo_root are required' } }, 400);
  }
  if (fromVersion <= 0 || toVersion <= 0) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'from_version and to_version must be positive integers' } }, 400);
  }

  const fullPath = join(repoRoot, ctxPath);
  let content: string;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch {
    return c.json({ error: { code: 'NOT_FOUND', message: `File not found: ${ctxPath}` } }, 404);
  }

  const { ctx } = parseCtxFile(content);
  const history = readMergedHistory(ctx, ctxPath, repoRoot);

  const relevant = history.filter((h: { version: number }) => h.version > fromVersion && h.version <= toVersion);

  // Aggregate section changes from diff_summaries
  const sections: Array<{ section: string; type: string; entries: string[] }> = [];
  const summaryParts: string[] = [];

  for (const entry of relevant) {
    summaryParts.push(entry.diff_summary);
  }

  return c.json({
    from_version: fromVersion,
    to_version: toVersion,
    sections,
    summary: summaryParts.join('; '),
  });
});
