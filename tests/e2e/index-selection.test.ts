import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const CLI_BIN = join(__dirname, '..', '..', 'packages', 'cli', 'dist', 'index.js');

describe('Index CLI E2E (US1)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-index-e2e-'));

    // Create repo structure with .ctx files
    mkdirSync(join(tmpDir, 'src', 'auth'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'api'), { recursive: true });

    // Initialize git repo (needed for repo root detection)
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });

    writeFileSync(join(tmpDir, '.ctx'), `
version: 1
summary: "Test project"
key_files: []
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

    writeFileSync(join(tmpDir, 'src', 'auth', '.ctx'), `
version: 1
summary: "Auth module"
key_files:
  - path: "src/auth/index.ts"
    purpose: "Auth entry point"
    tags: [auth]
    verified_at: ""
    locked: false
    owner: null
contracts:
  - name: "auth-required"
    scope:
      paths: ["src/auth/**"]
      tags: [auth]
    content: "All routes require authentication"
    verified_at: ""
    locked: false
    owner: null
decisions: []
commands: {}
gotchas: []
tags: [auth, security]
refs: []
ignore:
  never_read: []
  never_log: []
`);

    writeFileSync(join(tmpDir, 'src', 'api', '.ctx'), `
version: 1
summary: "API routes"
key_files: []
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [api]
refs: []
ignore:
  never_read: []
  never_log: []
`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate index via CLI', () => {
    const output = execSync(`node ${CLI_BIN} index generate --cwd ${tmpDir} --json`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const result = JSON.parse(output);
    expect(result.entries_count).toBe(3);
    expect(result.index_path).toContain('.ctxl');
    expect(existsSync(join(tmpDir, '.ctxl'))).toBe(true);
  });

  it('should select context via CLI', () => {
    // First generate
    execSync(`node ${CLI_BIN} index generate --cwd ${tmpDir}`, { stdio: 'pipe' });

    // Then select
    const output = execSync(
      `node ${CLI_BIN} index select --prompt "Fix auth bug" --cwd ${join(tmpDir, 'src', 'auth')} --json`,
      { encoding: 'utf-8', stdio: 'pipe' },
    );

    const result = JSON.parse(output);
    expect(result.selected.length).toBeGreaterThan(0);
  });

  it('should show index via CLI', () => {
    execSync(`node ${CLI_BIN} index generate --cwd ${tmpDir}`, { stdio: 'pipe' });

    const output = execSync(`node ${CLI_BIN} index show --cwd ${tmpDir} --json`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const index = JSON.parse(output);
    expect(index.version).toBe(1);
    expect(index.entries).toHaveLength(3);
  });
});
