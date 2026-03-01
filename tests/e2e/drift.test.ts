import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { detectDrift, scanForDeadReferences } from '@ctxl/core';

describe('E2E: Drift Detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-drift-test-'));
    // Initialize git repo
    execSync('git init', { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect deleted files as stale', () => {
    // Create files and commit
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src/handler.ts'), 'export function handle() {}');
    writeFileSync(join(tmpDir, 'src/utils.ts'), 'export function util() {}');
    execSync('git add -A && git commit -m "initial"', { cwd: tmpDir });

    const commitHash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    // Create .ctx referencing the files
    writeFileSync(join(tmpDir, '.ctx'), `
version: 1
summary: Test project
key_files:
  - path: src/handler.ts
    purpose: Request handler
    tags: [api]
    verified_at: "${commitHash}"
    locked: false
  - path: src/utils.ts
    purpose: Utilities
    tags: [utils]
    verified_at: "${commitHash}"
    locked: false
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [test]
refs: []
ignore:
  never_read: []
  never_log: []
`);

    // Delete one file and commit
    unlinkSync(join(tmpDir, 'src/utils.ts'));
    execSync('git add -A && git commit -m "remove utils"', { cwd: tmpDir });

    // Check drift
    const result = detectDrift(join(tmpDir, '.ctx'), tmpDir);

    expect(result.total_stale).toBeGreaterThanOrEqual(1);
    const deletedEntry = result.stale_entries.find(
      (e) => e.entry_id === 'src/utils.ts',
    );
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry!.reason).toBe('file_deleted');
  });

  it('should detect modified files as stale', () => {
    // Create files and commit
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src/handler.ts'), 'export function handle() {}');
    execSync('git add -A && git commit -m "initial"', { cwd: tmpDir });

    const commitHash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    // Create .ctx
    writeFileSync(join(tmpDir, '.ctx'), `
version: 1
summary: Test project
key_files:
  - path: src/handler.ts
    purpose: Request handler
    tags: [api]
    verified_at: "${commitHash}"
    locked: false
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [test]
refs: []
ignore:
  never_read: []
  never_log: []
`);

    // Modify the file and commit
    writeFileSync(join(tmpDir, 'src/handler.ts'), 'export function handle() { return true; }');
    execSync('git add -A && git commit -m "modify handler"', { cwd: tmpDir });

    const result = detectDrift(join(tmpDir, '.ctx'), tmpDir);

    const modifiedEntry = result.stale_entries.find(
      (e) => e.entry_id === 'src/handler.ts',
    );
    expect(modifiedEntry).toBeDefined();
    expect(modifiedEntry!.reason).toBe('file_modified');
  });

  it('should report no drift when files are unchanged', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src/handler.ts'), 'export function handle() {}');
    execSync('git add -A && git commit -m "initial"', { cwd: tmpDir });

    const commitHash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    writeFileSync(join(tmpDir, '.ctx'), `
version: 1
summary: Test project
key_files:
  - path: src/handler.ts
    purpose: Handler
    tags: []
    verified_at: "${commitHash}"
    locked: false
contracts: []
decisions: []
commands: {}
gotchas: []
tags: []
refs: []
ignore:
  never_read: []
  never_log: []
`);

    const result = detectDrift(join(tmpDir, '.ctx'), tmpDir);
    expect(result.total_stale).toBe(0);
  });

  it('should detect dead references via scanForDeadReferences', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src/exists.ts'), 'export const x = 1;');

    writeFileSync(join(tmpDir, '.ctx'), `
version: 1
summary: Test
key_files:
  - path: src/exists.ts
    purpose: Exists
    tags: []
    verified_at: ""
    locked: false
  - path: src/missing.ts
    purpose: Does not exist
    tags: []
    verified_at: ""
    locked: false
contracts: []
decisions: []
commands: {}
gotchas: []
tags: []
refs: []
ignore:
  never_read: []
  never_log: []
`);

    const result = scanForDeadReferences(join(tmpDir, '.ctx'), tmpDir);
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0].entryId).toBe('src/missing.ts');
    expect(result.proposals[0].action).toBe('remove');
    expect(result.diff).not.toBeNull();
    expect(result.diff!.hasChanges).toBe(true);
  });
});
