import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { parseCtxFile, validateCtxFile } from '@ctxl/core';
import type { ValidationError } from '@ctxl/core';

export const validateCommand = new Command('validate')
  .description('Validate a .ctx file for structural correctness')
  .argument('[path]', 'Path to .ctx file or directory containing one', '.')
  .option('--check-files', 'Verify referenced files exist on disk', false)
  .action((pathArg, options) => {
    const targetPath = resolve(pathArg);
    const ctxPath = targetPath.endsWith('.ctx')
      ? targetPath
      : join(targetPath, '.ctx');

    if (!existsSync(ctxPath)) {
      console.error(`Error: No .ctx file found at ${ctxPath}`);
      process.exitCode = 1;
      return;
    }

    let content: string;
    try {
      content = readFileSync(ctxPath, 'utf-8');
    } catch (err) {
      console.error(`Error reading ${ctxPath}: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    let ctx;
    try {
      ctx = parseCtxFile(content);
    } catch (err) {
      console.error(`Parse error: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    const errors = validateCtxFile(ctx);

    // Check referenced files exist
    if (options.checkFiles) {
      const ctxDir = dirname(ctxPath);
      for (const kf of ctx.key_files) {
        if (kf.path && !existsSync(join(ctxDir, kf.path))) {
          errors.push({
            path: `key_files: ${kf.path}`,
            message: `Referenced file does not exist: ${kf.path}`,
            severity: 'warning',
          });
        }
      }
    }

    // Output results
    const errorCount = errors.filter((e: ValidationError) => e.severity === 'error').length;
    const warningCount = errors.filter((e: ValidationError) => e.severity === 'warning').length;

    if (errors.length === 0) {
      console.log(`✓ ${ctxPath} is valid`);
      return;
    }

    console.log(`Validation results for ${ctxPath}:\n`);

    for (const err of errors) {
      const prefix = err.severity === 'error' ? '✗ ERROR' : '⚠ WARN ';
      console.log(`  ${prefix}  ${err.path}: ${err.message}`);
    }

    console.log();
    console.log(`  ${errorCount} error(s), ${warningCount} warning(s)`);

    if (errorCount > 0) {
      process.exitCode = 1;
    }
  });
