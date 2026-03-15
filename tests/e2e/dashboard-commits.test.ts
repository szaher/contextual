import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { formatTrailers, queryCommitsWithTrailers, parseTrailers } from '@ctxkit/core';

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@test.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@test.com',
    },
  }).trim();
}

function commitWithTrailers(cwd: string, subject: string, trailers: string): void {
  const msgFile = join(cwd, '.git', 'COMMIT_MSG_TMP');
  writeFileSync(msgFile, `${subject}\n\n${trailers}\n`, 'utf-8');
  git(`commit -F "${msgFile}"`, cwd);
}

describe('Dashboard Commit View E2E', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-dashboard-commits-'));
    git('init', tmpDir);
    git('config user.name "Test User"', tmpDir);
    git('config user.email "test@test.com"', tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a repo with trailer commits and verifies queryCommitsWithTrailers', () => {
    // Commit 1: with trailers
    writeFileSync(join(tmpDir, 'auth.ts'), 'export function login() {}');
    git('add .', tmpDir);
    const trailers = formatTrailers({
      sessionId: 'sess_e2e00001',
      files: ['src/auth/.ctx'],
      entries: 3,
      timestamp: '2026-03-15T14:30:00Z',
    });
    commitWithTrailers(tmpDir, 'feat: add auth', trailers);

    // Commit 2: without trailers
    writeFileSync(join(tmpDir, 'readme.md'), '# Test');
    git('add .', tmpDir);
    git('commit -m "docs: add readme"', tmpDir);

    // Commit 3: with trailers, different session
    writeFileSync(join(tmpDir, 'api.ts'), 'export function get() {}');
    git('add .', tmpDir);
    const trailers2 = formatTrailers({
      sessionId: 'sess_e2e00002',
      files: ['src/api/.ctx'],
      entries: 1,
      timestamp: '2026-03-15T15:00:00Z',
    });
    commitWithTrailers(tmpDir, 'feat: add api', trailers2);

    // Query all commits with trailers
    const results = queryCommitsWithTrailers(tmpDir, {});
    expect(results.length).toBe(2);

    // Verify response structure matches API contract
    for (const commit of results) {
      expect(commit.commitHash).toBeTruthy();
      expect(commit.messageSubject).toBeTruthy();
      expect(commit.author).toBeTruthy();
      expect(commit.trailerTimestamp).toBeTruthy();
      expect(commit.sessionId).toMatch(/^sess_/);
      expect(Array.isArray(commit.filesChanged)).toBe(true);
    }

    // Verify session filtering works
    const filtered = queryCommitsWithTrailers(tmpDir, { sessionId: 'sess_e2e00001' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].sessionId).toBe('sess_e2e00001');
  });

  it('parses trailers from git log output correctly', () => {
    writeFileSync(join(tmpDir, 'test.ts'), 'const x = 1;');
    git('add .', tmpDir);
    const trailers = formatTrailers({
      sessionId: 'sess_roundtrp',
      files: ['a/.ctx', 'b/.ctx'],
      entries: 5,
      timestamp: '2026-03-15T16:00:00Z',
    });
    commitWithTrailers(tmpDir, 'test: round trip', trailers);

    // Read back from git log
    const logOutput = execSync('git log -1 --format=%B', {
      cwd: tmpDir,
      encoding: 'utf-8',
    });

    const parsed = parseTrailers(logOutput);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessionId).toBe('sess_roundtrp');
    expect(parsed!.files).toEqual(['a/.ctx', 'b/.ctx']);
    expect(parsed!.entries).toBe(5);
  });
});
