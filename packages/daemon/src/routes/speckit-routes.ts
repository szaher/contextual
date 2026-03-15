import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export const speckitRoutes = new Hono<AppEnv>();

// POST /speckit/import — import spec-kit artifacts into .ctx files
speckitRoutes.post('/speckit/import', async (c) => {
  const body = await c.req.json();
  const { repo_root, constitution_path, specs_dir, dry_run } = body;

  if (!repo_root) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }

  const { importConstitution, importSpecs } = await import('@ctxkit/speckit-bridge');

  let totalDecisions = 0;
  let totalContracts = 0;
  let totalGotchas = 0;
  const allFilesUpdated: string[] = [];

  if (constitution_path) {
    const constResult = importConstitution(repo_root, constitution_path, !!dry_run);
    totalDecisions += constResult.decisions;
    totalContracts += constResult.contracts;
    allFilesUpdated.push(...constResult.files_updated);
  }

  if (specs_dir) {
    const specsResult = importSpecs(repo_root, specs_dir, !!dry_run);
    totalContracts += specsResult.contracts;
    totalGotchas += specsResult.gotchas;
    allFilesUpdated.push(...specsResult.files_updated);
  }

  return c.json({
    imported: {
      decisions: totalDecisions,
      contracts: totalContracts,
      gotchas: totalGotchas,
    },
    files_updated: allFilesUpdated,
  });
});

// POST /speckit/export — export .ctx content to spec-kit format
speckitRoutes.post('/speckit/export', async (c) => {
  const body = await c.req.json();
  const { repo_root, output_dir, format } = body;

  if (!repo_root) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }

  const { exportToSpecKit } = await import('@ctxkit/speckit-bridge');
  const result = exportToSpecKit(repo_root, output_dir || 'specs/exported/', format || 'md');

  return c.json(result);
});

// POST /speckit/validate — validate .ctx files against constitution
speckitRoutes.post('/speckit/validate', async (c) => {
  const body = await c.req.json();
  const { repo_root, constitution_path } = body;

  if (!repo_root) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }

  if (!constitution_path) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'constitution_path is required' } }, 400);
  }

  const { validateConstitution } = await import('@ctxkit/speckit-bridge');
  const result = validateConstitution(repo_root, constitution_path);

  return c.json(result);
});

// POST /speckit/sync — bidirectional sync between spec-kit and .ctx
speckitRoutes.post('/speckit/sync', async (c) => {
  const body = await c.req.json();
  const { repo_root, dry_run, force_direction } = body;

  if (!repo_root) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }

  const { syncBidirectional } = await import('@ctxkit/speckit-bridge');
  const result = syncBidirectional(repo_root, {
    dryRun: !!dry_run,
    forceDirection: force_direction,
  });

  return c.json(result);
});
