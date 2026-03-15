import { Command } from 'commander';
import { execSync } from 'node:child_process';

export const speckitCommand = new Command('speckit')
  .description('Spec-kit integration bridge');

function getRepoRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    console.error('Error: Not a git repository');
    process.exit(1);
    return '';
  }
}

speckitCommand
  .command('import')
  .description('Import spec-kit artifacts into .ctx files')
  .option('--constitution <path>', 'Path to constitution file', '.specify/memory/constitution.md')
  .option('--specs <dir>', 'Path to spec-kit specs directory', 'specs/')
  .option('--dry-run', 'Preview changes without writing')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const repoRoot = getRepoRoot();
      const { importConstitution, importSpecs } = await import('@ctxkit/speckit-bridge');

      let totalDecisions = 0;
      let totalContracts = 0;
      let totalGotchas = 0;
      const allFilesUpdated: string[] = [];

      // Import constitution
      const constResult = importConstitution(repoRoot, options.constitution, options.dryRun);
      totalDecisions += constResult.decisions;
      totalContracts += constResult.contracts;
      allFilesUpdated.push(...constResult.files_updated);

      // Import specs
      const specsResult = importSpecs(repoRoot, options.specs, options.dryRun);
      totalContracts += specsResult.contracts;
      totalGotchas += specsResult.gotchas;
      allFilesUpdated.push(...specsResult.files_updated);

      if (options.json) {
        console.log(JSON.stringify({
          imported: {
            decisions: totalDecisions,
            contracts: totalContracts,
            gotchas: totalGotchas,
          },
          files_updated: allFilesUpdated,
          dry_run: !!options.dryRun,
        }, null, 2));
      } else {
        console.log(`Import ${options.dryRun ? '(dry-run) ' : ''}complete:`);
        console.log(`  Decisions: ${totalDecisions}`);
        console.log(`  Contracts: ${totalContracts}`);
        console.log(`  Gotchas: ${totalGotchas}`);
        if (allFilesUpdated.length > 0) {
          console.log(`  Files updated: ${allFilesUpdated.join(', ')}`);
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

speckitCommand
  .command('export')
  .description('Export .ctx content to spec-kit format')
  .option('--output <dir>', 'Output directory for spec-kit files', 'specs/exported/')
  .option('--format <md|yaml>', 'Output format', 'md')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const repoRoot = getRepoRoot();
      const { exportToSpecKit } = await import('@ctxkit/speckit-bridge');

      const result = exportToSpecKit(repoRoot, options.output, options.format);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.exported_files.length === 0) {
          console.log('No .ctx files with exportable content found.');
        } else {
          console.log('Export complete:');
          for (const f of result.exported_files) {
            console.log(`  - ${f}`);
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

speckitCommand
  .command('validate')
  .description('Validate .ctx files against constitution')
  .option('--constitution <path>', 'Path to constitution file', '.specify/memory/constitution.md')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const repoRoot = getRepoRoot();
      const { validateConstitution } = await import('@ctxkit/speckit-bridge');

      const result = validateConstitution(repoRoot, options.constitution);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.valid) {
          console.log('All .ctx files are compliant with the constitution.');
        } else {
          console.log('Validation failed:');
          for (const v of result.violations) {
            console.log(`  [${v.severity}] ${v.ctx_path}: ${v.violation}`);
            console.log(`    Principle: ${v.principle}`);
          }
        }
      }

      if (!result.valid) {
        process.exit(1);
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

speckitCommand
  .command('sync')
  .description('Bidirectional sync between spec-kit and .ctx')
  .option('--dry-run', 'Preview changes without writing')
  .option('--force <direction>', 'Force sync direction (spec-to-ctx | ctx-to-spec)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const repoRoot = getRepoRoot();
      const { syncBidirectional } = await import('@ctxkit/speckit-bridge');

      const result = syncBidirectional(repoRoot, {
        dryRun: options.dryRun,
        forceDirection: options.force,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Sync ${options.dryRun ? '(dry-run) ' : ''}complete:`);
        console.log(`  Synced: ${result.synced}`);
        console.log(`  Conflicts: ${result.conflicts}`);
        if (result.files_updated.length > 0) {
          console.log(`  .ctx files updated: ${result.files_updated.join(', ')}`);
        }
        if (result.specs_updated.length > 0) {
          console.log(`  Spec files updated: ${result.specs_updated.join(', ')}`);
        }
        if (result.conflicts > 0) {
          console.log('\n  Conflicts detected. Use --force to resolve.');
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
