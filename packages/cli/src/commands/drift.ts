import { Command } from 'commander';
import { resolve, join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { detectDrift, detectAllDrift } from '@ctxl/core';

export const driftCommand = new Command('drift')
  .description('Check .ctx files for stale references and drift')
  .argument('[path]', 'Path to .ctx file or repo root to scan all', '.')
  .action((pathArg) => {
    const targetPath = resolve(pathArg);
    const repoRoot = findRepoRoot(targetPath);

    if (targetPath.endsWith('.ctx') && existsSync(targetPath)) {
      // Single .ctx file
      const result = detectDrift(targetPath, repoRoot);
      printDriftResult(result);
    } else {
      // Scan all .ctx files from the target directory
      const scanRoot = existsSync(join(targetPath, '.git')) ? targetPath : repoRoot;
      const results = detectAllDrift(scanRoot);

      if (results.length === 0) {
        console.log('No .ctx files found.');
        return;
      }

      let totalStale = 0;
      for (const result of results) {
        if (result.stale_entries.length > 0) {
          printDriftResult(result);
          console.log();
        }
        totalStale += result.total_stale;
      }

      if (totalStale === 0) {
        console.log(`All ${results.length} .ctx file(s) are up to date.`);
      } else {
        console.log(`\nTotal: ${totalStale} stale entry/entries across ${results.length} .ctx file(s)`);
        process.exitCode = 1;
      }
    }
  });

function printDriftResult(result: { ctx_path: string; stale_entries: Array<{ section: string; entry_id: string; reason: string; details: string; verified_at: string }>; total_stale: number }) {
  if (result.total_stale === 0) {
    console.log(`✓ ${result.ctx_path} — no drift detected`);
    return;
  }

  console.log(`✗ ${result.ctx_path} — ${result.total_stale} stale entry/entries:`);
  for (const entry of result.stale_entries) {
    console.log(`  ${entry.section}/${entry.entry_id}`);
    console.log(`    Reason: ${entry.reason}`);
    console.log(`    Details: ${entry.details}`);
    console.log(`    Verified at: ${entry.verified_at}`);
  }
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}
