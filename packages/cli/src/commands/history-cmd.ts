import { Command } from 'commander';
import { accessSync, readFileSync } from 'node:fs';
import { resolve, relative, join, dirname } from 'node:path';
import type { HistoryEntry } from '@ctxkit/core';
import { parseCtxFile, readMergedHistory } from '@ctxkit/core';

export const historyCommand = new Command('history')
  .description('Show version history for a .ctx file')
  .argument('[path]', 'Path to .ctx file', '.ctx')
  .option('--cwd <dir>', 'Working directory', process.cwd())
  .option('--all', 'Include archived history entries', false)
  .option('--count <n>', 'Number of entries to show', '10')
  .option('--diff <range>', 'Show diff between versions (e.g., 1..5)')
  .option('--json', 'Output as JSON', false)
  .action((ctxPath, options) => {
    const cwd = resolve(options.cwd);
    const fullPath = resolve(cwd, ctxPath);
    const repoRoot = findRepoRoot(cwd);
    const relativePath = relative(repoRoot, fullPath);

    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      console.error(`Error: Cannot read ${fullPath}`);
      process.exit(1);
    }

    const { ctx } = parseCtxFile(content);

    // Handle diff mode
    if (options.diff) {
      const [fromStr, toStr] = options.diff.split('..');
      const from = parseInt(fromStr, 10);
      const to = parseInt(toStr, 10);

      if (isNaN(from) || isNaN(to)) {
        console.error('Error: Invalid diff range. Use format: N..M');
        process.exit(1);
      }

      // For a real diff we'd need version snapshots — use diff_summary from history entries
      const history = options.all
        ? readMergedHistory(ctx, relativePath, repoRoot)
        : (ctx._history ?? []);

      const relevant = history.filter((h: HistoryEntry) => h.version > from && h.version <= to);

      if (options.json) {
        console.log(JSON.stringify({
          from_version: from,
          to_version: to,
          entries: relevant,
          summary: relevant.map((h: HistoryEntry) => h.diff_summary).join('; '),
        }, null, 2));
        return;
      }

      console.log(`\nDiff: v${from}..v${to}`);
      for (const entry of relevant) {
        console.log(`  v${entry.version} (${entry.timestamp}) by ${entry.author}: ${entry.diff_summary}`);
      }
      return;
    }

    // Show history
    const count = parseInt(options.count, 10);
    const history = options.all
      ? readMergedHistory(ctx, relativePath, repoRoot)
      : (ctx._history ?? []);

    const shown = history.slice(0, count);

    if (options.json) {
      console.log(JSON.stringify({
        path: relativePath,
        current_version: ctx.version,
        entries: shown,
        has_more: history.length > count,
      }, null, 2));
      return;
    }

    console.log(`\n${relativePath} (v${ctx.version})`);
    if (shown.length === 0) {
      console.log('  No history entries');
      return;
    }
    for (const entry of shown) {
      console.log(`  v${entry.version} | ${entry.timestamp} | ${entry.author} | ${entry.diff_summary}`);
      if (entry.reason) console.log(`         Reason: ${entry.reason}`);
    }
    if (history.length > count) {
      console.log(`  ... ${history.length - count} more entries (use --all or --count)`);
    }
  });

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    try {
      accessSync(join(dir, '.git'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return startDir;
      dir = parent;
    }
  }
}
