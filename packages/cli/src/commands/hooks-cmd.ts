import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export const hooksCommand = new Command('hooks')
  .description('Git hook management');

hooksCommand
  .command('init')
  .description('Install git hooks for context validation')
  .option('--force', 'Overwrite existing hooks')
  .action(async (options) => {
    try {
      let repoRoot: string;
      try {
        repoRoot = execSync('git rev-parse --show-toplevel', {
          encoding: 'utf-8',
          timeout: 3000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {
        console.error('Error: Not a git repository');
        process.exit(1);
        return;
      }

      const hooksDir = join(repoRoot, '.git', 'hooks');
      if (!existsSync(hooksDir)) {
        mkdirSync(hooksDir, { recursive: true });
      }

      const hooks: Array<{ name: string; content: string }> = [
        {
          name: 'pre-commit',
          content: `#!/bin/sh
# ctxkit pre-commit hook — validates .ctx files before committing
# Installed by: ctxkit hooks init

# Check if ctxkit is available
if ! command -v ctxkit &> /dev/null; then
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
`,
        },
        {
          name: 'post-commit',
          content: `#!/bin/sh
# ctxkit post-commit hook — updates .ctxl index after commit
# Installed by: ctxkit hooks init

# Check if ctxkit is available
if ! command -v ctxkit &> /dev/null; then
  exit 0
fi

# Check if any .ctx files were changed
CHANGED_CTX=$(git diff-tree --no-commit-id --name-only -r HEAD | grep '\\.ctx$' || true)

if [ -n "$CHANGED_CTX" ]; then
  echo "[ctxkit] Updating .ctxl index..."
  ctxkit index generate --json > /dev/null 2>&1 || true
fi
`,
        },
      ];

      const installed: string[] = [];

      for (const hook of hooks) {
        const hookPath = join(hooksDir, hook.name);

        if (existsSync(hookPath) && !options.force) {
          console.error(`Hook already exists: ${hook.name}. Use --force to overwrite.`);
          process.exit(1);
          return;
        }

        writeFileSync(hookPath, hook.content, 'utf-8');
        chmodSync(hookPath, 0o755);
        installed.push(hook.name);
      }

      console.log(`Installed hooks: ${installed.join(', ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
