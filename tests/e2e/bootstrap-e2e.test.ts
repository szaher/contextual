import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeDirectories, generateProposals, applyProposals, parseCtxFile } from '@ctxkit/core';

describe('Bootstrap E2E (US5)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-bootstrap-e2e-'));

    // Create project structure
    mkdirSync(join(tmpDir, 'src', 'models'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'services'), { recursive: true });

    // Models
    writeFileSync(join(tmpDir, 'src', 'models', 'index.ts'), 'export * from "./user";');
    writeFileSync(join(tmpDir, 'src', 'models', 'user.ts'), 'export interface User { id: string; name: string; }');
    writeFileSync(join(tmpDir, 'src', 'models', 'post.ts'), 'export interface Post { id: string; title: string; }');

    // Services
    writeFileSync(join(tmpDir, 'src', 'services', 'index.ts'), 'export * from "./user-service";');
    writeFileSync(join(tmpDir, 'src', 'services', 'user-service.ts'), 'export class UserService {}');
    writeFileSync(join(tmpDir, 'src', 'services', 'post-service.ts'), 'export class PostService {}');

    // Root package.json
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      scripts: { test: 'vitest', build: 'tsc' },
    }));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should bootstrap a complete project (dry-run → apply flow)', () => {
    // Step 1: Dry-run — analyze and get proposals
    const results = analyzeDirectories(tmpDir, { minFiles: 3 });
    const proposals = generateProposals(results);

    expect(proposals.length).toBeGreaterThan(0);

    // Verify proposals have correct structure
    for (const proposal of proposals) {
      expect(proposal.path).toMatch(/\.ctx$/);
      expect(proposal.summary).toBeTruthy();
      expect(proposal.key_files.length).toBeGreaterThan(0);
      expect(proposal.language).toBe('typescript');
      expect(proposal.token_estimate).toBeGreaterThan(0);
    }

    // Step 2: Apply proposals
    const written = applyProposals(tmpDir, proposals);
    expect(written.length).toBe(proposals.length);

    // Step 3: Verify written files
    for (const path of written) {
      const fullPath = join(tmpDir, path);
      expect(existsSync(fullPath)).toBe(true);

      const content = readFileSync(fullPath, 'utf-8');
      const { ctx } = parseCtxFile(content);

      expect(ctx.version).toBe(1);
      expect(ctx.summary).toBeTruthy();
      expect(ctx.key_files.length).toBeGreaterThan(0);
      expect(ctx.tags.length).toBeGreaterThan(0);
    }
  });

  it('should skip directories with existing .ctx when re-bootstrapping', () => {
    // First bootstrap
    const results1 = analyzeDirectories(tmpDir, { minFiles: 3 });
    const proposals1 = generateProposals(results1);
    applyProposals(tmpDir, proposals1);

    // Second bootstrap with skipExisting
    const results2 = analyzeDirectories(tmpDir, { minFiles: 3, skipExisting: true });
    expect(results2).toHaveLength(0);
  });

  it('should respect min-files threshold', () => {
    // With min_files=10, nothing should qualify
    const results = analyzeDirectories(tmpDir, { minFiles: 10 });
    expect(results).toHaveLength(0);

    // With min_files=2, more directories should qualify
    const results2 = analyzeDirectories(tmpDir, { minFiles: 2 });
    expect(results2.length).toBeGreaterThan(0);
  });
});
