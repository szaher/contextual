import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  scoreLocality,
  scoreRecency,
  scoreTags,
  scoreEntries,
} from '@ctxl/core';
import type { CtxFile } from '@ctxl/core';

describe('Scoring Bug Fixes (US2)', () => {
  describe('Locality scoring (T015)', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-locality-'));
      // Create directory structure
      mkdirSync(join(tmpDir, 'src', 'auth'), { recursive: true });
      mkdirSync(join(tmpDir, 'src', 'utils'), { recursive: true });
      mkdirSync(join(tmpDir, 'lib'), { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should score ancestor .ctx higher than sibling at same depth', () => {
      // Working dir: <root>/src/auth
      // Ancestor .ctx: <root>/.ctx (2 levels up)
      // Sibling .ctx: <root>/src/utils/.ctx (same depth = 2 directory levels away)
      const workingDir = join(tmpDir, 'src', 'auth');

      const ancestorScore = scoreLocality(workingDir, '.ctx', tmpDir);
      const siblingScore = scoreLocality(workingDir, 'src/utils/.ctx', tmpDir);

      // Ancestor is a parent path (upCount > 0), so it should get a bonus
      // giving it a higher score than a sibling at the same depth
      expect(ancestorScore).toBeGreaterThan(siblingScore);
    });

    it('should return 1.0 for same directory', () => {
      const score = scoreLocality(tmpDir, '.ctx', tmpDir);
      expect(score).toBe(1.0);
    });

    it('should decrease with directory distance', () => {
      const workingDir = join(tmpDir, 'src', 'auth');
      const sameDir = scoreLocality(workingDir, 'src/auth/.ctx', tmpDir);
      const oneUp = scoreLocality(workingDir, 'src/.ctx', tmpDir);
      const twoUp = scoreLocality(workingDir, '.ctx', tmpDir);

      expect(sameDir).toBeGreaterThan(oneUp);
      expect(oneUp).toBeGreaterThan(twoUp);
    });
  });

  describe('Recency scoring (T016-T018)', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-recency-'));
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should produce distinct scores for 1, 30, and 180 days ago', () => {
      const now = new Date();

      const oneDay = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const halfYear = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

      const score1 = scoreRecency(oneDay);
      const score30 = scoreRecency(thirtyDays);
      const score180 = scoreRecency(halfYear);

      // All three should be distinct
      expect(score1).not.toBe(score30);
      expect(score30).not.toBe(score180);
      expect(score1).not.toBe(score180);

      // Should be in descending order (more recent = higher score)
      expect(score1).toBeGreaterThan(score30);
      expect(score30).toBeGreaterThan(score180);

      // 1 day ago should be close to 1.0
      expect(score1).toBeGreaterThan(0.95);

      // 30 days is the half-life, so score should be around 0.65
      // (FLOOR + (1-FLOOR) * 0.5 = 0.3 + 0.35 = 0.65)
      expect(score30).toBeGreaterThan(0.6);
      expect(score30).toBeLessThan(0.7);

      // 180 days ago should be near floor
      expect(score180).toBeGreaterThanOrEqual(0.3);
      expect(score180).toBeLessThan(0.35);
    });

    it('should return floor (0.3) for empty verified_at', () => {
      expect(scoreRecency('')).toBe(0.3);
      expect(scoreRecency('  ')).toBe(0.3);
    });

    it('should resolve git hashes when repoRoot is provided', () => {
      // Create a commit and get its hash
      writeFileSync(join(tmpDir, 'file.txt'), 'content');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });
      const hash = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

      // Score with the git hash — commit was just made, so score should be high
      const score = scoreRecency(hash, tmpDir);
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return floor for unresolvable git hash without repoRoot', () => {
      const score = scoreRecency('abc1234');
      expect(score).toBe(0.3);
    });

    it('should return floor for unrecognized format', () => {
      const score = scoreRecency('not-a-date-or-hash');
      expect(score).toBe(0.3);
    });

    it('should parse ISO 8601 dates', () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const score = scoreRecency(recentDate);
      expect(score).toBeGreaterThan(0.9);
    });
  });

  describe('Tag scoring caps (T020)', () => {
    it('should cap tag "auth" with related keywords reasonably', () => {
      // The bug: substring matching accumulated scores without per-tag caps.
      // Tag "auth" would match "authorization", "authenticate", "authentication"
      // via partial match, previously accumulating 1.5 partial match for one tag.
      const keywords = ['authorization', 'authenticate', 'authentication'];
      const tags = ['auth'];

      const score = scoreTags(keywords, tags);

      // With the fix, "auth" gets at most 0.5 (one partial match capped)
      // Score = 0.5 / 1 tag = 0.5
      expect(score).toBeLessThanOrEqual(0.5);
      expect(score).toBeGreaterThan(0);
    });

    it('should not double-count exact + partial match for same tag', () => {
      // If "auth" is both an exact keyword match AND a substring of "authorization",
      // it should only count the exact match (+1.0), not both (+1.5)
      const keywords = ['auth', 'authorization'];
      const tags = ['auth'];

      const score = scoreTags(keywords, tags);

      // Exact match gives 1.0 / 1 tag = 1.0
      expect(score).toBe(1.0);
    });

    it('should handle multiple tags with mixed match types', () => {
      const keywords = ['auth', 'database'];
      const tags = ['auth', 'data', 'logging'];

      const score = scoreTags(keywords, tags);

      // "auth" exact match: 1.0
      // "data" no exact match, partial: "database".includes("data") -> 0.5
      // "logging" no match: 0
      // Total: 1.5 / 3 tags = 0.5
      expect(score).toBe(0.5);
    });

    it('should return 0 when no tags match', () => {
      const keywords = ['frontend', 'react'];
      const tags = ['backend', 'database'];

      const score = scoreTags(keywords, tags);
      expect(score).toBe(0.0);
    });

    it('should return 0 for empty inputs', () => {
      expect(scoreTags([], ['auth'])).toBe(0.0);
      expect(scoreTags(['auth'], [])).toBe(0.0);
    });
  });

  describe('scoreEntries integration with new scoring', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-score-entries-'));
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should score entries using updated scoring functions', () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const ctx: CtxFile = {
        version: 1,
        summary: 'Test project',
        key_files: [
          {
            path: 'src/auth.ts',
            purpose: 'Auth module',
            tags: ['auth', 'security'],
            verified_at: recentDate,
            locked: false,
            owner: null,
          },
          {
            path: 'src/utils.ts',
            purpose: 'Utilities',
            tags: ['utils'],
            verified_at: '',
            locked: false,
            owner: null,
          },
        ],
        contracts: [],
        decisions: [],
        commands: {},
        gotchas: [],
        tags: ['test'],
        refs: [],
        ignore: { never_read: [], never_log: [] },
      };

      const entries = scoreEntries(
        [{ path: '.ctx', ctx }],
        {
          workingDir: tmpDir,
          repoRoot: tmpDir,
          requestText: 'fix the auth security issue',
        },
      );

      // auth.ts should score higher: tag match + recent verified_at
      const authEntry = entries.find((e) => e.entry_id === 'src/auth.ts');
      const utilsEntry = entries.find((e) => e.entry_id === 'src/utils.ts');

      expect(authEntry).toBeDefined();
      expect(utilsEntry).toBeDefined();
      expect(authEntry!.score).toBeGreaterThan(utilsEntry!.score);
    });
  });
});
