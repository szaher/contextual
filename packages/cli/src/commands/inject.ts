import { Command } from 'commander';
import { buildContextPack } from '@ctxl/core';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

export const injectCommand = new Command('inject')
  .description('Build and display a Context Pack for a request')
  .requiredOption('--request <text>', 'The request text to build context for')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--budget <tokens>', 'Token budget', '4000')
  .option('--preview', 'Preview mode (no event recorded)', false)
  .action((options) => {
    const workingDir = resolve(options.cwd);
    const repoRoot = findRepoRoot(workingDir);
    const budgetTokens = parseInt(options.budget, 10);

    const result = buildContextPack({
      workingDir,
      repoRoot,
      requestText: options.request,
      budgetTokens,
    });

    const pack = result.pack;

    // Format output
    console.log(
      `\nContext Pack (${pack.total_tokens} / ${pack.budget_tokens} tokens)`,
    );
    console.log('━'.repeat(40));

    if (pack.items.length > 0) {
      console.log(`\nIncluded (${pack.items.length} items):`);
      for (let i = 0; i < pack.items.length; i++) {
        const item = pack.items[i];
        const reasons = item.reason_codes.length > 0
          ? `[${item.reason_codes.join(', ')}]`
          : '';
        console.log(
          `  ${i + 1}. ${reasons.padEnd(25)} ${item.source} → ${item.section}/${item.entry_id} (${item.tokens} tok)`,
        );
      }
    }

    if (pack.omitted.length > 0) {
      console.log(`\nOmitted (${pack.omitted.length} items):`);
      for (const item of pack.omitted) {
        console.log(
          `  - ${item.source} → ${item.section} (score: ${item.score}, reason: ${item.reason})`,
        );
      }
    }

    if (result.deep_read) {
      console.log(`\nDeep Read: ${result.deep_read.rationale}`);
    }

    console.log();
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
