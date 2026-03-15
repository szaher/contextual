import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeDirectory, analyzeDirectories, generateProposal, generateProposals, applyProposals, parseCtxFile } from '@ctxkit/core';

describe('Bootstrapping Engine (US5)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-bootstrap-'));

    // Create a multi-directory project
    mkdirSync(join(tmpDir, 'src', 'auth'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'api'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'utils'), { recursive: true });
    mkdirSync(join(tmpDir, 'tests'), { recursive: true });

    // Auth module files
    writeFileSync(join(tmpDir, 'src', 'auth', 'index.ts'), 'export * from "./jwt";\nexport * from "./session";');
    writeFileSync(join(tmpDir, 'src', 'auth', 'jwt.ts'), 'export function validateJwt() {}');
    writeFileSync(join(tmpDir, 'src', 'auth', 'session.ts'), 'export function createSession() {}');
    writeFileSync(join(tmpDir, 'src', 'auth', 'middleware.ts'), 'export function authMiddleware() {}');

    // API module files
    writeFileSync(join(tmpDir, 'src', 'api', 'server.ts'), 'import express from "express";\nexport function start() {}');
    writeFileSync(join(tmpDir, 'src', 'api', 'routes.ts'), 'export function routes() {}');
    writeFileSync(join(tmpDir, 'src', 'api', 'handlers.ts'), 'export function handlers() {}');

    // Utils (small — 2 files, below default min_files=3)
    writeFileSync(join(tmpDir, 'src', 'utils', 'helpers.ts'), 'export function format() {}');
    writeFileSync(join(tmpDir, 'src', 'utils', 'logger.ts'), 'export function log() {}');

    // package.json with scripts
    writeFileSync(join(tmpDir, 'src', 'auth', 'package.json'), JSON.stringify({
      name: 'auth',
      scripts: { test: 'vitest', build: 'tsc' },
    }));

    // Test files
    writeFileSync(join(tmpDir, 'tests', 'auth.test.ts'), 'describe("auth", () => {});');
    writeFileSync(join(tmpDir, 'tests', 'api.test.ts'), 'describe("api", () => {});');
    writeFileSync(join(tmpDir, 'tests', 'utils.test.ts'), 'describe("utils", () => {});');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Directory Analyzer', () => {
    it('should detect language from file extensions', () => {
      const result = analyzeDirectory(join(tmpDir, 'src', 'auth'), tmpDir);
      expect(result.primary_language).toBe('typescript');
      expect(result.languages).toContain('typescript');
    });

    it('should identify entry points', () => {
      const result = analyzeDirectory(join(tmpDir, 'src', 'auth'), tmpDir);
      expect(result.entry_points.some((ep) => ep.includes('index.ts'))).toBe(true);
    });

    it('should detect test files', () => {
      const result = analyzeDirectory(join(tmpDir, 'tests'), tmpDir);
      expect(result.test_files.length).toBeGreaterThan(0);
    });

    it('should infer tags from directory name', () => {
      const result = analyzeDirectory(join(tmpDir, 'src', 'auth'), tmpDir);
      expect(result.tags).toContain('auth');
      expect(result.tags).toContain('typescript');
    });

    it('should detect commands from package.json', () => {
      const result = analyzeDirectory(join(tmpDir, 'src', 'auth'), tmpDir);
      expect(result.commands.test).toBe('vitest');
      expect(result.commands.build).toBe('tsc');
    });

    it('should detect server entry point', () => {
      const result = analyzeDirectory(join(tmpDir, 'src', 'api'), tmpDir);
      expect(result.entry_points.some((ep) => ep.includes('server.ts'))).toBe(true);
    });

    it('should count files correctly', () => {
      const result = analyzeDirectory(join(tmpDir, 'src', 'auth'), tmpDir);
      expect(result.file_count).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Directory Analysis (batch)', () => {
    it('should skip directories below min_files threshold', () => {
      const results = analyzeDirectories(tmpDir, { minFiles: 3 });
      const dirs = results.map((r) => r.directory);
      // utils has only 2 files, should be excluded
      expect(dirs.some((d) => d.includes('utils'))).toBe(false);
      // auth has 4+ files, should be included
      expect(dirs.some((d) => d.includes('auth'))).toBe(true);
    });

    it('should skip existing .ctx files when skipExisting is true', () => {
      // Create a .ctx file for auth
      writeFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'version: 1\nsummary: "existing"');

      const results = analyzeDirectories(tmpDir, { skipExisting: true, minFiles: 3 });
      const dirs = results.map((r) => r.directory);
      expect(dirs.some((d) => d.includes('auth'))).toBe(false);
    });

    it('should include existing .ctx files when skipExisting is false', () => {
      writeFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'version: 1\nsummary: "existing"');

      const results = analyzeDirectories(tmpDir, { skipExisting: false, minFiles: 3 });
      const dirs = results.map((r) => r.directory);
      expect(dirs.some((d) => d.includes('auth'))).toBe(true);
    });
  });

  describe('.ctx Generator', () => {
    it('should generate valid .ctx from analysis result', () => {
      const analysis = analyzeDirectory(join(tmpDir, 'src', 'auth'), tmpDir);
      const proposal = generateProposal(analysis);

      expect(proposal.path).toContain('auth/.ctx');
      expect(proposal.summary).toBeTruthy();
      expect(proposal.key_files.length).toBeGreaterThan(0);
      expect(proposal.tags).toContain('typescript');
      expect(proposal.language).toBe('typescript');
      expect(proposal.token_estimate).toBeGreaterThan(0);
    });

    it('should include commands in proposal', () => {
      const analysis = analyzeDirectory(join(tmpDir, 'src', 'auth'), tmpDir);
      const proposal = generateProposal(analysis);
      expect(proposal.commands.test).toBe('vitest');
    });

    it('should generate multiple proposals', () => {
      const results = analyzeDirectories(tmpDir, { minFiles: 3 });
      const proposals = generateProposals(results);
      expect(proposals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Proposal Application', () => {
    it('should write .ctx files from proposals', () => {
      const results = analyzeDirectories(tmpDir, { minFiles: 3 });
      const proposals = generateProposals(results);
      const written = applyProposals(tmpDir, proposals);

      expect(written.length).toBeGreaterThan(0);

      for (const path of written) {
        const fullPath = join(tmpDir, path);
        expect(existsSync(fullPath)).toBe(true);

        // Verify it's valid YAML
        const content = readFileSync(fullPath, 'utf-8');
        const { ctx } = parseCtxFile(content);
        expect(ctx.version).toBe(1);
        expect(ctx.summary).toBeTruthy();
      }
    });

    it('should dry-run by not calling applyProposals', () => {
      const results = analyzeDirectories(tmpDir, { minFiles: 3 });
      const proposals = generateProposals(results);

      // In dry-run mode, just inspect proposals without writing
      expect(proposals.length).toBeGreaterThan(0);
      for (const p of proposals) {
        expect(existsSync(join(tmpDir, p.path))).toBe(false);
      }
    });
  });
});
