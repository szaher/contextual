import { Command } from 'commander';
import type { CtxlEntry, CtxlGraphNode } from '@ctxkit/core';
import { generateIndex, writeIndex, readIndex, selectFromIndex } from '@ctxkit/core';
import { resolve, join, dirname } from 'node:path';
import { accessSync } from 'node:fs';

export const indexCommand = new Command('index')
  .description('Manage the .ctxl index');

indexCommand
  .command('generate')
  .description('Generate or regenerate the .ctxl index from existing .ctx files')
  .option('--cwd <path>', 'Repository root', process.cwd())
  .option('--repo <name>', 'Repository name')
  .option('--force', 'Force regeneration even if index exists', false)
  .option('--json', 'Output as JSON', false)
  .action((options) => {
    const repoRoot = resolve(options.cwd);

    const index = generateIndex(repoRoot, options.repo);
    const indexPath = writeIndex(repoRoot, index);

    if (options.json) {
      console.log(JSON.stringify({
        index_path: indexPath,
        entries_count: index.entries.length,
        total_tokens: index.entries.reduce((sum: number, e: CtxlEntry) => sum + e.token_estimate, 0),
        dependencies_found: Object.values(index.graph).reduce(
          (sum: number, n: CtxlGraphNode) => sum + n.depends_on.length, 0,
        ),
        generated_at: index.generated_at,
      }, null, 2));
      return;
    }

    console.log(`Generated .ctxl index with ${index.entries.length} entries`);
    console.log(`  Total tokens: ${index.entries.reduce((sum: number, e: CtxlEntry) => sum + e.token_estimate, 0)}`);
    console.log(`  Dependencies: ${Object.values(index.graph).reduce((sum: number, n: CtxlGraphNode) => sum + n.depends_on.length, 0)}`);
    console.log(`  Path: ${indexPath}`);
  });

indexCommand
  .command('select')
  .description('Select context from the index for a task')
  .requiredOption('--prompt <text>', 'The task prompt')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--budget <tokens>', 'Token budget', '4000')
  .option('--json', 'Output as JSON', false)
  .action((options) => {
    const cwd = resolve(options.cwd);
    const repoRoot = findRepoRoot(cwd);
    const budgetTokens = parseInt(options.budget, 10);

    const index = readIndex(repoRoot);
    if (!index) {
      console.error('Error: No .ctxl index found. Run `ctxkit index generate` first.');
      process.exit(1);
    }

    const result = selectFromIndex(index, {
      prompt: options.prompt,
      cwd,
      repoRoot,
      budgetTokens,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`\nSelected ${result.selected.length} .ctx files:`);
    for (const s of result.selected) {
      console.log(`  ${s.entry.path} (score: ${s.score}, reasons: ${s.reasons.join(', ')})`);
    }
    if (result.omitted.length > 0) {
      console.log(`\nOmitted ${result.omitted.length} .ctx files:`);
      for (const o of result.omitted) {
        console.log(`  ${o.entry.path}: ${o.reason}`);
      }
    }
    console.log(`\nBudget used: ${result.budget_used.total} tokens`);
  });

indexCommand
  .command('show')
  .description('Display the current .ctxl index')
  .option('--cwd <path>', 'Repository root', process.cwd())
  .option('--json', 'Output as JSON', false)
  .action((options) => {
    const repoRoot = resolve(options.cwd);
    const index = readIndex(repoRoot);

    if (!index) {
      console.error('Error: No .ctxl index found. Run `ctxkit index generate` first.');
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(index, null, 2));
      return;
    }

    console.log(`\n.ctxl Index (${index.entries.length} entries)`);
    console.log(`  Generated: ${index.generated_at}`);
    console.log(`  Updated: ${index.updated_at}`);
    console.log(`\nEntries:`);
    for (const entry of index.entries) {
      console.log(`  ${entry.path} (v${entry.ctx_version}, ${entry.token_estimate} tokens, tags: [${entry.tags.join(', ')}])`);
    }
    console.log(`\nScoring: locality=${index.defaults.scoring.locality_weight} recency=${index.defaults.scoring.recency_weight} tags=${index.defaults.scoring.tag_match_weight}`);
    console.log(`Budget: total=${index.defaults.budget.total} contracts=${index.defaults.budget.contracts} local=${index.defaults.budget.local_ctx} related=${index.defaults.budget.related_ctx}`);
  });

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    try {
      accessSync(join(dir, '.git'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return startDir; // reached root
      dir = parent;
    }
  }
}
