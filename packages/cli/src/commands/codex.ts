import { Command } from 'commander';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { syncAgents } from '../services/agents-md.js';

export const codexCommand = new Command('codex')
  .description('Codex integration commands');

codexCommand
  .command('sync-agents')
  .description('Generate AGENTS.md files from .ctx hierarchy for Codex')
  .option('--repo-root <path>', 'Repository root path (auto-detected)')
  .option('--budget <tokens>', 'Max tokens per AGENTS.md file', '8000')
  .option('--dry-run', 'Show what would be written without writing', false)
  .action((options) => {
    const repoRoot = options.repoRoot
      ? resolve(options.repoRoot)
      : findRepoRoot(process.cwd());

    if (!repoRoot) {
      console.error('Error: Could not detect repository root. Use --repo-root to specify.');
      process.exitCode = 1;
      return;
    }

    const budget = parseInt(options.budget, 10);
    if (isNaN(budget) || budget <= 0) {
      console.error('Error: --budget must be a positive number');
      process.exitCode = 1;
      return;
    }

    if (options.dryRun) {
      console.log('Dry run mode - no files will be written\n');
    }

    const results = syncAgents({
      repoRoot,
      budget,
      dryRun: options.dryRun,
    });

    if (results.length === 0) {
      console.log('No .ctx files found in repository.');
      return;
    }

    const created = results.filter((r) => r.action === 'created');
    const updated = results.filter((r) => r.action === 'updated');
    const unchanged = results.filter((r) => r.action === 'unchanged');

    for (const r of results) {
      const icon =
        r.action === 'created' ? '+' :
        r.action === 'updated' ? '~' :
        '=';
      console.log(`  ${icon} ${r.relativePath} (${r.tokens} tokens)`);
    }

    console.log(
      `\nSummary: ${created.length} created, ${updated.length} updated, ${unchanged.length} unchanged`,
    );
  });

function findRepoRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
