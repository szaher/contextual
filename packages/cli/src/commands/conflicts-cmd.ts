import { Command } from 'commander';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ConflictEntry } from '@ctxkit/core';
import { parseCtxFile, serializeCtxFile, resolveAllConflicts, extractConflicts } from '@ctxkit/core';

export const conflictsCommand = new Command('conflicts')
  .description('Manage merge conflicts in .ctx files');

conflictsCommand
  .command('list')
  .description('List all files with unresolved conflicts')
  .option('--repo-root <path>', 'Repository root', process.cwd())
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const files = findCtxFilesWithConflicts(options.repoRoot);

      if (options.json) {
        console.log(JSON.stringify({
          files: files.map((f) => ({
            path: f.path,
            conflict_count: f.conflicts.length,
            conflicts: f.conflicts.map((c) => ({
              section: c.section,
              key: c.key,
              ours_author: c.ours_author,
              theirs_author: c.theirs_author,
            })),
          })),
          total_conflicts: files.reduce((sum, f) => sum + f.conflicts.length, 0),
        }, null, 2));
      } else {
        if (files.length === 0) {
          console.log('No conflicts found.');
          return;
        }

        for (const file of files) {
          console.log(`\n${file.path} (${file.conflicts.length} conflict${file.conflicts.length !== 1 ? 's' : ''}):`);
          for (const c of file.conflicts) {
            console.log(`  - ${c.section}[${c.key}]: ${c.ours_author} vs ${c.theirs_author}`);
          }
        }
        const total = files.reduce((sum, f) => sum + f.conflicts.length, 0);
        console.log(`\nTotal: ${total} conflict${total !== 1 ? 's' : ''} in ${files.length} file${files.length !== 1 ? 's' : ''}`);
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

conflictsCommand
  .command('resolve <path>')
  .description('Resolve conflicts in a .ctx file')
  .option('--section <name>', 'Resolve only conflicts in this section')
  .option('--pick <choice>', 'Auto-pick one side: ours or theirs')
  .option('--json', 'Output as JSON')
  .action(async (ctxPath, options) => {
    try {
      const content = readFileSync(ctxPath, 'utf-8');
      const { ctx } = parseCtxFile(content);
      const conflicts = extractConflicts(ctx);

      if (conflicts.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ message: `No conflicts found in ${ctxPath}` }));
        } else {
          console.log(`No conflicts found in ${ctxPath}`);
        }
        return;
      }

      let filtered = conflicts;
      if (options.section) {
        filtered = conflicts.filter((c: ConflictEntry) => c.section === options.section);
      }

      if (options.pick === 'ours' || options.pick === 'theirs') {
        const choice = options.pick === 'ours' ? 'pick_ours' as const : 'pick_theirs' as const;
        const resolved = resolveAllConflicts(ctx, filtered, choice, 'developer:cli');
        writeFileSync(ctxPath, serializeCtxFile(resolved), 'utf-8');

        const remaining = conflicts.length - filtered.length;

        if (options.json) {
          console.log(JSON.stringify({
            resolved: filtered.length,
            remaining,
            new_version: resolved.version,
          }));
        } else {
          console.log(`Resolved ${filtered.length} conflict${filtered.length !== 1 ? 's' : ''} (picked ${options.pick})`);
          if (remaining > 0) {
            console.log(`${remaining} conflict${remaining !== 1 ? 's' : ''} remaining`);
          }
          console.log(`New version: ${resolved.version}`);
        }
      } else {
        // Show conflicts for manual resolution
        if (options.json) {
          console.log(JSON.stringify({
            conflicts: filtered.map((c: ConflictEntry) => ({
              section: c.section,
              key: c.key,
              ours: c.ours,
              theirs: c.theirs,
              ours_author: c.ours_author,
              theirs_author: c.theirs_author,
            })),
            total: filtered.length,
            hint: 'Use --pick ours|theirs to auto-resolve',
          }));
        } else {
          console.log(`Found ${filtered.length} conflict${filtered.length !== 1 ? 's' : ''}:\n`);
          for (const c of filtered) {
            console.log(`  Section: ${c.section}`);
            console.log(`  Key: ${c.key}`);
            console.log(`  Ours (${c.ours_author}): ${JSON.stringify(c.ours, null, 2)}`);
            console.log(`  Theirs (${c.theirs_author}): ${JSON.stringify(c.theirs, null, 2)}`);
            console.log('');
          }
          console.log('Use --pick ours|theirs to auto-resolve, or resolve manually.');
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

// --- Helpers ---

interface FileConflicts {
  path: string;
  conflicts: Array<{
    section: string;
    key: string;
    ours_author: string;
    theirs_author: string;
  }>;
}

function findCtxFilesWithConflicts(repoRoot: string): FileConflicts[] {
  const result: FileConflicts[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry === '.ctx') {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const { ctx } = parseCtxFile(content);
          const conflicts = extractConflicts(ctx);
          if (conflicts.length > 0) {
            result.push({
              path: relative(repoRoot, fullPath),
              conflicts: conflicts.map((c: ConflictEntry) => ({
                section: c.section,
                key: c.key,
                ours_author: c.ours_author,
                theirs_author: c.theirs_author,
              })),
            });
          }
        } catch {
          // Skip files that can't be parsed
        }
      }
    }
  }

  walk(repoRoot);
  return result;
}
