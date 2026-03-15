import { Hono } from 'hono';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AppEnv } from '../types.js';
import { parseCtxFile, serializeCtxFile, extractConflicts, resolveConflict } from '@ctxkit/core';

export const conflictRoutes = new Hono<AppEnv>();

// GET /conflicts — list all files with unresolved conflicts
conflictRoutes.get('/conflicts', async (c) => {
  const repoRoot = c.req.query('repo_root');
  if (!repoRoot) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }

  const files = findCtxFilesWithConflicts(repoRoot);
  const totalConflicts = files.reduce((sum, f) => sum + f.conflicts.length, 0);

  return c.json({ files, total_conflicts: totalConflicts });
});

// POST /conflicts/resolve — resolve a specific conflict
conflictRoutes.post('/conflicts/resolve', async (c) => {
  const body = await c.req.json();
  const { repo_root, ctx_path, section, key, choice, author } = body;

  if (!repo_root || !ctx_path || !section || !key || !choice || !author) {
    return c.json({
      error: { code: 'BAD_REQUEST', message: 'repo_root, ctx_path, section, key, choice, and author are required' },
    }, 400);
  }

  const validChoices = ['pick_ours', 'pick_theirs', 'manual', 'keep_both'];
  if (!validChoices.includes(choice)) {
    return c.json({
      error: { code: 'BAD_REQUEST', message: `Invalid choice. Must be one of: ${validChoices.join(', ')}` },
    }, 400);
  }

  const fullPath = join(repo_root, ctx_path);
  let content: string;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch {
    return c.json({ error: { code: 'NOT_FOUND', message: `File not found: ${ctx_path}` } }, 404);
  }

  const { ctx } = parseCtxFile(content);
  const conflicts = extractConflicts(ctx);

  const targetConflict = conflicts.find((cf: { section: string; key: string }) => cf.section === section && cf.key === key);
  if (!targetConflict) {
    return c.json({
      error: { code: 'NOT_FOUND', message: `No conflict found for section "${section}", key "${key}"` },
    }, 404);
  }

  const { ctx: resolved, remainingConflicts } = resolveConflict(ctx, conflicts, {
    ctx_path,
    section,
    key,
    choice,
    author,
    manual_content: body.manual_content,
  });

  writeFileSync(fullPath, serializeCtxFile(resolved), 'utf-8');

  return c.json({
    resolved: true,
    new_version: resolved.version,
    remaining_conflicts: remainingConflicts.length,
  });
});

// --- Helpers ---

interface FileConflictInfo {
  path: string;
  conflict_count: number;
  conflicts: Array<{
    section: string;
    key: string;
    ours_author: string;
    theirs_author: string;
  }>;
}

function findCtxFilesWithConflicts(repoRoot: string): FileConflictInfo[] {
  const result: FileConflictInfo[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (entry === '.ctx') {
          const content = readFileSync(fullPath, 'utf-8');
          const { ctx } = parseCtxFile(content);
          const conflicts = extractConflicts(ctx);
          if (conflicts.length > 0) {
            result.push({
              path: relative(repoRoot, fullPath),
              conflict_count: conflicts.length,
              conflicts: conflicts.map((c: { section: string; key: string; ours_author: string; theirs_author: string }) => ({
                section: c.section,
                key: c.key,
                ours_author: c.ours_author,
                theirs_author: c.theirs_author,
              })),
            });
          }
        }
      } catch {
        // Skip files that can't be read/parsed
      }
    }
  }

  walk(repoRoot);
  return result;
}
