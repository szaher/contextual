import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseCtxFile, serializeCtxFile, bumpVersion, generateDiffSummary, archiveHistory, readArchivedHistory, readMergedHistory, diffCtxVersions } from '@ctxkit/core';
import type { CtxFile } from '@ctxkit/core';

describe('Versioning & History (US2)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-versioning-'));
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

  describe('Version bumping', () => {
    it('should increment version and create history entry', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(content);

      const bumped = bumpVersion(ctx, {
        author: 'agent:claude-opus',
        reason: 'Added new key file',
        session_id: 'sess_test123',
      });

      expect(bumped.version).toBe(2);
      expect(bumped._history).toHaveLength(1);
      expect(bumped._history![0].version).toBe(2);
      expect(bumped._history![0].author).toBe('agent:claude-opus');
      expect(bumped._history![0].session_id).toBe('sess_test123');
      expect(bumped._history![0].checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('should prepend new entries (newest first)', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(content);

      const v2 = bumpVersion(ctx, { author: 'agent:opus', reason: 'First change' });
      const v3 = bumpVersion(v2, { author: 'agent:sonnet', reason: 'Second change' });

      expect(v3.version).toBe(3);
      expect(v3._history).toHaveLength(2);
      expect(v3._history![0].version).toBe(3); // newest first
      expect(v3._history![1].version).toBe(2);
    });
  });

  describe('Diff summary generation', () => {
    it('should generate correct diff summary', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: before } = parseCtxFile(content);

      const after: CtxFile = {
        ...before,
        key_files: [
          ...before.key_files,
          { path: 'src/auth/oauth.ts', purpose: 'OAuth2', tags: ['auth'], verified_at: '', locked: false, owner: null },
        ],
        tags: [...before.tags, 'oauth2'],
      };

      const summary = generateDiffSummary(before, after);
      expect(summary).toContain('+1 key_files');
      expect(summary).toContain('+1 tags');
    });
  });

  describe('History archiving', () => {
    it('should archive oldest entries when exceeding 20', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      let { ctx } = parseCtxFile(content);

      // Create 25 history entries
      for (let i = 0; i < 25; i++) {
        ctx = bumpVersion(ctx, {
          author: 'agent:opus',
          reason: `Change ${i + 1}`,
          diff_summary: `+1 key_files`,
        });
      }

      expect(ctx._history).toHaveLength(25);
      expect(ctx.version).toBe(26);

      // Archive
      const archived = archiveHistory(ctx, 'src/auth/.ctx', tmpDir);
      expect(archived._history).toHaveLength(20);

      // Check archive file was created
      const archivedEntries = readArchivedHistory('src/auth/.ctx', tmpDir);
      expect(archivedEntries).toHaveLength(5);
    });

    it('should read merged history from inline + archive', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      let { ctx } = parseCtxFile(content);

      // Create and archive
      for (let i = 0; i < 25; i++) {
        ctx = bumpVersion(ctx, { author: 'agent:opus', reason: `Change ${i + 1}` });
      }

      ctx = archiveHistory(ctx, 'src/auth/.ctx', tmpDir);

      const merged = readMergedHistory(ctx, 'src/auth/.ctx', tmpDir);
      expect(merged).toHaveLength(25);
    });
  });

  describe('Structured diff', () => {
    it('should produce correct CtxDiff for added key_files', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx: before } = parseCtxFile(content);

      const after: CtxFile = {
        ...before,
        key_files: [
          ...before.key_files,
          { path: 'src/auth/oauth.ts', purpose: 'OAuth2', tags: [], verified_at: '', locked: false, owner: null },
        ],
      };

      const diff = diffCtxVersions(before, after, 1, 2);
      expect(diff.from_version).toBe(1);
      expect(diff.to_version).toBe(2);

      const kfAdded = diff.sections.find((s) => s.section === 'key_files' && s.type === 'added');
      expect(kfAdded).toBeDefined();
      expect(kfAdded!.entries).toContain('src/auth/oauth.ts');
    });
  });

  describe('V1 file upgrade on first write', () => {
    it('should initialize _history on first v2 write', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(content);

      expect(ctx.version).toBe(1);
      expect(ctx._history).toBeUndefined();

      const bumped = bumpVersion(ctx, {
        author: 'developer:szaher',
        reason: 'First v2 write',
      });

      expect(bumped.version).toBe(2);
      expect(bumped._history).toHaveLength(1);
    });
  });

  describe('Serialization round-trip', () => {
    it('should preserve _history through serialize/parse cycle', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(content);

      const bumped = bumpVersion(ctx, {
        author: 'agent:opus',
        reason: 'Test round-trip',
        session_id: 'sess_abc',
        diff_summary: '+1 key_files',
      });

      const serialized = serializeCtxFile(bumped);
      const { ctx: parsed } = parseCtxFile(serialized);

      expect(parsed.version).toBe(2);
      expect(parsed._history).toHaveLength(1);
      expect(parsed._history![0].author).toBe('agent:opus');
      expect(parsed._history![0].session_id).toBe('sess_abc');
    });
  });
});
