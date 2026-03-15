import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { generateIndex, writeIndex, readIndex, selectFromIndex } from '@ctxkit/core';

export const indexRoutes = new Hono<AppEnv>();

// POST /index/generate — Generate or regenerate the .ctxl index
indexRoutes.post('/index/generate', async (c) => {
  const body = await c.req.json();
  const { repo_root } = body;

  if (!repo_root) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }

  const index = generateIndex(repo_root, body.repo_name);
  const indexPath = writeIndex(repo_root, index);

  return c.json({
    index_path: indexPath,
    entries_count: index.entries.length,
    total_tokens: index.entries.reduce((sum: number, e: { token_estimate: number }) => sum + e.token_estimate, 0),
    dependencies_found: Object.values(index.graph).reduce(
      (sum: number, n: { depends_on: string[] }) => sum + n.depends_on.length, 0,
    ),
    generated_at: index.generated_at,
  });
});

// POST /index/select — Select .ctx files for a task
indexRoutes.post('/index/select', async (c) => {
  const body = await c.req.json();
  const { repo_root, prompt, cwd, budget_tokens, touched_files, pinned, excluded } = body;

  if (!repo_root) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }
  if (!prompt) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'prompt is required' } }, 400);
  }

  const index = readIndex(repo_root);
  if (!index) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'No .ctxl index found' } }, 404);
  }

  const result = selectFromIndex(index, {
    prompt,
    cwd: cwd || repo_root,
    repoRoot: repo_root,
    budgetTokens: budget_tokens,
    touchedFiles: touched_files,
    pinned,
    excluded,
  });

  return c.json(result);
});

// GET /index — Read the current .ctxl index
indexRoutes.get('/index', async (c) => {
  const repoRoot = c.req.query('repo_root');
  if (!repoRoot) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root query param is required' } }, 400);
  }

  const index = readIndex(repoRoot);
  if (!index) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'No .ctxl index found' } }, 404);
  }

  return c.json(index);
});
