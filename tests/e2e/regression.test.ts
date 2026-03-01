import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { buildContextPack } from '@ctxl/core';
import { recordSession, replaySession, compareContextPacks } from './harness';

describe('E2E: Regression Harness', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-regression-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should produce deterministic context packs for identical inputs', () => {
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Regression test project"
key_files:
  - path: src/main.ts
    why: "Entry point"
  - path: src/utils.ts
    why: "Utilities"
decisions:
  - id: d1
    title: "Use TypeScript"
    rationale: "Type safety"
    date: "2025-01-01"
tags: ["typescript", "regression"]
`);
    mkdirSync(join(tmpDir, 'src'));
    writeFileSync(join(tmpDir, 'src/main.ts'), 'export const main = true;\n');
    writeFileSync(join(tmpDir, 'src/utils.ts'), 'export const utils = true;\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Build context pack twice with identical inputs
    const result1 = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain the project',
      budgetTokens: 4000,
    });

    const result2 = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain the project',
      budgetTokens: 4000,
    });

    // Verify determinism: identical inputs produce identical outputs
    expect(result1.pack.items.length).toBe(result2.pack.items.length);
    expect(result1.pack.total_tokens).toBe(result2.pack.total_tokens);

    for (let i = 0; i < result1.pack.items.length; i++) {
      expect(result1.pack.items[i].entry_id).toBe(result2.pack.items[i].entry_id);
      expect(result1.pack.items[i].score).toBe(result2.pack.items[i].score);
    }

    // Compare using harness utility
    const mismatches = compareContextPacks(result1.pack, result2.pack);
    expect(mismatches).toHaveLength(0);
  });

  it('should record and replay sessions with identical results', () => {
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Session replay test"
key_files:
  - path: app.ts
    why: "Application"
tags: ["replay", "test"]
`);
    writeFileSync(join(tmpDir, 'app.ts'), 'export const app = true;\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Record a session
    const session = recordSession(tmpDir, tmpDir, [
      { request_text: 'describe the app', budget_tokens: 4000 },
      { request_text: 'how does it work', budget_tokens: 2000 },
    ]);

    expect(session.requests).toHaveLength(2);
    expect(session.requests[0].expected_pack).toBeDefined();
    expect(session.requests[1].expected_pack).toBeDefined();

    // Replay the session
    const report = replaySession(session);

    expect(report.total).toBe(2);
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(0);

    for (const result of report.results) {
      expect(result.passed).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    }
  });

  it('should detect mismatches when golden fixture differs', () => {
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Golden fixture test"
key_files:
  - path: main.ts
    why: "Entry"
tags: ["golden"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'console.log("hello");\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Build actual pack
    const actual = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain the code',
      budgetTokens: 4000,
    });

    // Create a "golden" fixture with deliberately different values
    const goldenPack = {
      ...actual.pack,
      items: actual.pack.items.map((item, i) => ({
        ...item,
        entry_id: i === 0 ? 'DIFFERENT_ID' : item.entry_id,
      })),
    };

    const mismatches = compareContextPacks(goldenPack, actual.pack);
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.some(m => m.includes('entry_id mismatch'))).toBe(true);
  });

  it('should verify budget adherence across replays', () => {
    // Create .ctx with many entries to test budget limits
    const decisions = Array.from({ length: 15 }, (_, i) =>
      `  - id: d${i}\n    title: "Decision ${i} about architecture"\n    rationale: "Important reason ${i}"\n    date: "2025-01-01"`
    ).join('\n');

    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Budget adherence test with many entries"
key_files:
  - path: main.ts
    why: "Entry"
decisions:
${decisions}
tags: ["budget", "test"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Test with various budgets
    const budgets = [500, 1000, 2000, 4000];
    for (const budget of budgets) {
      const result = buildContextPack({
        workingDir: tmpDir,
        repoRoot: tmpDir,
        requestText: 'what decisions were made',
        budgetTokens: budget,
      });

      expect(result.pack.total_tokens).toBeLessThanOrEqual(budget);
      expect(result.pack.budget_tokens).toBe(budget);

      // With tight budget, verify we stay within limits
      // Some items may be omitted depending on content size
      if (result.pack.omitted.length > 0) {
        // If items were omitted, total included should be less than total entries
        expect(result.pack.items.length).toBeLessThan(17); // 15 decisions + summary + key_file
      }
    }
  });
});
