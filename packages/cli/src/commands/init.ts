import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { serializeCtxFile } from '@ctxl/core';
import type { CtxFile, KeyFile } from '@ctxl/core';

export const initCommand = new Command('init')
  .description('Initialize a .ctx file by scanning directory metadata')
  .option('--dir <path>', 'Target directory', process.cwd())
  .option('--force', 'Overwrite existing .ctx file', false)
  .action((options) => {
    const targetDir = resolve(options.dir);
    const ctxPath = join(targetDir, '.ctx');

    if (existsSync(ctxPath) && !options.force) {
      console.error(`Error: .ctx file already exists at ${ctxPath}`);
      console.error('Use --force to overwrite.');
      process.exitCode = 1;
      return;
    }

    const ctx = scanAndGenerate(targetDir);
    writeFileSync(ctxPath, serializeCtxFile(ctx), 'utf-8');

    console.log(`Created .ctx at ${ctxPath}`);
    console.log(`  Summary: ${ctx.summary}`);
    console.log(`  Key files: ${ctx.key_files.length}`);
    console.log(`  Commands: ${Object.keys(ctx.commands).length}`);
    console.log(`  Tags: ${ctx.tags.join(', ') || '(none)'}`);
  });

function scanAndGenerate(dir: string): CtxFile {
  const dirName = basename(dir);
  let summary = `Context for ${dirName}`;
  const keyFiles: KeyFile[] = [];
  const commands: Record<string, string> = {};
  const tags: string[] = [];

  // Scan package.json
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.description) {
        summary = pkg.description;
      } else if (pkg.name) {
        summary = `${pkg.name} project`;
      }
      keyFiles.push({
        path: 'package.json',
        purpose: 'Package manifest and dependency definitions',
        tags: ['config'],
        verified_at: new Date().toISOString().split('T')[0],
        locked: false,
        owner: null,
      });
      // Extract scripts as commands
      if (pkg.scripts && typeof pkg.scripts === 'object') {
        for (const [name, script] of Object.entries(pkg.scripts)) {
          if (typeof script === 'string') {
            commands[name] = script;
          }
        }
      }
      // Extract tags from keywords
      if (Array.isArray(pkg.keywords)) {
        tags.push(...pkg.keywords.map(String));
      }
      // Detect tech stack
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps.typescript) tags.push('typescript');
      if (allDeps.react) tags.push('react');
      if (allDeps.vue) tags.push('vue');
      if (allDeps.express || allDeps.hono || allDeps.fastify) tags.push('api');
      if (allDeps.vitest || allDeps.jest || allDeps.mocha) tags.push('testing');
    } catch {
      // Ignore parse errors
    }
  }

  // Scan tsconfig.json
  const tsconfigPath = join(dir, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    keyFiles.push({
      path: 'tsconfig.json',
      purpose: 'TypeScript compiler configuration',
      tags: ['config', 'typescript'],
      verified_at: new Date().toISOString().split('T')[0],
      locked: false,
      owner: null,
    });
    if (!tags.includes('typescript')) {
      tags.push('typescript');
    }
  }

  // Scan README
  const readmeNames = ['README.md', 'README', 'readme.md'];
  for (const name of readmeNames) {
    const readmePath = join(dir, name);
    if (existsSync(readmePath)) {
      keyFiles.push({
        path: name,
        purpose: 'Project documentation and overview',
        tags: ['docs'],
        verified_at: new Date().toISOString().split('T')[0],
        locked: false,
        owner: null,
      });
      // Try to extract a better summary from first line of README
      try {
        const content = readFileSync(readmePath, 'utf-8');
        const firstLine = content.split('\n').find(
          (l: string) => l.trim() && !l.startsWith('#') && !l.startsWith('!')
        );
        if (firstLine && firstLine.trim().length > 10) {
          summary = firstLine.trim().slice(0, 200);
        }
      } catch {
        // Ignore
      }
      break;
    }
  }

  // Scan common entry points
  const entryPoints = [
    { file: 'src/index.ts', purpose: 'Main entry point' },
    { file: 'src/index.js', purpose: 'Main entry point' },
    { file: 'src/main.ts', purpose: 'Application entry point' },
    { file: 'src/main.tsx', purpose: 'Application entry point' },
    { file: 'src/app.ts', purpose: 'Application setup' },
    { file: 'index.ts', purpose: 'Main entry point' },
    { file: 'index.js', purpose: 'Main entry point' },
  ];
  for (const entry of entryPoints) {
    if (existsSync(join(dir, entry.file))) {
      keyFiles.push({
        path: entry.file,
        purpose: entry.purpose,
        tags: ['entry'],
        verified_at: new Date().toISOString().split('T')[0],
        locked: false,
        owner: null,
      });
      break; // Only add the first found entry point
    }
  }

  return {
    version: 1,
    summary,
    key_files: keyFiles,
    contracts: [],
    decisions: [],
    commands,
    gotchas: [],
    tags: [...new Set(tags)],
    refs: [],
    ignore: { never_read: [], never_log: [] },
  };
}
