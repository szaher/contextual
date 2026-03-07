import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { detectDrift, detectAllDrift } from '@ctxl/core';
import type { AppEnv } from '../types.js';

const drift = new Hono<AppEnv>();

drift.get('/drift', (c) => {
  const ctxPathParam = c.req.query('ctx_path');
  const repoRoot = c.req.query('repo_root');

  if (!repoRoot) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'repo_root query parameter is required' } },
      400,
    );
  }

  if (ctxPathParam) {
    const resolvedPath = resolve(repoRoot, ctxPathParam);
    const normalizedRoot = resolve(repoRoot) + sep;
    if (!resolvedPath.startsWith(normalizedRoot) && resolvedPath !== resolve(repoRoot)) {
      return c.json({ error: 'ctx_path resolves outside repository root' }, 400);
    }

    if (!existsSync(resolvedPath)) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: `No .ctx file found at ${ctxPathParam}` } },
        404,
      );
    }
    const result = detectDrift(resolvedPath, repoRoot);
    return c.json({ results: [result] }, 200);
  }

  const results = detectAllDrift(repoRoot);
  return c.json({ results }, 200);
});

export { drift };
