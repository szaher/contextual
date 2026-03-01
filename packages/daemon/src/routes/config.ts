import { Hono } from 'hono';
import { loadProfile } from '@ctxl/core';
import type { AppEnv } from '../types.js';

const KNOWN_CONFIG_KEYS = [
  'budget',
  'model',
  'tools',
  'memory',
  'context',
  'agent',
  'rules',
] as const;

const config = new Hono<AppEnv>();

// GET /config
config.get('/config', (c) => {
  const repo_root = c.req.query('repo_root');

  if (!repo_root) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'repo_root query parameter is required' } },
      400,
    );
  }

  const profile = loadProfile(repo_root);

  return c.json(
    { effective_config: profile, sources: profile.sources },
    200,
  );
});

// POST /config/validate
config.post('/config/validate', async (c) => {
  const body = await c.req.json();
  const { config: configObj } = body;

  if (!configObj || typeof configObj !== 'object') {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'config object is required' } },
      400,
    );
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for unknown keys
  const knownSet = new Set<string>(KNOWN_CONFIG_KEYS);
  for (const key of Object.keys(configObj)) {
    if (!knownSet.has(key)) {
      warnings.push(`Unknown config key: "${key}"`);
    }
  }

  // Validate budget range if present
  if (configObj.budget !== undefined) {
    if (typeof configObj.budget !== 'number') {
      errors.push('budget must be a number');
    } else if (configObj.budget < 0) {
      errors.push('budget must be non-negative');
    } else if (configObj.budget > 1_000_000) {
      warnings.push('budget exceeds typical maximum (1000000)');
    }
  }

  const valid = errors.length === 0;

  return c.json({ valid, warnings, errors }, 200);
});

export { config };
