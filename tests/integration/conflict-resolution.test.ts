import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseCtxFile, acquireLock, checkLockStatus, isLockExpired, threeWayMerge, resolveConflict, resolveAllConflicts } from '@ctxkit/core';
import type { CtxFile, LockInfo } from '@ctxkit/core';

describe('Multi-Agent Conflict Resolution (US3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-conflict-'));
    mkdirSync(join(tmpDir, 'src', 'auth'), { recursive: true });

    writeFileSync(join(tmpDir, 'src', 'auth', '.ctx'), `
version: 1
summary: "Auth module"
key_files:
  - path: "src/auth/jwt.ts"
    purpose: "JWT validation"
    tags: [auth]
    verified_at: ""
    locked: false
    owner: null
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [auth]
refs: []
ignore:
  never_read: []
  never_log: []
`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Lock Manager', () => {
    it('should acquire and release a lock', async () => {
      const handle = await acquireLock(
        tmpDir, 'src/auth/.ctx', 'agent:opus:sess_1', 'update',
      );

      expect(handle.lock.path).toBe('src/auth/.ctx');
      expect(handle.lock.holder).toBe('agent:opus:sess_1');
      expect(handle.lock.operation).toBe('update');

      // Check lock file exists
      const status = checkLockStatus(tmpDir, 'src/auth/.ctx');
      expect(status).not.toBeNull();
      expect(status!.holder).toBe('agent:opus:sess_1');

      // Release
      await handle.release();
      const statusAfter = checkLockStatus(tmpDir, 'src/auth/.ctx');
      expect(statusAfter).toBeNull();
    });

    it('should handle TTL expiry', () => {
      const expiredLock: LockInfo = {
        path: 'src/auth/.ctx',
        holder: 'agent:opus:sess_old',
        acquired_at: new Date(Date.now() - 600000).toISOString(),
        expires_at: new Date(Date.now() - 60000).toISOString(), // Expired 1 minute ago
        operation: 'update',
      };

      expect(isLockExpired(expiredLock)).toBe(true);

      const activeLock: LockInfo = {
        path: 'src/auth/.ctx',
        holder: 'agent:opus:sess_new',
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
        operation: 'update',
      };

      expect(isLockExpired(activeLock)).toBe(false);
    });

    it('should fail to acquire lock when held by another', async () => {
      // Acquire lock with first holder
      const handle = await acquireLock(
        tmpDir, 'src/auth/.ctx', 'agent:opus:sess_1', 'update',
      );

      // Try to acquire same lock with different holder — should fail after retries
      await expect(
        acquireLock(tmpDir, 'src/auth/.ctx', 'agent:sonnet:sess_2', 'update', 1000),
      ).rejects.toThrow('Lock acquisition failed');

      await handle.release();
    });

    it('should acquire lock after expired lock', async () => {
      // Create an expired lock by writing directly
      const lockPath = join(tmpDir, '.ctxl.lock');
      writeFileSync(lockPath, [
        `path: "src/auth/.ctx"`,
        `holder: "agent:opus:sess_old"`,
        `acquired_at: "${new Date(Date.now() - 600000).toISOString()}"`,
        `expires_at: "${new Date(Date.now() - 60000).toISOString()}"`,
        `operation: "update"`,
      ].join('\n') + '\n');

      // Should succeed because old lock is expired
      const handle = await acquireLock(
        tmpDir, 'src/auth/.ctx', 'agent:sonnet:sess_new', 'update',
      );

      expect(handle.lock.holder).toBe('agent:sonnet:sess_new');
      await handle.release();
    });
  });

  describe('Three-Way Merge', () => {
    it('should clean merge non-overlapping changes', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      // Agent A adds a key_file
      const ours: CtxFile = {
        ...base,
        key_files: [
          ...base.key_files,
          { path: 'src/auth/oauth.ts', purpose: 'OAuth2', tags: ['auth'], verified_at: '', locked: false, owner: null },
        ],
      };

      // Agent B adds a different key_file
      const theirs: CtxFile = {
        ...base,
        key_files: [
          ...base.key_files,
          { path: 'src/auth/session.ts', purpose: 'Session management', tags: ['auth'], verified_at: '', locked: false, owner: null },
        ],
      };

      const result = threeWayMerge(base, ours, theirs);
      expect(result.clean).toBe(true);
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.key_files).toHaveLength(3); // original + both additions
      expect(result.merged.key_files.map((kf) => kf.path)).toContain('src/auth/oauth.ts');
      expect(result.merged.key_files.map((kf) => kf.path)).toContain('src/auth/session.ts');
    });

    it('should create conflict for overlapping changes to same entry', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      // Agent A modifies jwt.ts purpose
      const ours: CtxFile = {
        ...base,
        key_files: [
          { ...base.key_files[0], purpose: 'JWT validation and refresh' },
        ],
        _history: [{ version: 2, timestamp: new Date().toISOString(), author: 'agent:opus', session_id: null, reason: 'Updated purpose', checksum: 'sha256:aaa', diff_summary: '' }],
      };

      // Agent B modifies jwt.ts purpose differently
      const theirs: CtxFile = {
        ...base,
        key_files: [
          { ...base.key_files[0], purpose: 'JWT token management' },
        ],
        _history: [{ version: 2, timestamp: new Date().toISOString(), author: 'agent:sonnet', session_id: null, reason: 'Changed purpose', checksum: 'sha256:bbb', diff_summary: '' }],
      };

      const result = threeWayMerge(base, ours, theirs);
      expect(result.clean).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].section).toBe('key_files');
      expect(result.conflicts[0].key).toBe('src/auth/jwt.ts');
      expect(result.conflicts[0].ours_author).toBe('agent:opus');
      expect(result.conflicts[0].theirs_author).toBe('agent:sonnet');
    });

    it('should apply union-by-key strategy for key_files', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      const ours: CtxFile = {
        ...base,
        key_files: [
          ...base.key_files,
          { path: 'src/auth/a.ts', purpose: 'A', tags: [], verified_at: '', locked: false, owner: null },
        ],
      };

      const theirs: CtxFile = {
        ...base,
        key_files: [
          ...base.key_files,
          { path: 'src/auth/b.ts', purpose: 'B', tags: [], verified_at: '', locked: false, owner: null },
        ],
      };

      const result = threeWayMerge(base, ours, theirs);
      expect(result.strategies.find((s) => s.section === 'key_files')?.strategy).toBe('union-by-key');
      expect(result.merged.key_files).toHaveLength(3);
    });

    it('should apply last-writer-wins for summary', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      const ours: CtxFile = { ...base, summary: 'Auth module v2' };
      const theirs: CtxFile = { ...base, summary: 'Authentication & authorization' };

      const result = threeWayMerge(base, ours, theirs);
      // Last writer wins — theirs preferred
      expect(result.merged.summary).toBe('Authentication & authorization');
    });

    it('should apply deduplicated-union for tags', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      const ours: CtxFile = { ...base, tags: ['auth', 'security'] };
      const theirs: CtxFile = { ...base, tags: ['auth', 'jwt'] };

      const result = threeWayMerge(base, ours, theirs);
      expect(result.merged.tags).toContain('auth');
      expect(result.merged.tags).toContain('security');
      expect(result.merged.tags).toContain('jwt');
      // No duplicates
      expect(new Set(result.merged.tags).size).toBe(result.merged.tags.length);
    });

    it('should apply concatenate-dedup for gotchas', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      const ours: CtxFile = {
        ...base,
        gotchas: [
          { text: 'Tokens expire after 1h', tags: ['auth'], verified_at: '', locked: false },
        ],
      };
      const theirs: CtxFile = {
        ...base,
        gotchas: [
          { text: 'CORS must be configured', tags: ['http'], verified_at: '', locked: false },
        ],
      };

      const result = threeWayMerge(base, ours, theirs);
      expect(result.merged.gotchas).toHaveLength(2);
    });

    it('should handle all section strategies', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      const result = threeWayMerge(base, base, base);
      const sectionStrategies = result.strategies.map((s) => s.section);
      expect(sectionStrategies).toContain('key_files');
      expect(sectionStrategies).toContain('contracts');
      expect(sectionStrategies).toContain('decisions');
      expect(sectionStrategies).toContain('refs');
      expect(sectionStrategies).toContain('summary');
      expect(sectionStrategies).toContain('commands');
      expect(sectionStrategies).toContain('gotchas');
      expect(sectionStrategies).toContain('tags');
      expect(sectionStrategies).toContain('ignore');
    });
  });

  describe('Conflict Resolution Workflow', () => {
    it('should resolve conflict with pick_ours', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      // Create a conflict scenario
      const conflicts = [
        {
          section: 'key_files',
          key: 'src/auth/jwt.ts',
          ours: { path: 'src/auth/jwt.ts', purpose: 'JWT v2', tags: ['auth'], verified_at: '', locked: false, owner: null },
          theirs: { path: 'src/auth/jwt.ts', purpose: 'JWT old', tags: ['auth'], verified_at: '', locked: false, owner: null },
          ours_author: 'agent:opus',
          theirs_author: 'agent:sonnet',
        },
      ];

      const { ctx: resolved, remainingConflicts } = resolveConflict(base, conflicts, {
        ctx_path: 'src/auth/.ctx',
        section: 'key_files',
        key: 'src/auth/jwt.ts',
        choice: 'pick_ours',
        author: 'developer:szaher',
      });

      expect(remainingConflicts).toHaveLength(0);
      expect(resolved.version).toBe(2); // Version bumped
      expect(resolved.key_files[0].purpose).toBe('JWT v2');
    });

    it('should resolve conflict with pick_theirs', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      const conflicts = [
        {
          section: 'key_files',
          key: 'src/auth/jwt.ts',
          ours: { path: 'src/auth/jwt.ts', purpose: 'JWT v2', tags: ['auth'], verified_at: '', locked: false, owner: null },
          theirs: { path: 'src/auth/jwt.ts', purpose: 'JWT old', tags: ['auth'], verified_at: '', locked: false, owner: null },
          ours_author: 'agent:opus',
          theirs_author: 'agent:sonnet',
        },
      ];

      const { ctx: resolved } = resolveConflict(base, conflicts, {
        ctx_path: 'src/auth/.ctx',
        section: 'key_files',
        key: 'src/auth/jwt.ts',
        choice: 'pick_theirs',
        author: 'developer:szaher',
      });

      expect(resolved.key_files[0].purpose).toBe('JWT old');
    });

    it('should resolve all conflicts with a single strategy', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      const conflicts = [
        {
          section: 'key_files',
          key: 'src/auth/jwt.ts',
          ours: { path: 'src/auth/jwt.ts', purpose: 'JWT ours', tags: ['auth'], verified_at: '', locked: false, owner: null },
          theirs: { path: 'src/auth/jwt.ts', purpose: 'JWT theirs', tags: ['auth'], verified_at: '', locked: false, owner: null },
          ours_author: 'agent:opus',
          theirs_author: 'agent:sonnet',
        },
        {
          section: 'key_files',
          key: 'src/auth/oauth.ts',
          ours: { path: 'src/auth/oauth.ts', purpose: 'OAuth ours', tags: ['auth'], verified_at: '', locked: false, owner: null },
          theirs: { path: 'src/auth/oauth.ts', purpose: 'OAuth theirs', tags: ['auth'], verified_at: '', locked: false, owner: null },
          ours_author: 'agent:opus',
          theirs_author: 'agent:sonnet',
        },
      ];

      // Need to first add oauth.ts to base
      const baseWithBoth: CtxFile = {
        ...base,
        key_files: [
          ...base.key_files,
          { path: 'src/auth/oauth.ts', purpose: 'OAuth base', tags: ['auth'], verified_at: '', locked: false, owner: null },
        ],
      };

      const resolved = resolveAllConflicts(baseWithBoth, conflicts, 'pick_ours', 'developer:szaher');
      expect(resolved.key_files.find((kf) => kf.path === 'src/auth/jwt.ts')?.purpose).toBe('JWT ours');
      expect(resolved.key_files.find((kf) => kf.path === 'src/auth/oauth.ts')?.purpose).toBe('OAuth ours');
    });

    it('should bump version after resolution', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: base } = parseCtxFile(content);

      const conflicts = [
        {
          section: 'key_files',
          key: 'src/auth/jwt.ts',
          ours: { path: 'src/auth/jwt.ts', purpose: 'JWT v2', tags: ['auth'], verified_at: '', locked: false, owner: null },
          theirs: { path: 'src/auth/jwt.ts', purpose: 'JWT old', tags: ['auth'], verified_at: '', locked: false, owner: null },
          ours_author: 'agent:opus',
          theirs_author: 'agent:sonnet',
        },
      ];

      const { ctx: resolved } = resolveConflict(base, conflicts, {
        ctx_path: 'src/auth/.ctx',
        section: 'key_files',
        key: 'src/auth/jwt.ts',
        choice: 'pick_ours',
        author: 'developer:szaher',
      });

      expect(resolved.version).toBeGreaterThan(base.version);
      expect(resolved._history).toBeDefined();
      expect(resolved._history!.length).toBeGreaterThan(0);
      expect(resolved._history![0].reason).toContain('Resolved conflict');
    });
  });
});
