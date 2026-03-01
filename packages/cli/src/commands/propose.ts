import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseCtxFile } from '@ctxl/core';
import type { KeyFile, Contract, Decision } from '@ctxl/core';

export const proposeCommand = new Command('propose')
  .description('Generate a .ctx update proposal showing what would change')
  .argument('<ctx-path>', 'Path to .ctx file to analyze')
  .option('--check-files', 'Check for dead file references', false)
  .option('--daemon <url>', 'Daemon URL to submit proposal', 'http://localhost:3742')
  .option('--json', 'Output as JSON', false)
  .action(async (ctxPathArg: string, options) => {
    const ctxPath = resolve(ctxPathArg);

    if (!existsSync(ctxPath)) {
      console.error(`Error: .ctx file not found at ${ctxPath}`);
      process.exitCode = 1;
      return;
    }

    const content = readFileSync(ctxPath, 'utf-8');
    const ctx = parseCtxFile(content);
    const ctxDir = dirname(ctxPath);

    if (options.json) {
      const result: Record<string, unknown> = {
        path: ctxPath,
        version: ctx.version,
        summary: ctx.summary,
        key_files: ctx.key_files.length,
        contracts: ctx.contracts.length,
        decisions: ctx.decisions.length,
        gotchas: ctx.gotchas.length,
        tags: ctx.tags,
        refs: ctx.refs.length,
      };

      if (options.checkFiles) {
        const deadRefs: Array<{ type: string; path: string }> = [];
        for (const kf of ctx.key_files) {
          if (!existsSync(resolve(ctxDir, kf.path))) {
            deadRefs.push({ type: 'key_file', path: kf.path });
          }
        }
        for (const ref of ctx.refs) {
          if (!existsSync(resolve(ctxDir, ref.target))) {
            deadRefs.push({ type: 'ref', path: ref.target });
          }
        }
        result.dead_references = deadRefs;
      }

      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Analyzing ${ctxPath}...\n`);

    // Check for dead references
    if (options.checkFiles) {
      let deadCount = 0;
      for (const kf of ctx.key_files) {
        const absPath = resolve(ctxDir, kf.path);
        if (!existsSync(absPath)) {
          console.log(`  ✗ Dead reference: key_files/${kf.path}`);
          console.log(`    File not found at ${absPath}`);
          deadCount++;
        }
      }

      for (const ref of ctx.refs) {
        const absTarget = resolve(ctxDir, ref.target);
        if (!existsSync(absTarget)) {
          console.log(`  ✗ Dead reference: refs/${ref.target}`);
          console.log(`    Target not found at ${absTarget}`);
          deadCount++;
        }
      }

      if (deadCount === 0) {
        console.log('  ✓ No dead references found');
      } else {
        console.log(`\n  Found ${deadCount} dead reference(s)`);
      }
    }

    // Show summary stats
    console.log('\n.ctx Summary:');
    console.log(`  Version: ${ctx.version}`);
    console.log(`  Key files: ${ctx.key_files.length}`);
    console.log(`  Contracts: ${ctx.contracts.length}`);
    console.log(`  Decisions: ${ctx.decisions.length}`);
    console.log(`  Gotchas: ${ctx.gotchas.length}`);
    console.log(`  Tags: ${ctx.tags.join(', ') || '(none)'}`);
    console.log(`  Refs: ${ctx.refs.length}`);

    // Show locked entries
    const lockedFiles = ctx.key_files.filter((kf: KeyFile) => kf.locked);
    const lockedContracts = ctx.contracts.filter((c: Contract) => c.locked);
    const lockedDecisions = ctx.decisions.filter((d: Decision) => d.locked);
    const totalLocked = lockedFiles.length + lockedContracts.length + lockedDecisions.length;
    if (totalLocked > 0) {
      console.log(`\n  Locked entries (${totalLocked}):`);
      for (const kf of lockedFiles) {
        console.log(`    🔒 key_files/${kf.path}${kf.owner ? ` (owner: ${kf.owner})` : ''}`);
      }
      for (const c of lockedContracts) {
        console.log(`    🔒 contracts/${c.name}${c.owner ? ` (owner: ${c.owner})` : ''}`);
      }
      for (const d of lockedDecisions) {
        console.log(`    🔒 decisions/${d.id}${d.owner ? ` (owner: ${d.owner})` : ''}`);
      }
    }

    console.log();
  });
