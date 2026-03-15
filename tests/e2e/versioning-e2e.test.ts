import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { parseCtxFile, serializeCtxFile, needsV2Init, initV2Features, initV2FeaturesFile, generateIndex, writeIndex, bumpVersion, computeChecksum } from '@ctxkit/core';

/**
 * T119 -- E2E test: Full v1→v2 migration flow
 *
 * Tests:
 *   1. Dry-run migration previews changes without writing
 *   2. Full migration initializes _history and generates index
 *   3. Migration is idempotent — second run is a no-op
 *   4. v1 workflows still function after migration
 *   5. Version bumping works on migrated files
 */

const V1_ROOT_CTX = `---
version: 1
summary: "Root project context"
key_files:
  - path: src/index.ts
    purpose: "Entry point"
    tags: [entry]
    verified_at: ""
    locked: false
decisions:
  - id: adr-001
    title: Use TypeScript
    status: accepted
    date: "2026-01-01"
    rationale: Type safety
    alternatives:
      - name: JavaScript
        reason_rejected: No type safety
    verified_at: ""
    locked: false
contracts: []
commands:
  build: npm run build
  test: npm test
gotchas:
  - text: "Config env vars override file values"
    tags: [config]
    verified_at: ""
    locked: false
tags: [typescript, nodejs]
refs: []
ignore:
  never_read: []
  never_log: []
`;

const V1_SRC_CTX = `---
version: 1
summary: "Source code context"
key_files:
  - path: app.ts
    purpose: "Application"
    tags: [app]
    verified_at: ""
    locked: false
decisions: []
contracts: []
commands: {}
gotchas: []
tags: [src]
refs:
  - target: ../.ctx
    sections: [decisions]
    reason: "Inherits project decisions"
ignore:
  never_read: []
  never_log: []
`;

describe('E2E: v1→v2 Migration Flow (T119)', () => {
  let tmpDir: string;
  let repoDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-e2e-migration-'));
    repoDir = join(tmpDir, 'repo');
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(join(repoDir, 'src'), { recursive: true });

    writeFileSync(join(repoDir, 'src', 'index.ts'), 'export const main = () => {};\n');
    writeFileSync(join(repoDir, 'src', 'app.ts'), 'export const app = {};\n');
    writeFileSync(join(repoDir, '.ctx'), V1_ROOT_CTX);
    writeFileSync(join(repoDir, 'src', '.ctx'), V1_SRC_CTX);

    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
    execSync('git -c user.name="test" -c user.email="t@t.co" commit -m "init v1 repo"', {
      cwd: repoDir,
      stdio: 'ignore',
    });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('dry-run migration', () => {
    it('should detect v1 files needing migration', () => {
      const rootContent = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootContent);
      expect(needsV2Init(ctx)).toBe(true);
    });

    it('should preview changes without writing', () => {
      const rootContent = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootContent);
      const result = initV2Features(ctx);

      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.ctx._history).toBeDefined();

      // Original file should be unchanged
      const afterContent = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      expect(afterContent).toBe(rootContent);
    });
  });

  describe('full migration', () => {
    it('should migrate all .ctx files and generate index', () => {
      // Migrate root .ctx
      const rootResult = initV2FeaturesFile(join(repoDir, '.ctx'));
      expect(rootResult.initialized).toBe(true);
      expect(rootResult.changes.length).toBeGreaterThan(0);

      // Migrate src .ctx
      const srcResult = initV2FeaturesFile(join(repoDir, 'src', '.ctx'));
      expect(srcResult.initialized).toBe(true);

      // Verify files
      const rootCtx = parseCtxFile(readFileSync(join(repoDir, '.ctx'), 'utf-8')).ctx;
      expect(rootCtx._history).toBeDefined();
      expect(rootCtx._history).toEqual([]);
      expect(rootCtx.version).toBe(1);
      expect(rootCtx.summary).toBe('Root project context');

      const srcCtx = parseCtxFile(readFileSync(join(repoDir, 'src', '.ctx'), 'utf-8')).ctx;
      expect(srcCtx._history).toBeDefined();
      expect(srcCtx._history).toEqual([]);

      // Generate index
      const index = generateIndex(repoDir);
      writeIndex(repoDir, index);

      expect(existsSync(join(repoDir, '.ctxl'))).toBe(true);
      expect(index.entries.length).toBe(2);
    });
  });

  describe('idempotency', () => {
    it('should be a no-op on second migration', () => {
      const rootResult = initV2FeaturesFile(join(repoDir, '.ctx'));
      expect(rootResult.initialized).toBe(false);
      expect(rootResult.changes).toHaveLength(0);

      const srcResult = initV2FeaturesFile(join(repoDir, 'src', '.ctx'));
      expect(srcResult.initialized).toBe(false);
    });
  });

  describe('v1 workflows after migration', () => {
    it('should still parse migrated .ctx files correctly', () => {
      const rootContent = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootContent);

      expect(ctx.version).toBe(1);
      expect(ctx.summary).toBe('Root project context');
      expect(ctx.key_files).toHaveLength(1);
      expect(ctx.decisions).toHaveLength(1);
      expect(ctx.gotchas).toHaveLength(1);
      expect(ctx.tags).toEqual(['typescript', 'nodejs']);
    });

    it('should still serialize migrated .ctx files correctly', () => {
      const rootContent = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootContent);

      const serialized = serializeCtxFile(ctx);
      const reparsed = parseCtxFile(serialized).ctx;

      expect(reparsed.version).toBe(ctx.version);
      expect(reparsed.summary).toBe(ctx.summary);
      expect(reparsed.key_files).toHaveLength(ctx.key_files.length);
      expect(reparsed.decisions).toHaveLength(ctx.decisions.length);
      expect(reparsed._history).toEqual(ctx._history);
    });

    it('should compute checksums on migrated files', () => {
      const rootContent = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootContent);

      const checksum = computeChecksum(ctx);
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);

      // Same input = same checksum
      const checksum2 = computeChecksum(ctx);
      expect(checksum2).toBe(checksum);
    });
  });

  describe('version bumping on migrated files', () => {
    it('should bump version and add history entry', () => {
      const rootContent = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootContent);

      const bumped = bumpVersion(ctx, {
        author: 'test-agent',
        reason: 'Added new key file',
        diff_summary: '+1 key_files',
      });

      expect(bumped.version).toBe(2);
      expect(bumped._history).toBeDefined();
      expect(bumped._history!.length).toBe(1);
      expect(bumped._history![0].version).toBe(2);
      expect(bumped._history![0].author).toBe('test-agent');
      expect(bumped._history![0].reason).toBe('Added new key file');
      expect(bumped._history![0].diff_summary).toBe('+1 key_files');
    });

    it('should support multiple version bumps', () => {
      const rootContent = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootContent);

      const v2 = bumpVersion(ctx, {
        author: 'agent-1',
        reason: 'First change',
      });

      const v3 = bumpVersion(v2, {
        author: 'agent-2',
        reason: 'Second change',
      });

      expect(v3.version).toBe(3);
      expect(v3._history!.length).toBe(2);
      // Newest first
      expect(v3._history![0].version).toBe(3);
      expect(v3._history![0].author).toBe('agent-2');
      expect(v3._history![1].version).toBe(2);
      expect(v3._history![1].author).toBe('agent-1');
    });
  });
});
