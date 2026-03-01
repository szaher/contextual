import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { buildContextPack } from '@ctxl/core';

describe('E2E: Performance', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-perf-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should assemble context pack from 100 .ctx files within 500ms', () => {
    // Create 100 directories with .ctx files
    for (let i = 0; i < 100; i++) {
      const dir = join(tmpDir, `dir${String(i).padStart(3, '0')}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, '.ctx'), `version: 1
summary: "Module ${i} for performance testing"
key_files:
  - path: index.ts
    why: "Module ${i} entry point"
decisions:
  - id: d${i}
    title: "Decision for module ${i}"
    rationale: "Performance test decision ${i}"
    date: "2025-01-01"
tags: ["module${i}", "perf"]
`);
      writeFileSync(join(dir, 'index.ts'), `export const module${i} = true;\n`);
    }

    // Create root .ctx
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Root performance test project with 100 modules"
key_files:
  - path: main.ts
    why: "Root entry"
tags: ["root", "perf"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Measure context pack assembly time from a deep directory
    const deepDir = join(tmpDir, 'dir050');
    const start = performance.now();

    const result = buildContextPack({
      workingDir: deepDir,
      repoRoot: tmpDir,
      requestText: 'explain the modules',
      budgetTokens: 4000,
    });

    const elapsed = performance.now() - start;

    // Should complete within 500ms
    expect(elapsed).toBeLessThan(500);
    expect(result.pack).toBeDefined();
    expect(result.pack.items.length).toBeGreaterThan(0);
  });

  it('should handle large .ctx files efficiently', () => {
    // Create a .ctx with many entries
    const keyFiles = Array.from({ length: 50 }, (_, i) =>
      `  - path: src/file${i}.ts\n    why: "File ${i} for performance testing with detailed description"`
    ).join('\n');

    const decisions = Array.from({ length: 50 }, (_, i) =>
      `  - id: d${i}\n    title: "Decision ${i} about performance"\n    rationale: "Detailed rationale for decision ${i}"\n    date: "2025-01-01"`
    ).join('\n');

    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Large .ctx performance test"
key_files:
${keyFiles}
decisions:
${decisions}
tags: ["large", "performance", "test"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    const start = performance.now();

    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain the architecture decisions',
      budgetTokens: 4000,
    });

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(result.pack.items.length).toBeGreaterThan(0);
  });
});
