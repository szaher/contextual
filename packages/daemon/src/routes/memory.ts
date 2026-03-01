import { Hono } from 'hono';
import { mergeCtxHierarchy, scoreEntries } from '@ctxl/core';
import type { AppEnv } from '../types.js';

const memory = new Hono<AppEnv>();

// GET /memory/search
memory.get('/memory/search', (c) => {
  const query = c.req.query('query');
  const cwd = c.req.query('cwd');
  const repo_root = c.req.query('repo_root');
  const limitParam = c.req.query('limit');

  if (!query) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'query parameter is required' } },
      400,
    );
  }

  if (!cwd || !repo_root) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'cwd and repo_root parameters are required' } },
      400,
    );
  }

  const limit = limitParam ? parseInt(limitParam, 10) : 10;

  const merged = mergeCtxHierarchy({ workingDir: cwd, repoRoot: repo_root });
  const sources = [{ path: cwd, ctx: merged.ctx }];
  const scored = scoreEntries(sources, {
    workingDir: cwd,
    repoRoot: repo_root,
    requestText: query,
  });

  const results = scored.slice(0, limit).map((entry) => ({
    source: entry.source,
    section: entry.section,
    content: entry.content,
    score: entry.score,
    reason_codes: entry.reason_codes,
  }));

  return c.json({ results, total: scored.length }, 200);
});

export { memory };
