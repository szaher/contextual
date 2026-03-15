import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StalenessTracker, extractModifiedPath, generateUpdateProposals as generateProposals } from '@ctxkit/core';

describe('Auto-Update Protocol (US4)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-auto-update-'));
    mkdirSync(join(tmpDir, 'src', 'auth'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'api'), { recursive: true });

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

    writeFileSync(join(tmpDir, 'src', 'auth', 'jwt.ts'), 'export function validateJwt() {}');
    writeFileSync(join(tmpDir, 'src', 'api', 'server.ts'), 'export function startServer() {}');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Staleness Tracker', () => {
    it('should track modified files by directory', () => {
      const tracker = new StalenessTracker('sess_test123');
      tracker.trackFile('/repo/src/auth/jwt.ts');
      tracker.trackFile('/repo/src/auth/oauth.ts');
      tracker.trackFile('/repo/src/api/server.ts');

      expect(tracker.getStaleDirectories()).toHaveLength(2);
      expect(tracker.getStaleDirectories()).toContain('/repo/src/auth');
      expect(tracker.getStaleDirectories()).toContain('/repo/src/api');
    });

    it('should group files by parent directory', () => {
      const tracker = new StalenessTracker('sess_test');
      tracker.trackFile('/repo/src/auth/jwt.ts');
      tracker.trackFile('/repo/src/auth/middleware.ts');

      const files = tracker.getModifiedFiles('/repo/src/auth');
      expect(files).toHaveLength(2);
      expect(files).toContain('/repo/src/auth/jwt.ts');
      expect(files).toContain('/repo/src/auth/middleware.ts');
    });

    it('should provide summary with file counts', () => {
      const tracker = new StalenessTracker('sess_test');
      tracker.trackFile('/repo/src/auth/jwt.ts');
      tracker.trackFile('/repo/src/auth/oauth.ts');
      tracker.trackFile('/repo/src/api/server.ts');

      const summary = tracker.getSummary();
      expect(summary).toHaveLength(2);

      const authSummary = summary.find((s) => s.directory === '/repo/src/auth');
      expect(authSummary).toBeDefined();
      expect(authSummary!.file_count).toBe(2);
    });

    it('should deduplicate tracked files', () => {
      const tracker = new StalenessTracker('sess_test');
      tracker.trackFile('/repo/src/auth/jwt.ts');
      tracker.trackFile('/repo/src/auth/jwt.ts');
      expect(tracker.getModifiedFiles('/repo/src/auth')).toHaveLength(1);
    });

    it('should track multiple files at once', () => {
      const tracker = new StalenessTracker('sess_test');
      tracker.trackFiles(['/repo/src/a.ts', '/repo/src/b.ts']);
      expect(tracker.hasModifications()).toBe(true);
      expect(tracker.staleCount).toBe(1);
    });

    it('should reset tracked modifications', () => {
      const tracker = new StalenessTracker('sess_test');
      tracker.trackFile('/repo/src/auth/jwt.ts');
      expect(tracker.hasModifications()).toBe(true);
      tracker.reset();
      expect(tracker.hasModifications()).toBe(false);
    });
  });

  describe('extractModifiedPath', () => {
    it('should extract path from Edit tool', () => {
      expect(extractModifiedPath('Edit', { file_path: '/repo/src/auth/jwt.ts' })).toBe('/repo/src/auth/jwt.ts');
    });

    it('should extract path from Write tool', () => {
      expect(extractModifiedPath('Write', { file_path: '/repo/src/new.ts' })).toBe('/repo/src/new.ts');
    });

    it('should extract path from NotebookEdit tool', () => {
      expect(extractModifiedPath('NotebookEdit', { notebook_path: '/repo/nb.ipynb' })).toBe('/repo/nb.ipynb');
    });

    it('should return null for non-modifying tools', () => {
      expect(extractModifiedPath('Read', { file_path: '/repo/src/auth/jwt.ts' })).toBeNull();
      expect(extractModifiedPath('Grep', { pattern: 'test' })).toBeNull();
    });
  });

  describe('Proposal Generator', () => {
    it('should generate add_key_file proposals for new files', () => {
      writeFileSync(join(tmpDir, 'src', 'auth', 'oauth.ts'), 'export function oauth() {}');
      const proposals = generateProposals(tmpDir, [join(tmpDir, 'src', 'auth')]);

      expect(proposals).toHaveLength(1);
      expect(proposals[0].ctx_path).toBe('src/auth/.ctx');
      const addChanges = proposals[0].changes.filter((c) => c.type === 'add_key_file');
      expect(addChanges.length).toBeGreaterThan(0);
    });

    it('should generate remove_key_file proposals for deleted files', () => {
      unlinkSync(join(tmpDir, 'src', 'auth', 'jwt.ts'));
      const proposals = generateProposals(tmpDir, [join(tmpDir, 'src', 'auth')]);

      expect(proposals).toHaveLength(1);
      const removeChanges = proposals[0].changes.filter((c) => c.type === 'remove_key_file');
      expect(removeChanges).toHaveLength(1);
      expect(removeChanges[0].value).toBe('src/auth/jwt.ts');
    });

    it('should skip directories without .ctx files', () => {
      const proposals = generateProposals(tmpDir, [join(tmpDir, 'src', 'api')]);
      expect(proposals).toHaveLength(0);
    });

    it('should generate proposals for multiple stale directories', () => {
      writeFileSync(join(tmpDir, 'src', 'api', '.ctx'), `
version: 1
summary: "API module"
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
      writeFileSync(join(tmpDir, 'src', 'auth', 'session.ts'), 'export function session() {}');
      writeFileSync(join(tmpDir, 'src', 'api', 'routes.ts'), 'export function routes() {}');

      const proposals = generateProposals(tmpDir, [
        join(tmpDir, 'src', 'auth'),
        join(tmpDir, 'src', 'api'),
      ]);
      expect(proposals).toHaveLength(2);
    });
  });
});
