import { Hono } from 'hono';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppEnv } from '../types.js';

const CTXKIT_HOOK_MARKER = '# Installed by: ctxkit hooks init';

export const hooksRoutes = new Hono<AppEnv>();

// GET /hooks/status — check hook installation status for a repository
hooksRoutes.get('/hooks/status', (c) => {
  const cwd = c.req.query('cwd');
  if (!cwd) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'cwd is required' } }, 400);
  }

  const hooksDir = join(cwd, '.git', 'hooks');
  const hookNames = ['pre_commit', 'post_commit', 'prepare_commit_msg'] as const;
  const hookFiles = ['pre-commit', 'post-commit', 'prepare-commit-msg'] as const;

  const status: Record<string, { status: string; version?: string; chained?: boolean }> = {};

  for (let i = 0; i < hookNames.length; i++) {
    const name = hookNames[i];
    const file = hookFiles[i];
    const hookPath = join(hooksDir, file);
    const originalPath = `${hookPath}.ctxkit-original`;

    if (!existsSync(hookPath)) {
      status[name] = { status: 'not_installed' };
      continue;
    }

    const content = readFileSync(hookPath, 'utf-8');
    if (!content.includes(CTXKIT_HOOK_MARKER)) {
      status[name] = { status: 'not_installed' };
      continue;
    }

    const versionMatch = content.match(/# Version: (.+)/);
    const version = versionMatch ? versionMatch[1] : undefined;
    const isChained = existsSync(originalPath);

    status[name] = {
      status: isChained ? 'chained' : 'installed',
      version,
      ...(isChained ? { chained: true } : {}),
    };
  }

  // Detect other hooks
  const otherHooks: string[] = [];
  try {
    if (existsSync(hooksDir)) {
      const allFiles = readdirSync(hooksDir);
      for (const f of allFiles) {
        if (f.endsWith('.sample') || f.endsWith('.ctxkit-original')) continue;
        if (!hookFiles.includes(f as typeof hookFiles[number]) && f.length > 0) {
          otherHooks.push(f);
        }
      }
    }
  } catch {
    // Ignore
  }

  return c.json({ ...status, other_hooks: otherHooks });
});
