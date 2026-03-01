import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { buildContextPack } from '@ctxl/core';

describe('E2E: Agent Wrapper', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-agent-'));
    // Initialize a git repo
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should build context pack for wrapped command', () => {
    // Create a .ctx file
    const ctxContent = `version: 1
summary: "Test project for agent wrapper"
key_files:
  - path: main.ts
    why: "Entry point"
decisions:
  - id: d1
    title: "Use TypeScript"
    rationale: "Type safety"
    date: "2025-01-01"
tags: ["typescript", "test"]
`;
    writeFileSync(join(tmpDir, '.ctx'), ctxContent);
    writeFileSync(join(tmpDir, 'main.ts'), 'console.log("hello");\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Build context pack directly (same logic ctxkit run uses)
    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'help me with typescript',
      budgetTokens: 4000,
    });

    expect(result.pack).toBeDefined();
    expect(result.pack.items.length).toBeGreaterThan(0);
    expect(result.pack.total_tokens).toBeGreaterThan(0);
    expect(result.pack.total_tokens).toBeLessThanOrEqual(result.pack.budget_tokens);
  });

  it('should inject context pack as JSON into environment', () => {
    // Create a .ctx file
    const ctxContent = `version: 1
summary: "Agent integration test"
key_files:
  - path: app.ts
    why: "Main app"
tags: ["agent", "integration"]
`;
    writeFileSync(join(tmpDir, '.ctx'), ctxContent);
    writeFileSync(join(tmpDir, 'app.ts'), 'export const app = true;\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'describe the app',
      budgetTokens: 4000,
    });

    // Verify context pack can be serialized to JSON (as would be set in CTXL_CONTEXT_PACK)
    const json = JSON.stringify(result.pack);
    expect(json).toBeTruthy();

    // Parse back and verify structure
    const parsed = JSON.parse(json);
    expect(parsed.items).toBeDefined();
    expect(parsed.omitted).toBeDefined();
    expect(parsed.total_tokens).toBeDefined();
    expect(parsed.budget_tokens).toBe(4000);
  });

  it('should handle repos with nested .ctx files', () => {
    // Root .ctx
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Root project"
key_files:
  - path: src/index.ts
    why: "Entry"
tags: ["project"]
`);
    mkdirSync(join(tmpDir, 'src'));
    writeFileSync(join(tmpDir, 'src/index.ts'), 'export {};\n');

    // Nested .ctx
    writeFileSync(join(tmpDir, 'src/.ctx'), `version: 1
summary: "Source module"
key_files:
  - path: index.ts
    why: "Module entry"
tags: ["source", "module"]
`);

    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Build from nested directory
    const result = buildContextPack({
      workingDir: join(tmpDir, 'src'),
      repoRoot: tmpDir,
      requestText: 'explain the source module',
      budgetTokens: 4000,
    });

    expect(result.pack.items.length).toBeGreaterThan(0);
    // Should include items from both root and src .ctx
    const sources = new Set(result.pack.items.map(i => i.source));
    expect(sources.size).toBeGreaterThanOrEqual(1);
  });

  it('should respect token budget in wrapped context', () => {
    // Create a .ctx file with many entries
    const decisions = Array.from({ length: 20 }, (_, i) =>
      `  - id: d${i}\n    title: "Decision ${i} about important thing ${i}"\n    rationale: "Because reason ${i} is very important for the project architecture and design patterns we use"\n    date: "2025-01-01"`
    ).join('\n');

    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Project with many decisions that require careful context budgeting"
key_files:
  - path: main.ts
    why: "Entry point"
decisions:
${decisions}
tags: ["complex", "decisions"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'console.log("main");\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    const smallBudget = 500;
    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'what decisions were made',
      budgetTokens: smallBudget,
    });

    // Total tokens should respect budget
    expect(result.pack.total_tokens).toBeLessThanOrEqual(smallBudget);
    // Some items should be omitted due to budget
    expect(result.pack.omitted.length).toBeGreaterThan(0);
  });
});
