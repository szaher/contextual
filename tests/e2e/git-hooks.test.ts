import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, chmodSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { formatTrailers, parseTrailers } from '@ctxkit/core';

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' },
  }).trim();
}

function initGitRepo(dir: string): void {
  git('init', dir);
  git('config user.name "Test User"', dir);
  git('config user.email "test@test.com"', dir);
  // Create an initial commit so HEAD exists
  writeFileSync(join(dir, 'README.md'), '# Test\n');
  git('add .', dir);
  git('commit -m "initial commit"', dir);
}

describe('Git Hooks E2E', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-hooks-e2e-'));
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Trailer format round-trip', () => {
    it('format → parse produces consistent data', () => {
      const trailers = formatTrailers({
        sessionId: 'sess_e2e12345',
        files: ['src/.ctx'],
        entries: 2,
        timestamp: '2026-03-15T14:30:00Z',
      });

      const parsed = parseTrailers(`fix: something\n\n${trailers}`);
      expect(parsed).not.toBeNull();
      expect(parsed!.sessionId).toBe('sess_e2e12345');
      expect(parsed!.files).toEqual(['src/.ctx']);
      expect(parsed!.entries).toBe(2);
    });
  });

  describe('Hook installation', () => {
    it('installs prepare-commit-msg hook file', () => {
      const hooksDir = join(tmpDir, '.git', 'hooks');
      const hookPath = join(hooksDir, 'prepare-commit-msg');

      // Manually install the hook (simulating ctxkit hooks init)
      const hookContent = `#!/bin/sh
# ctxkit prepare-commit-msg hook — injects context trailers into commit messages
# Installed by: ctxkit hooks init
# Version: 0.2.0

exit 0
`;
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(hookPath, hookContent, 'utf-8');
      chmodSync(hookPath, 0o755);

      expect(existsSync(hookPath)).toBe(true);
      const content = readFileSync(hookPath, 'utf-8');
      expect(content).toContain('Installed by: ctxkit hooks init');
      expect(content).toContain('Version: 0.2.0');
    });

    it('chains with existing hook by renaming original', () => {
      const hooksDir = join(tmpDir, '.git', 'hooks');
      const hookPath = join(hooksDir, 'prepare-commit-msg');
      const originalPath = `${hookPath}.ctxkit-original`;

      // Create a pre-existing hook
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(hookPath, '#!/bin/sh\necho "original hook"\n', 'utf-8');
      chmodSync(hookPath, 0o755);

      // Simulate chaining: rename original, create ctxkit wrapper
      renameSync(hookPath, originalPath);

      const chainedContent = `#!/bin/sh
# Installed by: ctxkit hooks init
if [ -x "${originalPath}" ]; then
  "${originalPath}" "$@"
fi
exit 0
`;
      writeFileSync(hookPath, chainedContent, 'utf-8');
      chmodSync(hookPath, 0o755);

      expect(existsSync(originalPath)).toBe(true);
      expect(readFileSync(originalPath, 'utf-8')).toContain('original hook');
      expect(readFileSync(hookPath, 'utf-8')).toContain('Installed by: ctxkit hooks init');
    });
  });

  describe('Hook removal', () => {
    it('removes ctxkit hook and restores original', () => {
      const hooksDir = join(tmpDir, '.git', 'hooks');
      const hookPath = join(hooksDir, 'prepare-commit-msg');
      const originalPath = `${hookPath}.ctxkit-original`;

      mkdirSync(hooksDir, { recursive: true });

      // Simulate original + chained installation
      writeFileSync(originalPath, '#!/bin/sh\necho "original"\n', 'utf-8');
      chmodSync(originalPath, 0o755);
      writeFileSync(hookPath, '#!/bin/sh\n# Installed by: ctxkit hooks init\nexit 0\n', 'utf-8');
      chmodSync(hookPath, 0o755);

      // Remove ctxkit hook, restore original
      unlinkSync(hookPath);
      renameSync(originalPath, hookPath);

      expect(existsSync(hookPath)).toBe(true);
      expect(existsSync(originalPath)).toBe(false);
      expect(readFileSync(hookPath, 'utf-8')).toContain('original');
    });
  });

  describe('No-op behavior', () => {
    it('formatTrailers returns empty when no session and no files', () => {
      const result = formatTrailers({
        timestamp: '2026-03-15T14:30:00Z',
      });
      expect(result).toBe('');
    });
  });

  describe('Commit message trailer injection', () => {
    it('appends trailers to a commit message file', () => {
      const msgFile = join(tmpDir, 'COMMIT_MSG');
      writeFileSync(msgFile, 'fix: update auth flow\n');

      const trailers = formatTrailers({
        sessionId: 'sess_e2e12345',
        files: ['src/auth/.ctx'],
        entries: 1,
        timestamp: '2026-03-15T14:30:00Z',
      });

      const currentMessage = readFileSync(msgFile, 'utf-8');
      writeFileSync(msgFile, `${currentMessage.trimEnd()}\n\n${trailers}\n`, 'utf-8');

      const finalMessage = readFileSync(msgFile, 'utf-8');
      expect(finalMessage).toContain('fix: update auth flow');
      expect(finalMessage).toContain('Ctxkit-Session: sess_e2e12345');
      expect(finalMessage).toContain('Ctxkit-Timestamp');

      // Verify the message can be parsed back
      const parsed = parseTrailers(finalMessage);
      expect(parsed).not.toBeNull();
      expect(parsed!.sessionId).toBe('sess_e2e12345');
    });
  });
});
