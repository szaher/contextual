import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { Hono } from 'hono';
import { detectDrift, isValidVerifiedAt } from '@ctxl/core';
import { resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * US1: Safe Drift Detection — Security Integration Tests
 *
 * T013-T014: Tests for command injection prevention, verified_at validation,
 * and path traversal protection in the drift detection subsystem.
 */

describe('Integration: Drift Detection Security', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-drift-security-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────────
  // T011: isValidVerifiedAt validation
  // ──────────────────────────────────────────────────────────────────

  describe('isValidVerifiedAt', () => {
    it('should accept empty string', () => {
      expect(isValidVerifiedAt('')).toBe(true);
    });

    it('should accept valid short git hash', () => {
      expect(isValidVerifiedAt('abcd')).toBe(true);
      expect(isValidVerifiedAt('abc1234')).toBe(true);
    });

    it('should accept valid full git hash (40 chars)', () => {
      expect(isValidVerifiedAt('a'.repeat(40))).toBe(true);
      expect(isValidVerifiedAt('0123456789abcdef0123456789abcdef01234567')).toBe(true);
    });

    it('should accept ISO 8601 date strings', () => {
      expect(isValidVerifiedAt('2025-01-15')).toBe(true);
      expect(isValidVerifiedAt('2025-01-15T10:30:00Z')).toBe(true);
      expect(isValidVerifiedAt('2025-06-01T12:00:00.000Z')).toBe(true);
    });

    it('should reject shell metacharacters', () => {
      expect(isValidVerifiedAt('; rm -rf /')).toBe(false);
      expect(isValidVerifiedAt('| cat /etc/passwd')).toBe(false);
      expect(isValidVerifiedAt('`whoami`')).toBe(false);
      expect(isValidVerifiedAt('$(id)')).toBe(false);
      expect(isValidVerifiedAt("'; DROP TABLE users;--")).toBe(false);
      expect(isValidVerifiedAt('"$(whoami)"')).toBe(false);
    });

    it('should reject strings with uppercase hex (not valid git hash)', () => {
      expect(isValidVerifiedAt('ABCD1234')).toBe(false);
    });

    it('should reject random strings that are not dates or hashes', () => {
      expect(isValidVerifiedAt('not-a-hash-or-date')).toBe(false);
      expect(isValidVerifiedAt('hello world')).toBe(false);
    });

    it('should reject hash longer than 40 characters', () => {
      expect(isValidVerifiedAt('a'.repeat(41))).toBe(false);
    });

    it('should reject hash shorter than 4 characters', () => {
      expect(isValidVerifiedAt('abc')).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // T013: Command injection prevention via verified_at
  // ──────────────────────────────────────────────────────────────────

  describe('command injection prevention', () => {
    const shellMetachars = [
      '; echo INJECTED',
      '| cat /etc/passwd',
      '`whoami`',
      '$(id)',
      "' || echo INJECTED'",
      '" && echo INJECTED"',
    ];

    for (const malicious of shellMetachars) {
      it(`should not execute shell commands from verified_at: ${JSON.stringify(malicious)}`, () => {
        // Create a .ctx file with a malicious verified_at value
        // Use JSON.stringify for proper YAML double-quote escaping
        writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Test injection"
key_files:
  - path: src/app.ts
    why: "Main app"
    verified_at: ${JSON.stringify(malicious)}
decisions: []
contracts: []
tags: []
`);
        mkdirSync(join(tmpDir, 'src'), { recursive: true });
        writeFileSync(join(tmpDir, 'src/app.ts'), 'export const app = true;\n');
        execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

        // Should not throw and should not execute the injected command
        const result = detectDrift(join(tmpDir, '.ctx'), tmpDir);

        // The malicious verified_at should be caught by validation
        // and reported as commit_unknown (invalid format), not executed
        expect(result.stale_entries).toHaveLength(1);
        expect(result.stale_entries[0].reason).toBe('commit_unknown');
        expect(result.stale_entries[0].details).toContain('Invalid verified_at format');
      });
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // T013: Valid-format hash that doesn't exist in the repo
  // ──────────────────────────────────────────────────────────────────

  describe('non-existent but valid-format git hash', () => {
    it('should gracefully report commit_unknown for a valid hash not in the repo', () => {
      const fakeHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

      writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Test non-existent hash"
key_files:
  - path: src/app.ts
    why: "Main app"
    verified_at: "${fakeHash}"
decisions: []
contracts: []
tags: []
`);
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, 'src/app.ts'), 'export const app = true;\n');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

      const result = detectDrift(join(tmpDir, '.ctx'), tmpDir);

      expect(result.stale_entries).toHaveLength(1);
      expect(result.stale_entries[0].reason).toBe('commit_unknown');
      expect(result.stale_entries[0].details).toContain('Cannot find commit');
      expect(result.stale_entries[0].verified_at).toBe(fakeHash);
    });

    it('should handle a short valid hash that does not exist', () => {
      const fakeShortHash = 'dead1234';

      writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Test non-existent short hash"
key_files:
  - path: src/app.ts
    why: "Main app"
    verified_at: "${fakeShortHash}"
contracts:
  - name: test-contract
    content: "Test contract"
    scope:
      paths: ["src/*"]
      tags: ["test"]
    locked: false
    verified_at: "${fakeShortHash}"
decisions: []
tags: []
`);
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, 'src/app.ts'), 'export const app = true;\n');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

      const result = detectDrift(join(tmpDir, '.ctx'), tmpDir);

      // Both key_file and contract should report errors
      expect(result.stale_entries.length).toBeGreaterThanOrEqual(1);
      for (const entry of result.stale_entries) {
        expect(entry.reason).toBe('commit_unknown');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // T014: Path traversal in drift HTTP endpoint
  // ──────────────────────────────────────────────────────────────────

  describe('path traversal protection in drift route', () => {
    /**
     * Create a minimal Hono app that mirrors the drift route logic
     * (imported from packages/daemon/src/routes/drift.ts) to test
     * path traversal validation without spinning up a full server.
     */
    function createDriftApp() {
      const app = new Hono();

      app.get('/api/v1/drift', (c) => {
        const ctxPathParam = c.req.query('ctx_path');
        const repoRoot = c.req.query('repo_root');

        if (!repoRoot) {
          return c.json(
            { error: { code: 'BAD_REQUEST', message: 'repo_root query parameter is required' } },
            400,
          );
        }

        if (ctxPathParam) {
          const resolvedPath = resolve(repoRoot, ctxPathParam);
          const normalizedRoot = resolve(repoRoot) + sep;
          if (!resolvedPath.startsWith(normalizedRoot) && resolvedPath !== resolve(repoRoot)) {
            return c.json({ error: 'ctx_path resolves outside repository root' }, 400);
          }

          if (!existsSync(resolvedPath)) {
            return c.json(
              { error: { code: 'NOT_FOUND', message: `No .ctx file found at ${ctxPathParam}` } },
              404,
            );
          }
          const result = detectDrift(resolvedPath, repoRoot);
          return c.json({ results: [result] }, 200);
        }

        return c.json({ results: [] }, 200);
      });

      return app;
    }

    it('should reject ctx_path with ../../etc/passwd traversal', async () => {
      const app = createDriftApp();
      const url = `/api/v1/drift?repo_root=${encodeURIComponent(tmpDir)}&ctx_path=${encodeURIComponent('../../etc/passwd')}`;
      const res = await app.request(url);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('ctx_path resolves outside repository root');
    });

    it('should reject ctx_path with absolute path outside repo', async () => {
      const app = createDriftApp();
      const url = `/api/v1/drift?repo_root=${encodeURIComponent(tmpDir)}&ctx_path=${encodeURIComponent('/etc/passwd')}`;
      const res = await app.request(url);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('ctx_path resolves outside repository root');
    });

    it('should reject ctx_path with ../ at various depths', async () => {
      const app = createDriftApp();

      const traversals = [
        '../../../etc/shadow',
        '../../../../tmp/evil',
        '../.ssh/id_rsa',
      ];

      for (const traversal of traversals) {
        const url = `/api/v1/drift?repo_root=${encodeURIComponent(tmpDir)}&ctx_path=${encodeURIComponent(traversal)}`;
        const res = await app.request(url);

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('ctx_path resolves outside repository root');
      }
    });

    it('should allow valid ctx_path within repo root', async () => {
      const app = createDriftApp();

      // Create a .ctx file inside the repo
      writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Test"
key_files: []
contracts: []
decisions: []
tags: []
`);
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

      const url = `/api/v1/drift?repo_root=${encodeURIComponent(tmpDir)}&ctx_path=${encodeURIComponent('.ctx')}`;
      const res = await app.request(url);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
    });

    it('should allow ctx_path in subdirectory within repo root', async () => {
      const app = createDriftApp();

      mkdirSync(join(tmpDir, 'src', 'auth'), { recursive: true });
      writeFileSync(join(tmpDir, 'src', 'auth', '.ctx'), `version: 1
summary: "Auth context"
key_files: []
contracts: []
decisions: []
tags: []
`);
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

      const url = `/api/v1/drift?repo_root=${encodeURIComponent(tmpDir)}&ctx_path=${encodeURIComponent('src/auth/.ctx')}`;
      const res = await app.request(url);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toBeDefined();
    });
  });
});
