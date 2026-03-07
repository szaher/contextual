import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  buildContextPack,
  parseCtxFile,
  validateCtxFile,
  generateDiff,
  detectDrift,
  loadProfile,
} from '@ctxl/core';

describe('E2E: Final Validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-final-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('SC-001: context packs are deterministic for identical inputs', () => {
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Determinism test"
key_files:
  - path: main.ts
    why: "Entry"
  - path: utils.ts
    why: "Utilities"
decisions:
  - id: d1
    title: "Use TypeScript"
    rationale: "Type safety"
    date: "2025-01-01"
tags: ["typescript"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    writeFileSync(join(tmpDir, 'utils.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    const pack1 = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain',
      budgetTokens: 4000,
    });

    const pack2 = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain',
      budgetTokens: 4000,
    });

    // Identical inputs = identical outputs
    expect(JSON.stringify(pack1.pack)).toBe(JSON.stringify(pack2.pack));
  });

  it('SC-002: budget adherence across various budgets', () => {
    const decisions = Array.from({ length: 30 }, (_, i) =>
      `  - id: d${i}\n    title: "Decision ${i} with long description"\n    rationale: "Detailed rationale for decision ${i} which explains the reasoning"\n    date: "2025-01-01"`
    ).join('\n');

    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Budget test"
key_files:
  - path: main.ts
    why: "Entry"
decisions:
${decisions}
tags: ["test"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    for (const budget of [200, 500, 1000, 2000, 4000, 8000]) {
      const result = buildContextPack({
        workingDir: tmpDir,
        repoRoot: tmpDir,
        requestText: 'explain decisions',
        budgetTokens: budget,
      });
      expect(result.pack.total_tokens).toBeLessThanOrEqual(budget);
    }
  });

  it('SC-007: no silent rewrites of user-authored .ctx content', () => {
    const originalContent = `version: 1
summary: "User-authored content"
key_files:
  - path: main.ts
    why: "My carefully written description"
decisions:
  - id: d1
    title: "My decision"
    rationale: "My reasoning"
    date: "2025-01-01"
tags: ["custom"]
`;
    writeFileSync(join(tmpDir, '.ctx'), originalContent);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Building context pack should NOT modify the .ctx file
    buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain',
      budgetTokens: 4000,
    });

    const afterContent = readFileSync(join(tmpDir, '.ctx'), 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  it('T090: end-to-end quickstart scenario', () => {
    // Step 1: Create project structure
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    mkdirSync(join(tmpDir, 'src/auth'), { recursive: true });
    writeFileSync(join(tmpDir, 'src/index.ts'), 'export const app = true;\n');
    writeFileSync(join(tmpDir, 'src/auth/handler.ts'), 'export const auth = true;\n');

    // Step 2: Create .ctx (equivalent to ctxkit init)
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Sample project for end-to-end testing"
key_files:
  - path: src/index.ts
    why: "Main entry point"
  - path: src/auth/handler.ts
    why: "Auth handler"
contracts:
  - name: auth-security
    content: "All auth must use bcrypt"
    scope:
      paths:
        - "src/auth/*"
      tags:
        - security
        - auth
decisions:
  - id: d1
    title: "Use TypeScript"
    rationale: "Type safety"
    date: "2025-01-01"
tags: ["typescript", "auth", "security"]
`);
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Step 3: Validate .ctx
    const ctxContent = readFileSync(join(tmpDir, '.ctx'), 'utf-8');
    const { ctx: parsed } = parseCtxFile(ctxContent);
    const allIssues = validateCtxFile(parsed);
    // Only check for hard errors, not warnings (e.g., missing purpose field)
    const errors = allIssues.filter(e => e.severity === 'error');
    expect(errors).toHaveLength(0);

    // Step 4: Build context pack (inject preview)
    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'update auth security',
      budgetTokens: 4000,
    });
    expect(result.pack.items.length).toBeGreaterThan(0);
    expect(result.pack.total_tokens).toBeLessThanOrEqual(4000);

    // Step 5: Verify contract included
    const contractItem = result.pack.items.find(i => i.section === 'contracts');
    expect(contractItem).toBeDefined();

    // Step 6: Check drift
    const driftResult = detectDrift(join(tmpDir, '.ctx'), tmpDir);
    expect(driftResult).toBeDefined();

    // Step 7: Generate diff proposal
    const newContent = ctxContent.replace('Type safety', 'Type safety and runtime validation');
    const diff = generateDiff(ctxContent, newContent, '.ctx');
    expect(diff.hasChanges).toBe(true);
    expect(diff.diff).toContain('runtime validation');

    // Step 8: Verify profile loading
    const profile = loadProfile(tmpDir);
    expect(profile.budget.default_tokens).toBe(4000);
  });

  it('SC-009: operations safety checks', () => {
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Operations test"
tags: ["ops"]
`);
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Context pack assembly should handle edge cases gracefully
    // Empty request
    const emptyResult = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: '',
      budgetTokens: 4000,
    });
    expect(emptyResult.pack).toBeDefined();

    // Very small budget
    const tinyResult = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'test',
      budgetTokens: 1,
    });
    expect(tinyResult.pack).toBeDefined();
    expect(tinyResult.pack.budget_tokens).toBe(1);

    // Non-existent working directory shouldn't crash
    // (merger will just find no .ctx files)
    const noCtxResult = buildContextPack({
      workingDir: join(tmpDir, 'nonexistent'),
      repoRoot: tmpDir,
      requestText: 'test',
      budgetTokens: 4000,
    });
    expect(noCtxResult.pack).toBeDefined();
  });
});
