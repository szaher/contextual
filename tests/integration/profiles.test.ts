import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { loadProfile } from '@ctxl/core';
import { buildContextPack } from '@ctxl/core';

describe('Integration: Workspace Profiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-profiles-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should use default profile when no config exists', () => {
    const profile = loadProfile(tmpDir);
    expect(profile.budget.default_tokens).toBe(4000);
    expect(profile.scoring.mode).toBe('lexical');
    expect(profile.sources).toContain('defaults');
  });

  it('should load workspace profile from .ctxl/config.yaml', () => {
    mkdirSync(join(tmpDir, '.ctxl'), { recursive: true });
    writeFileSync(join(tmpDir, '.ctxl/config.yaml'), `
version: 1
budget:
  default_tokens: 8000
scoring:
  mode: hybrid
retention:
  sessions_days: 60
  audit_days: 120
`);

    const profile = loadProfile(tmpDir);
    expect(profile.budget.default_tokens).toBe(8000);
    expect(profile.scoring.mode).toBe('hybrid');
    expect(profile.retention.sessions_days).toBe(60);
    expect(profile.retention.audit_days).toBe(120);
  });

  it('should apply per-request overrides over workspace config', () => {
    mkdirSync(join(tmpDir, '.ctxl'), { recursive: true });
    writeFileSync(join(tmpDir, '.ctxl/config.yaml'), `
version: 1
budget:
  default_tokens: 8000
`);

    const profile = loadProfile(tmpDir, { budgetTokens: 2000 });
    expect(profile.budget.default_tokens).toBe(2000);
  });

  it('should apply agent-specific config overrides', () => {
    mkdirSync(join(tmpDir, '.ctxl'), { recursive: true });
    writeFileSync(join(tmpDir, '.ctxl/config.yaml'), `
version: 1
budget:
  default_tokens: 4000
agents:
  claude:
    budget_tokens: 12000
    mode: hybrid
  copilot:
    budget_tokens: 6000
    mode: lexical
`);

    const claudeProfile = loadProfile(tmpDir, { agentId: 'claude' });
    expect(claudeProfile.budget.default_tokens).toBe(12000);
    expect(claudeProfile.scoring.mode).toBe('hybrid');

    const copilotProfile = loadProfile(tmpDir, { agentId: 'copilot' });
    expect(copilotProfile.budget.default_tokens).toBe(6000);
    expect(copilotProfile.scoring.mode).toBe('lexical');
  });

  it('should merge ignore policies from workspace config', () => {
    mkdirSync(join(tmpDir, '.ctxl'), { recursive: true });
    writeFileSync(join(tmpDir, '.ctxl/config.yaml'), `
version: 1
ignore:
  never_read:
    - "vendor/*"
    - "node_modules/*"
  never_log:
    - "*.env"
    - "secrets/*"
`);

    const profile = loadProfile(tmpDir);
    expect(profile.ignore.never_read).toContain('vendor/*');
    expect(profile.ignore.never_read).toContain('node_modules/*');
    expect(profile.ignore.never_log).toContain('*.env');
    expect(profile.ignore.never_log).toContain('secrets/*');
  });

  it('should respect different budgets in context pack assembly', () => {
    // Create .ctx with several entries
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Profile budget test"
key_files:
  - path: main.ts
    why: "Entry point"
  - path: utils.ts
    why: "Utilities"
  - path: config.ts
    why: "Configuration"
decisions:
  - id: d1
    title: "Use TypeScript"
    rationale: "Type safety"
    date: "2025-01-01"
  - id: d2
    title: "Use ESM"
    rationale: "Modern modules"
    date: "2025-01-01"
tags: ["test"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    writeFileSync(join(tmpDir, 'utils.ts'), 'export {};\n');
    writeFileSync(join(tmpDir, 'config.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Low budget
    const lowResult = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain the project',
      budgetTokens: 2000,
    });

    // High budget
    const highResult = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain the project',
      budgetTokens: 8000,
    });

    // Both should respect their budgets
    expect(lowResult.pack.total_tokens).toBeLessThanOrEqual(2000);
    expect(highResult.pack.total_tokens).toBeLessThanOrEqual(8000);
    expect(lowResult.pack.budget_tokens).toBe(2000);
    expect(highResult.pack.budget_tokens).toBe(8000);
  });
});
