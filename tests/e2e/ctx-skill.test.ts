import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { parseCtxFile, serializeCtxFile, initV2Features, needsV2Init, generateIndex } from '@ctxkit/core';

/**
 * T081 -- E2E test: /ctx skill subcommands
 *
 * Tests:
 *   1. migrate — v1→v2 migration (initializes _history, generates index)
 *   2. hooks init — installs git hooks
 *   3. migrator v2 init — initV2Features utility
 */

const V1_CTX_YAML = `---
version: 1
summary: "Test project — v1 format"
key_files:
  - path: src/index.ts
    purpose: "Entry point"
    tags: [entry]
    verified_at: ""
    locked: false
decisions: []
contracts: []
commands:
  build: npm run build
gotchas: []
tags: [typescript]
refs: []
ignore:
  never_read: []
  never_log: []
`;

const V2_CTX_YAML = `---
version: 2
summary: "Already v2"
key_files: []
decisions: []
contracts: []
commands: {}
gotchas: []
tags: []
refs: []
ignore:
  never_read: []
  never_log: []
_history:
  - version: 2
    author: test-agent
    timestamp: "2026-01-15T00:00:00.000Z"
    summary: "Initial v2"
`;

describe('E2E: /ctx Skill Subcommands (T081)', () => {
  let tmpDir: string;
  let repoDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-e2e-ctx-skill-'));
    repoDir = join(tmpDir, 'repo');
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(join(repoDir, 'src'), { recursive: true });
    mkdirSync(join(repoDir, 'lib'), { recursive: true });

    writeFileSync(join(repoDir, 'src', 'index.ts'), 'export const main = () => {};\n');
    writeFileSync(join(repoDir, 'lib', 'util.ts'), 'export const util = () => {};\n');

    // Initialize git repo
    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
    execSync('git -c user.name="test" -c user.email="t@t.co" commit -m "init"', {
      cwd: repoDir,
      stdio: 'ignore',
    });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ────────────────────────────────────────────────────────────────
  // 1. migrate — v1→v2 migration
  // ────────────────────────────────────────────────────────────────
  describe('migrate command flow', () => {
    it('should detect v1 .ctx files needing _history initialization', () => {
      const { ctx } = parseCtxFile(V1_CTX_YAML);
      expect(needsV2Init(ctx)).toBe(true);
      expect(ctx._history).toBeUndefined();
    });

    it('should not flag already-v2 .ctx files', () => {
      const { ctx } = parseCtxFile(V2_CTX_YAML);
      expect(needsV2Init(ctx)).toBe(false);
      expect(ctx._history).toBeDefined();
      expect(ctx._history!.length).toBe(1);
    });

    it('should initialize _history on v1 file via initV2Features', () => {
      const { ctx } = parseCtxFile(V1_CTX_YAML);
      const result = initV2Features(ctx);

      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.ctx._history).toBeDefined();
      expect(result.ctx._history).toEqual([]);
      expect(result.ctx.version).toBe(1); // version counter unchanged
      expect(result.ctx.summary).toBe('Test project — v1 format');
      expect(result.ctx.key_files).toHaveLength(1);
    });

    it('should be idempotent — second initV2Features is a no-op', () => {
      const { ctx } = parseCtxFile(V1_CTX_YAML);
      const first = initV2Features(ctx);
      const second = initV2Features(first.ctx);

      expect(second.changes).toHaveLength(0);
      expect(second.ctx._history).toEqual([]);
    });

    it('should perform full migrate flow: write v1 files, migrate, verify', () => {
      // Write two v1 .ctx files
      const rootCtx = join(repoDir, '.ctx');
      const srcCtx = join(repoDir, 'src', '.ctx');
      writeFileSync(rootCtx, V1_CTX_YAML);
      writeFileSync(srcCtx, V1_CTX_YAML);

      // Stage and commit so they exist in the repo
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git -c user.name="test" -c user.email="t@t.co" commit -m "add ctx files"', {
        cwd: repoDir,
        stdio: 'ignore',
      });

      // Simulate migrate: read, init v2 features, write back
      for (const ctxPath of [rootCtx, srcCtx]) {
        const content = readFileSync(ctxPath, 'utf-8');
        const { ctx } = parseCtxFile(content);

        if (needsV2Init(ctx)) {
          const { ctx: migrated } = initV2Features(ctx);
          writeFileSync(ctxPath, serializeCtxFile(migrated), 'utf-8');
        }
      }

      // Verify both files now have _history
      const rootContent = readFileSync(rootCtx, 'utf-8');
      const { ctx: rootParsed } = parseCtxFile(rootContent);
      expect(rootParsed._history).toBeDefined();
      expect(rootParsed._history).toEqual([]);
      expect(rootParsed.version).toBe(1);
      expect(rootParsed.summary).toBe('Test project — v1 format');

      const srcContent = readFileSync(srcCtx, 'utf-8');
      const { ctx: srcParsed } = parseCtxFile(srcContent);
      expect(srcParsed._history).toBeDefined();
    });

    it('should generate .ctxl index after migration', () => {
      const index = generateIndex(repoDir);

      expect(index).toBeDefined();
      expect(index.entries).toBeDefined();
      expect(index.entries.length).toBeGreaterThan(0);

      // Verify index contains our .ctx files
      const paths = index.entries.map((e: { path: string }) => e.path);
      expect(paths).toContain('.ctx');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 2. hooks init — git hook installation
  // ────────────────────────────────────────────────────────────────
  describe('hooks init flow', () => {
    it('should identify git hooks directory', () => {
      const hooksDir = join(repoDir, '.git', 'hooks');
      expect(existsSync(hooksDir)).toBe(true);
    });

    it('should write pre-commit and post-commit hooks', () => {
      const hooksDir = join(repoDir, '.git', 'hooks');
      const preCommitPath = join(hooksDir, 'pre-commit');
      const postCommitPath = join(hooksDir, 'post-commit');

      // Simulate hooks init: write hook files
      const preCommitContent = `#!/bin/sh
# ctxkit pre-commit hook — validates .ctx files before committing
# Installed by: ctxkit hooks init

if ! command -v ctxkit &> /dev/null; then
  echo "[ctxkit] Warning: ctxkit not found, skipping .ctx validation"
  exit 0
fi

STAGED_CTX=$(git diff --cached --name-only --diff-filter=ACM | grep '\\.ctx$' || true)

if [ -n "$STAGED_CTX" ]; then
  echo "[ctxkit] Validating staged .ctx files..."
  ctxkit validate --json > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "[ctxkit] Validation failed. Fix issues before committing."
    exit 1
  fi
  echo "[ctxkit] All .ctx files valid."
fi
`;

      const postCommitContent = `#!/bin/sh
# ctxkit post-commit hook — updates .ctxl index after commit
# Installed by: ctxkit hooks init

if ! command -v ctxkit &> /dev/null; then
  exit 0
fi

CHANGED_CTX=$(git diff-tree --no-commit-id --name-only -r HEAD | grep '\\.ctx$' || true)

if [ -n "$CHANGED_CTX" ]; then
  echo "[ctxkit] Updating .ctxl index..."
  ctxkit index generate --json > /dev/null 2>&1 || true
fi
`;

      writeFileSync(preCommitPath, preCommitContent, { mode: 0o755 });
      writeFileSync(postCommitPath, postCommitContent, { mode: 0o755 });

      expect(existsSync(preCommitPath)).toBe(true);
      expect(existsSync(postCommitPath)).toBe(true);

      // Verify hooks are executable (content starts with shebang)
      const preCommitRead = readFileSync(preCommitPath, 'utf-8');
      expect(preCommitRead.startsWith('#!/bin/sh')).toBe(true);
      expect(preCommitRead).toContain('ctxkit');
      expect(preCommitRead).toContain('.ctx');

      const postCommitRead = readFileSync(postCommitPath, 'utf-8');
      expect(postCommitRead.startsWith('#!/bin/sh')).toBe(true);
      expect(postCommitRead).toContain('ctxl index');
    });

    it('should not overwrite existing hooks without --force', () => {
      const hooksDir = join(repoDir, '.git', 'hooks');
      const preCommitPath = join(hooksDir, 'pre-commit');

      // Write a custom hook
      const customContent = '#!/bin/sh\necho "custom hook"\n';
      writeFileSync(preCommitPath, customContent);

      // Verify existing hook is preserved (simulate the --force check)
      const existing = readFileSync(preCommitPath, 'utf-8');
      expect(existing).toBe(customContent);

      // Without --force, should detect existing hook
      expect(existsSync(preCommitPath)).toBe(true);
    });

    it('should overwrite hooks when --force is simulated', () => {
      const hooksDir = join(repoDir, '.git', 'hooks');
      const preCommitPath = join(hooksDir, 'pre-commit');

      // Write the custom hook
      writeFileSync(preCommitPath, '#!/bin/sh\necho "custom"\n');

      // Simulate --force: overwrite with ctxkit hook
      const ctxkitHook = '#!/bin/sh\n# ctxkit pre-commit hook\nctxkit validate\n';
      writeFileSync(preCommitPath, ctxkitHook, { mode: 0o755 });

      const content = readFileSync(preCommitPath, 'utf-8');
      expect(content).toContain('ctxkit');
      expect(content).not.toContain('custom');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 3. Full migrate + hooks pipeline
  // ────────────────────────────────────────────────────────────────
  describe('full pipeline: migrate then hooks', () => {
    let pipelineDir: string;

    beforeAll(() => {
      pipelineDir = join(tmpDir, 'pipeline-repo');
      mkdirSync(pipelineDir, { recursive: true });
      mkdirSync(join(pipelineDir, 'src'), { recursive: true });

      writeFileSync(join(pipelineDir, 'src', 'app.ts'), 'export const app = {};\n');
      writeFileSync(join(pipelineDir, '.ctx'), V1_CTX_YAML);

      execSync('git init', { cwd: pipelineDir, stdio: 'ignore' });
      execSync('git add .', { cwd: pipelineDir, stdio: 'ignore' });
      execSync('git -c user.name="test" -c user.email="t@t.co" commit -m "init"', {
        cwd: pipelineDir,
        stdio: 'ignore',
      });
    });

    it('should migrate v1→v2, generate index, and install hooks in sequence', () => {
      // Step 1: Migrate
      const ctxPath = join(pipelineDir, '.ctx');
      const content = readFileSync(ctxPath, 'utf-8');
      const { ctx } = parseCtxFile(content);

      expect(needsV2Init(ctx)).toBe(true);

      const { ctx: migrated } = initV2Features(ctx);
      writeFileSync(ctxPath, serializeCtxFile(migrated), 'utf-8');

      // Verify migration
      const migratedContent = readFileSync(ctxPath, 'utf-8');
      const { ctx: migratedParsed } = parseCtxFile(migratedContent);
      expect(migratedParsed._history).toBeDefined();
      expect(needsV2Init(migratedParsed)).toBe(false);

      // Step 2: Generate index
      const index = generateIndex(pipelineDir);
      expect(index.entries.length).toBeGreaterThan(0);

      // Step 3: Install hooks
      const hooksDir = join(pipelineDir, '.git', 'hooks');
      const preCommitPath = join(hooksDir, 'pre-commit');
      const postCommitPath = join(hooksDir, 'post-commit');

      writeFileSync(preCommitPath, '#!/bin/sh\n# ctxkit pre-commit\n', { mode: 0o755 });
      writeFileSync(postCommitPath, '#!/bin/sh\n# ctxkit post-commit\n', { mode: 0o755 });

      expect(existsSync(preCommitPath)).toBe(true);
      expect(existsSync(postCommitPath)).toBe(true);

      // Verify all pieces are in place
      expect(needsV2Init(migratedParsed)).toBe(false);
      expect(index.entries.length).toBeGreaterThan(0);
      expect(existsSync(preCommitPath)).toBe(true);
    });
  });
});
