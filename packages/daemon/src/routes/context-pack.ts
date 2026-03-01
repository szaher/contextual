import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { buildContextPack } from '@ctxl/core';
import { insertRequestEvent } from '../store/events.js';
import type { AppEnv } from '../types.js';

const contextPack = new Hono<AppEnv>();

contextPack.post('/context-pack', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();

  const { session_id, request_text, working_dir, touched_files, budget_tokens } = body;

  if (!session_id || !request_text || !working_dir) {
    return c.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'session_id, request_text, and working_dir are required',
        },
      },
      400,
    );
  }

  const repoRoot = findRepoRoot(working_dir);

  const result = buildContextPack({
    workingDir: working_dir,
    repoRoot,
    requestText: request_text,
    touchedFiles: touched_files || [],
    budgetTokens: budget_tokens,
  });

  const event = insertRequestEvent(db, {
    session_id,
    request_text,
    context_pack: JSON.stringify(result.pack),
    omitted_items: JSON.stringify(result.pack.omitted),
    token_count: result.pack.total_tokens,
    budget: result.pack.budget_tokens,
    deep_read: result.deep_read ? JSON.stringify(result.deep_read) : null,
  });

  result.event_id = event.id;

  return c.json(result, 200);
});

contextPack.get('/context-pack/preview', (c) => {
  const request = c.req.query('request');
  const cwd = c.req.query('cwd');
  const budget = c.req.query('budget');

  if (!request || !cwd) {
    return c.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'request and cwd query parameters are required',
        },
      },
      400,
    );
  }

  const repoRoot = findRepoRoot(cwd);

  const result = buildContextPack({
    workingDir: cwd,
    repoRoot,
    requestText: request,
    budgetTokens: budget ? parseInt(budget, 10) : undefined,
  });

  result.event_id = null;

  return c.json(result, 200);
});

function findRepoRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

export { contextPack };
