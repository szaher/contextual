import { Command } from 'commander';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { parseCtxFile, serializeCtxFile, computeChecksum, generateIndex, writeIndex } from '@ctxkit/core';

export const migrateCommand = new Command('migrate')
  .description('Migrate v1 repository to v2')
  .option('--dry-run', 'Preview changes without writing')
  .option('--json', 'Output as JSON')
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

      const ctxFiles = findCtxFiles(repoRoot);

      if (ctxFiles.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ message: 'No .ctx files found to migrate' }));
        } else {
          console.log('No .ctx files found to migrate.');
        }
        return;
      }

      const results: Array<{
        path: string;
        version: number;
        migrated: boolean;
        checksum?: string;
      }> = [];

      for (const ctxPath of ctxFiles) {
        const content = readFileSync(ctxPath, 'utf-8');
        const { ctx } = parseCtxFile(content);
        const relPath = relative(repoRoot, ctxPath);

        // v1→v2 migration: keep version as 1, initialize _history, compute checksum
        if (!ctx._history) {
          const checksum = computeChecksum(ctx);

          if (!options.dryRun) {
            const migrated = {
              ...ctx,
              _history: [],
            };
            writeFileSync(ctxPath, serializeCtxFile(migrated), 'utf-8');
          }

          results.push({
            path: relPath,
            version: ctx.version,
            migrated: true,
            checksum,
          });
        } else {
          results.push({
            path: relPath,
            version: ctx.version,
            migrated: false,
          });
        }
      }

      // Generate .ctxl index
      if (!options.dryRun) {
        const index = generateIndex(repoRoot);
        writeIndex(repoRoot, index);
      }

      const migratedCount = results.filter((r) => r.migrated).length;

      if (options.json) {
        console.log(JSON.stringify({
          files_processed: results.length,
          files_migrated: migratedCount,
          files_already_v2: results.length - migratedCount,
          index_generated: !options.dryRun,
          dry_run: !!options.dryRun,
          details: results,
        }, null, 2));
      } else {
        console.log(`Migration ${options.dryRun ? '(dry-run) ' : ''}complete:`);
        console.log(`  Files processed: ${results.length}`);
        console.log(`  Files migrated: ${migratedCount}`);
        console.log(`  Already v2: ${results.length - migratedCount}`);
        if (!options.dryRun) {
          console.log('  .ctxl index: generated');
        }
        if (migratedCount > 0) {
          console.log('\nMigrated files:');
          for (const r of results.filter((r) => r.migrated)) {
            console.log(`  - ${r.path} (v${r.version})`);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({ error: message }));
      } else {
        console.error(`Error: ${message}`);
      }
      process.exit(1);
    }
  });

function findCtxFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(d: string): void {
    try {
      const entries = readdirSync(d);
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') continue;
        const fullPath = join(d, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) walk(fullPath);
          else if (entry === '.ctx') files.push(fullPath);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walk(dir);
  return files;
}
