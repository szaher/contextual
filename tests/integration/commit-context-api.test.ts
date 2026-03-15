import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { queryCommitsWithTrailers, formatTrailers } from '@ctxkit/core';

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

describe('Commit Context API Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-commit-ctx-'));
    git('init', tmpDir);
    git('config user.name "Test User"', tmpDir);
    git('config user.email "test@test.com"', tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('queryCommitsWithTrailers returns commits with parsed trailers', () => {
    writeFileSync(join(tmpDir, 'file1.ts'), 'const a = 1;');
    git('add .', tmpDir);
    const trailers = formatTrailers({
      sessionId: 'sess_11111111',
      files: ['src/.ctx'],
      entries: 2,
      timestamp: '2026-03-15T14:30:00Z',
    });
    commitWithTrailers(tmpDir, 'feat: add feature', trailers);

    const results = queryCommitsWithTrailers(tmpDir, {});
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe('sess_11111111');
    expect(results[0].filesChanged).toEqual(['src/.ctx']);
    expect(results[0].entryCount).toBe(2);
    expect(results[0].messageSubject).toBe('feat: add feature');
  });

  it('returns empty array when no commits have trailers', () => {
    writeFileSync(join(tmpDir, 'file1.ts'), 'const a = 1;');
    git('add .', tmpDir);
    git('commit -m "no trailers here"', tmpDir);

    const results = queryCommitsWithTrailers(tmpDir, {});
    expect(results.length).toBe(0);
  });

  it('filters by session ID', () => {
    writeFileSync(join(tmpDir, 'file1.ts'), 'const a = 1;');
    git('add .', tmpDir);
    const trailers1 = formatTrailers({
      sessionId: 'sess_aaaaaaaa',
      timestamp: '2026-03-15T14:00:00Z',
    });
    commitWithTrailers(tmpDir, 'feat: first', trailers1);

    writeFileSync(join(tmpDir, 'file2.ts'), 'const b = 2;');
    git('add .', tmpDir);
    const trailers2 = formatTrailers({
      sessionId: 'sess_bbbbbbbb',
      timestamp: '2026-03-15T15:00:00Z',
    });
    commitWithTrailers(tmpDir, 'feat: second', trailers2);

    const results = queryCommitsWithTrailers(tmpDir, { sessionId: 'sess_aaaaaaaa' });
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe('sess_aaaaaaaa');
  });

  it('respects limit option', () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(tmpDir, `file${i}.ts`), `const x = ${i};`);
      git('add .', tmpDir);
      const trailers = formatTrailers({
        sessionId: `sess_${String(i).padStart(8, '0')}`,
        timestamp: `2026-03-15T${10 + i}:00:00Z`,
      });
      commitWithTrailers(tmpDir, `feat: commit ${i}`, trailers);
    }

    const results = queryCommitsWithTrailers(tmpDir, { limit: 2 });
    expect(results.length).toBe(2);
  });
});
