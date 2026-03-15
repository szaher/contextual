import { Command } from 'commander';
import type { BootstrapProposal } from '@ctxkit/core';
import { analyzeDirectories, generateProposals, applyProposals } from '@ctxkit/core';
import { execSync } from 'node:child_process';

export const bootstrapCommand = new Command('bootstrap')
  .description('Bootstrap .ctx files for directories')
  .argument('[path]', 'Target path (default: repo root)')
  .option('--mode <mode>', 'Analysis mode: quick or full', 'quick')
  .option('--dry-run', 'Show what would be generated without writing')
  .option('--skip-existing', 'Skip directories that already have .ctx files', true)
  .option('--min-files <n>', 'Minimum files in directory to qualify', '3')
  .option('--json', 'Output as JSON')
  .action(async (targetPath, options) => {
    try {
      // Detect repo root
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
      }

      const minFiles = parseInt(options.minFiles, 10);
      const mode = options.mode as 'quick' | 'full';

      // Analyze directories
      const results = analyzeDirectories(repoRoot, {
        mode,
        skipExisting: options.skipExisting,
        minFiles,
        targetPath,
      });

      if (results.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ proposals: [], skipped: [], message: 'No qualifying directories found' }));
        } else {
          console.log('No qualifying directories found.');
        }
        return;
      }

      // Generate proposals
      const proposals = generateProposals(results);

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({
            proposals: proposals.map((p: BootstrapProposal) => ({
              path: p.path,
              summary: p.summary,
              key_files: p.key_files,
              tags: p.tags,
              commands: p.commands,
              language: p.language,
              framework: p.framework,
              token_estimate: p.token_estimate,
            })),
            dry_run: true,
          }, null, 2));
        } else {
          console.log(`Found ${proposals.length} directories to bootstrap (dry run):\n`);
          for (const p of proposals) {
            console.log(`  ${p.path}`);
            console.log(`    Summary: ${p.summary}`);
            console.log(`    Language: ${p.language}${p.framework ? ` (${p.framework})` : ''}`);
            console.log(`    Key files: ${p.key_files.length}`);
            console.log(`    Tags: ${p.tags.join(', ')}`);
            console.log(`    Tokens: ~${p.token_estimate}`);
            console.log('');
          }
        }
        return;
      }

      // Apply proposals
      const written = applyProposals(repoRoot, proposals);

      if (options.json) {
        console.log(JSON.stringify({
          written,
          count: written.length,
          index_updated: false,
        }, null, 2));
      } else {
        console.log(`Bootstrapped ${written.length} .ctx files:`);
        for (const path of written) {
          console.log(`  - ${path}`);
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
