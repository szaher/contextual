import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { analyzeDirectories, generateProposals, applyProposals } from '@ctxkit/core';
import type { BootstrapProposal } from '@ctxkit/core';

export const bootstrapRoutes = new Hono<AppEnv>();

// POST /bootstrap/analyze — analyze directories and return proposals
bootstrapRoutes.post('/bootstrap/analyze', async (c) => {
  const body = await c.req.json();
  const { repo_root, target_path, mode, skip_existing, min_files } = body;

  if (!repo_root) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }

  const results = analyzeDirectories(repo_root, {
    mode: mode || 'quick',
    skipExisting: skip_existing !== false,
    minFiles: min_files ?? 3,
    targetPath: target_path,
  });

  const proposals = generateProposals(results);

  return c.json({
    proposals: proposals.map((p: BootstrapProposal) => ({
      path: p.path,
      summary: p.summary,
      key_files: p.key_files,
      tags: p.tags,
      commands: p.commands,
      language: p.language,
      framework: p.framework,
      token_estimate: p.token_estimate,
    })),
    skipped: [],
  });
});

// POST /bootstrap/apply — apply bootstrap proposals
bootstrapRoutes.post('/bootstrap/apply', async (c) => {
  const body = await c.req.json();
  const { repo_root, proposals } = body;

  if (!repo_root || !proposals) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root and proposals are required' } }, 400);
  }

  const written = applyProposals(repo_root, proposals);

  return c.json({
    written,
    index_updated: false,
  });
});
