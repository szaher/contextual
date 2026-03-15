import { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync, renameSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { formatTrailers } from '@ctxkit/core';

const CTXKIT_VERSION = '0.2.0';
const CTXKIT_HOOK_MARKER = '# Installed by: ctxkit hooks init';
const MAX_MESSAGE_SIZE = 72 * 1024; // 72KB GitHub soft limit

export const hooksCommand = new Command('hooks')
  .description('Git hook management');

/**
 * Detect git repository root. Returns null if not a git repo.
 */
function getRepoRoot(): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get the prepare-commit-msg hook script content.
 */
function getPrepareCommitMsgScript(): string {
  return `#!/bin/sh
# ctxkit prepare-commit-msg hook — injects context trailers into commit messages
${CTXKIT_HOOK_MARKER}
# Version: ${CTXKIT_VERSION}

# Check if ctxkit is available
if ! command -v ctxkit >/dev/null 2>&1; then
  exit 0
fi

# $2 contains the commit source: message, template, merge, squash, or commit (amend)
# Skip injection for non-interactive commits (rebase, squash, amend)
case "$2" in
  merge|squash|commit)
    exit 0
    ;;
esac

# Inject trailers — must complete within 500ms total
# On any failure, exit 0 (never block commits)
ctxkit hooks inject-trailers "$1" 2>/dev/null || true

exit 0
`;
}

/**
 * Get the pre-commit hook script content.
 */
function getPreCommitScript(): string {
  return `#!/bin/sh
# ctxkit pre-commit hook — validates .ctx files before committing
${CTXKIT_HOOK_MARKER}
# Version: ${CTXKIT_VERSION}

# Check if ctxkit is available
if ! command -v ctxkit >/dev/null 2>&1; then
  echo "[ctxkit] Warning: ctxkit not found, skipping .ctx validation"
  exit 0
fi

# Get list of staged .ctx files
STAGED_CTX=$(git diff --cached --name-only --diff-filter=ACM | grep '\\.ctx$' || true)

if [ -n "$STAGED_CTX" ]; then
  echo "[ctxkit] Validating staged .ctx files..."
  ctxkit validate --json > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "[ctxkit] Validation failed. Fix issues before committing."
    exit 1
  fi
  echo "[ctxkit] All .ctx files valid."
fi
`;
}

/**
 * Get the post-commit hook script content.
 */
function getPostCommitScript(): string {
  return `#!/bin/sh
# ctxkit post-commit hook — updates .ctxl index after commit
${CTXKIT_HOOK_MARKER}
# Version: ${CTXKIT_VERSION}

# Check if ctxkit is available
if ! command -v ctxkit >/dev/null 2>&1; then
  exit 0
fi

# Check if any .ctx files were changed
CHANGED_CTX=$(git diff-tree --no-commit-id --name-only -r HEAD | grep '\\.ctx$' || true)

if [ -n "$CHANGED_CTX" ]; then
  echo "[ctxkit] Updating .ctxl index..."
  ctxkit index generate --json > /dev/null 2>&1 || true
fi
`;
}

/**
 * Check if a hook file was installed by ctxkit.
 */
function isCtxkitHook(hookPath: string): boolean {
  if (!existsSync(hookPath)) return false;
  const content = readFileSync(hookPath, 'utf-8');
  return content.includes(CTXKIT_HOOK_MARKER);
}

/**
 * Get installed hook version from hook file content.
 */
function getHookVersion(hookPath: string): string | null {
  if (!existsSync(hookPath)) return null;
  const content = readFileSync(hookPath, 'utf-8');
  const match = content.match(/# Version: (.+)/);
  return match ? match[1] : null;
}

// ============================================================
// ctxkit hooks init
// ============================================================
hooksCommand
  .command('init')
  .description('Install git hooks for context validation and trailer injection')
  .option('--force', 'Overwrite existing hooks')
  .option('--context-trailers', 'Install prepare-commit-msg hook (default: true)', true)
  .action(async (options) => {
    try {
      const repoRoot = getRepoRoot();
      if (!repoRoot) {
        console.error('Error: Not a git repository');
        process.exit(1);
        return;
      }

      const hooksDir = join(repoRoot, '.git', 'hooks');
      if (!existsSync(hooksDir)) {
        mkdirSync(hooksDir, { recursive: true });
      }

      const hooks: Array<{ name: string; content: string }> = [
        { name: 'pre-commit', content: getPreCommitScript() },
        { name: 'post-commit', content: getPostCommitScript() },
      ];

      if (options.contextTrailers !== false) {
        hooks.push({ name: 'prepare-commit-msg', content: getPrepareCommitMsgScript() });
      }

      const installed: string[] = [];
      const chained: string[] = [];
      const updated: string[] = [];

      for (const hook of hooks) {
        const hookPath = join(hooksDir, hook.name);
        const originalPath = `${hookPath}.ctxkit-original`;

        if (existsSync(hookPath)) {
          if (isCtxkitHook(hookPath)) {
            // Already a ctxkit hook — update it
            writeFileSync(hookPath, hook.content, 'utf-8');
            chmodSync(hookPath, 0o755);
            updated.push(hook.name);
            continue;
          }

          if (!options.force) {
            // Chain with existing hook
            renameSync(hookPath, originalPath);

            const chainedContent = `#!/bin/sh
# ctxkit chained hook — runs original hook first, then ctxkit hook
${CTXKIT_HOOK_MARKER}
# Version: ${CTXKIT_VERSION}

# Run original hook first
if [ -x "${originalPath}" ]; then
  "${originalPath}" "$@"
  ORIGINAL_EXIT=$?
  if [ $ORIGINAL_EXIT -ne 0 ]; then
    exit $ORIGINAL_EXIT
  fi
fi

# Then run ctxkit logic
${hook.content.split('\n').filter((l) => !l.startsWith('#!/bin/sh')).join('\n')}
`;
            writeFileSync(hookPath, chainedContent, 'utf-8');
            chmodSync(hookPath, 0o755);
            chained.push(hook.name);
            continue;
          }
        }

        writeFileSync(hookPath, hook.content, 'utf-8');
        chmodSync(hookPath, 0o755);
        installed.push(hook.name);
      }

      console.log('Installed git hooks:');
      for (const name of installed) {
        const desc = hookDescription(name);
        console.log(`  \u2713 ${name} (${desc})`);
      }
      for (const name of chained) {
        console.log(`  \u2713 ${name} (chained with existing hook)`);
      }
      for (const name of updated) {
        console.log(`  \u2713 ${name} (updated)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

function hookDescription(name: string): string {
  switch (name) {
    case 'pre-commit': return 'validate .ctx files';
    case 'post-commit': return 'regenerate .ctxl index';
    case 'prepare-commit-msg': return 'inject context trailers';
    default: return name;
  }
}

// ============================================================
// ctxkit hooks inject-trailers <msg-file>
// ============================================================
hooksCommand
  .command('inject-trailers <msg-file>')
  .description('Inject context trailers into a commit message file (internal, called by hook)')
  .action(async (msgFile: string) => {
    try {
      const repoRoot = getRepoRoot();
      if (!repoRoot) return;

      // Check for staged .ctx files
      let stagedCtxFiles: string[] = [];
      try {
        const staged = execSync('git diff --cached --name-only', {
          cwd: repoRoot,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        stagedCtxFiles = staged
          .split('\n')
          .filter((f) => f.trim().endsWith('.ctx'))
          .map((f) => f.trim());
      } catch {
        // Ignore errors
      }

      // Query daemon for active session (200ms timeout)
      let sessionId: string | undefined;
      let entryCount: number | undefined;
      const daemonUrl = process.env['CTXKIT_API'] || 'http://localhost:4117';

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 200);
        const res = await fetch(`${daemonUrl}/api/v1/sessions?status=active&limit=1`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json() as { sessions: Array<{ id: string }> };
          if (data.sessions.length > 0) {
            sessionId = data.sessions[0].id;
          }
        }
      } catch {
        // Daemon unreachable — use local-only data
      }

      // No-op if no active session and no .ctx files staged
      if (!sessionId && stagedCtxFiles.length === 0) {
        return;
      }

      const trailerBlock = formatTrailers({
        sessionId,
        files: stagedCtxFiles.length > 0 ? stagedCtxFiles : undefined,
        entries: entryCount,
        timestamp: new Date().toISOString(),
      });

      if (!trailerBlock) return;

      // Read current message
      const currentMessage = readFileSync(msgFile, 'utf-8');

      // Check message length limit — truncate files list if needed
      const newMessage = `${currentMessage.trimEnd()}\n\n${trailerBlock}\n`;
      if (newMessage.length > MAX_MESSAGE_SIZE && stagedCtxFiles.length > 1) {
        const truncatedTrailers = formatTrailers({
          sessionId,
          files: [`${stagedCtxFiles[0]} (truncated, see session ${sessionId || 'N/A'})`],
          entries: entryCount,
          timestamp: new Date().toISOString(),
        });
        writeFileSync(msgFile, `${currentMessage.trimEnd()}\n\n${truncatedTrailers}\n`, 'utf-8');
      } else {
        writeFileSync(msgFile, newMessage, 'utf-8');
      }
    } catch {
      // Never block commits — silently exit
    }
  });

// ============================================================
// ctxkit hooks status
// ============================================================
hooksCommand
  .command('status')
  .description('Check git hook installation status')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const repoRoot = getRepoRoot();
      if (!repoRoot) {
        console.error('Error: Not a git repository');
        process.exit(1);
        return;
      }

      const hooksDir = join(repoRoot, '.git', 'hooks');

      const hookNames = ['pre-commit', 'post-commit', 'prepare-commit-msg'] as const;
      type HookName = typeof hookNames[number];

      const status: Record<string, { status: string; version?: string; chained?: boolean }> = {};

      for (const name of hookNames) {
        const hookPath = join(hooksDir, name);
        const originalPath = `${hookPath}.ctxkit-original`;

        if (!existsSync(hookPath)) {
          status[name.replace(/-/g, '_')] = { status: 'not_installed' };
          continue;
        }

        if (!isCtxkitHook(hookPath)) {
          status[name.replace(/-/g, '_')] = { status: 'not_installed' };
          continue;
        }

        const version = getHookVersion(hookPath);
        const isChained = existsSync(originalPath);

        if (isChained) {
          status[name.replace(/-/g, '_')] = {
            status: 'chained',
            version: version || undefined,
            chained: true,
          };
        } else if (version && version !== CTXKIT_VERSION) {
          status[name.replace(/-/g, '_')] = {
            status: 'outdated',
            version: version || undefined,
          };
        } else {
          status[name.replace(/-/g, '_')] = {
            status: 'installed',
            version: version || undefined,
          };
        }
      }

      // Check for other hooks
      const otherHooks: string[] = [];
      try {
        const allHooks = execSync(`ls "${hooksDir}"`, {
          encoding: 'utf-8',
          timeout: 3000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).split('\n').filter((f) => f.trim() && !f.includes('.sample') && !f.includes('.ctxkit-original'));

        for (const f of allHooks) {
          const name = f.trim();
          if (!hookNames.includes(name as HookName) && name.length > 0) {
            otherHooks.push(name);
          }
        }
      } catch {
        // Ignore
      }

      if (options.json) {
        console.log(JSON.stringify({ ...status, other_hooks: otherHooks }, null, 2));
      } else {
        console.log('Git hooks status:');
        for (const name of hookNames) {
          const key = name.replace(/-/g, '_');
          const s = status[key];
          const versionStr = s.version ? ` (v${s.version})` : '';
          const pad = ' '.repeat(Math.max(0, 22 - name.length));
          console.log(`  ${name}:${pad}${s.status}${versionStr}`);
        }
        if (otherHooks.length > 0) {
          console.log(`  other hooks:          ${otherHooks.join(', ')}`);
        } else {
          console.log('  other hooks:          none detected');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ============================================================
// ctxkit hooks remove
// ============================================================
hooksCommand
  .command('remove')
  .description('Remove ctxkit git hooks')
  .option('--all', 'Remove all ctxkit hooks')
  .option('--context-trailers', 'Remove only the prepare-commit-msg hook')
  .action(async (options) => {
    try {
      const repoRoot = getRepoRoot();
      if (!repoRoot) {
        console.error('Error: Not a git repository');
        process.exit(1);
        return;
      }

      const hooksDir = join(repoRoot, '.git', 'hooks');
      const toRemove: string[] = [];

      if (options.contextTrailers) {
        toRemove.push('prepare-commit-msg');
      } else if (options.all) {
        toRemove.push('pre-commit', 'post-commit', 'prepare-commit-msg');
      } else {
        console.error('Error: Specify --all or --context-trailers');
        process.exit(1);
        return;
      }

      const removed: string[] = [];

      for (const name of toRemove) {
        const hookPath = join(hooksDir, name);
        const originalPath = `${hookPath}.ctxkit-original`;

        if (!existsSync(hookPath)) continue;
        if (!isCtxkitHook(hookPath)) continue;

        // Restore original hook if chained
        if (existsSync(originalPath)) {
          unlinkSync(hookPath);
          renameSync(originalPath, hookPath);
          removed.push(`${name} (restored original hook)`);
        } else {
          unlinkSync(hookPath);
          removed.push(name);
        }
      }

      if (removed.length === 0) {
        console.log('No ctxkit hooks to remove.');
      } else {
        console.log('Removed git hooks:');
        for (const name of removed) {
          console.log(`  \u2713 ${name}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
