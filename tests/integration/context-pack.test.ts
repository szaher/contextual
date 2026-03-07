import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  buildContextPack,
  mergeCtxHierarchy,
  ReasonCode,
} from '@ctxl/core';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/repos');

describe('Context Pack Assembly Integration', () => {
  describe('Simple repo (root .ctx only)', () => {
    const repoRoot = resolve(FIXTURES_DIR, 'simple');

    it('should build a context pack from root .ctx', () => {
      const result = buildContextPack({
        workingDir: repoRoot,
        repoRoot,
        requestText: 'fix the config loader',
        budgetTokens: 4000,
      });

      expect(result.pack.version).toBe(1);
      expect(result.pack.items.length).toBeGreaterThan(0);
      expect(result.pack.total_tokens).toBeLessThanOrEqual(4000);
      expect(result.pack.budget_tokens).toBe(4000);
    });

    it('should include config-related entries with TAG_MATCH', () => {
      const result = buildContextPack({
        workingDir: repoRoot,
        repoRoot,
        requestText: 'fix the config loader',
        budgetTokens: 4000,
      });

      const configEntry = result.pack.items.find(
        (item) => item.entry_id === 'src/config.ts',
      );
      expect(configEntry).toBeDefined();
      expect(configEntry?.reason_codes).toContain(ReasonCode.TAG_MATCH);
    });

    it('should include pinned decisions', () => {
      const result = buildContextPack({
        workingDir: repoRoot,
        repoRoot,
        requestText: 'fix the config loader',
        budgetTokens: 4000,
      });

      const decision = result.pack.items.find(
        (item) => item.entry_id === 'adr-001',
      );
      expect(decision).toBeDefined();
      expect(decision?.reason_codes).toContain(ReasonCode.PINNED);
    });

    it('should produce deterministic output', () => {
      const opts = {
        workingDir: repoRoot,
        repoRoot,
        requestText: 'fix the config loader',
        budgetTokens: 4000,
      };

      const result1 = buildContextPack(opts);
      const result2 = buildContextPack(opts);

      expect(result1.pack.items.map((i) => i.entry_id)).toEqual(
        result2.pack.items.map((i) => i.entry_id),
      );
      expect(result1.pack.total_tokens).toBe(result2.pack.total_tokens);
    });

    it('should respect token budget', () => {
      const result = buildContextPack({
        workingDir: repoRoot,
        repoRoot,
        requestText: 'fix the config loader',
        budgetTokens: 50,
      });

      expect(result.pack.total_tokens).toBeLessThanOrEqual(50);
      expect(result.pack.omitted.length).toBeGreaterThan(0);
    });
  });

  describe('Nested repo (hierarchical .ctx merge)', () => {
    const repoRoot = resolve(FIXTURES_DIR, 'nested');
    const authDir = resolve(repoRoot, 'src/auth');

    it('should merge .ctx files from auth/ up to root', () => {
      const merged = mergeCtxHierarchy({
        workingDir: authDir,
        repoRoot,
      });

      expect(merged.sources.length).toBeGreaterThanOrEqual(2);
      // Auth .ctx should contribute contracts
      expect(merged.ctx.contracts.length).toBeGreaterThan(0);
      expect(merged.ctx.contracts[0].name).toBe('Auth API Contract');
    });

    it('should score auth entries highest when working from auth/', () => {
      const result = buildContextPack({
        workingDir: authDir,
        repoRoot,
        requestText: 'fix the auth bug',
        budgetTokens: 4000,
      });

      // Auth-related items should be at the top
      const topItems = result.pack.items.slice(0, 3);
      const authSources = topItems.filter(
        (item) => item.source.includes('auth') || item.entry_id.includes('auth'),
      );
      expect(authSources.length).toBeGreaterThan(0);
    });

    it('should include CONTRACT_REQUIRED when touching auth files', () => {
      const result = buildContextPack({
        workingDir: authDir,
        repoRoot,
        requestText: 'fix the auth bug',
        touchedFiles: ['src/auth/handler.ts'],
        budgetTokens: 4000,
      });

      const contractItem = result.pack.items.find(
        (item) => item.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED),
      );
      expect(contractItem).toBeDefined();
      expect(contractItem?.entry_id).toBe('Auth API Contract');
    });

    it('should inherit root entries without duplication', () => {
      const result = buildContextPack({
        workingDir: authDir,
        repoRoot,
        requestText: 'fix the auth bug',
        budgetTokens: 8000,
      });

      // Should have entries from multiple .ctx files
      const sources = new Set(result.pack.items.map((i) => i.source));
      expect(sources.size).toBeGreaterThanOrEqual(1);

      // No duplicate entry_ids
      const entryIds = result.pack.items.map((i) => i.entry_id);
      const uniqueIds = new Set(entryIds);
      expect(uniqueIds.size).toBe(entryIds.length);
    });

    it('should provide omitted items list', () => {
      const result = buildContextPack({
        workingDir: authDir,
        repoRoot,
        requestText: 'fix the auth bug',
        budgetTokens: 100,
      });

      // With a very small budget, many items should be omitted
      expect(result.pack.omitted.length).toBeGreaterThan(0);
      for (const omitted of result.pack.omitted) {
        expect(omitted.reason).toBeDefined();
        expect(omitted.score).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Deep-read fallback', () => {
    it('should trigger deep-read when request signals deep analysis', () => {
      const repoRoot = resolve(FIXTURES_DIR, 'simple');
      const result = buildContextPack({
        workingDir: repoRoot,
        repoRoot,
        requestText: 'debug the failing test in utils',
        budgetTokens: 4000,
      });

      expect(result.deep_read).not.toBeNull();
      expect(result.deep_read?.triggered).toBe(true);
      expect(result.deep_read?.rationale).toContain('deep analysis');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // T051: Budget stretch produces warnings in result, not console
  // ──────────────────────────────────────────────────────────────────

  describe('T051: budget stretch warnings', () => {
    it('should place budget stretch warnings in pack.warnings array', () => {
      const repoRoot = resolve(FIXTURES_DIR, 'nested');
      const authDir = resolve(repoRoot, 'src/auth');

      // Use a very small budget so the contract exceeds it,
      // triggering a budget stretch warning
      const result = buildContextPack({
        workingDir: authDir,
        repoRoot,
        requestText: 'fix the auth bug',
        touchedFiles: ['src/auth/handler.ts'],
        budgetTokens: 1,
      });

      // The pack should have a warnings array
      expect(Array.isArray(result.pack.warnings)).toBe(true);

      // If any contract was included that exceeded the budget,
      // there should be a warning about budget stretch
      const hasContract = result.pack.items.some(
        (item) => item.reason_codes.includes(ReasonCode.CONTRACT_REQUIRED),
      );

      if (hasContract && result.pack.total_tokens > result.pack.budget_tokens) {
        expect(result.pack.warnings.length).toBeGreaterThan(0);
        expect(result.pack.warnings.some((w) => w.includes('Budget stretch'))).toBe(true);
      }
    });

    it('should have empty warnings array when budget is sufficient', () => {
      const repoRoot = resolve(FIXTURES_DIR, 'simple');

      const result = buildContextPack({
        workingDir: repoRoot,
        repoRoot,
        requestText: 'fix the config loader',
        budgetTokens: 100000,
      });

      // With a huge budget, no stretch warnings should appear
      expect(result.pack.warnings).toEqual([]);
    });

    it('should include warnings field as an array in the ContextPack', () => {
      const repoRoot = resolve(FIXTURES_DIR, 'simple');

      const result = buildContextPack({
        workingDir: repoRoot,
        repoRoot,
        requestText: 'fix the config loader',
        budgetTokens: 4000,
      });

      // The warnings field should always be present and be an array
      expect(result.pack).toHaveProperty('warnings');
      expect(Array.isArray(result.pack.warnings)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // T054: Ignore patterns respect directory boundaries
  // ──────────────────────────────────────────────────────────────────

  describe('T054: ignore patterns directory boundaries', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-ignore-boundary-'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should exclude src/ directory but NOT src_backup/ with never_read: ["src/"]', () => {
      // Create directory structure:
      //   <root>/.ctx           (root context)
      //   <root>/src/.ctx       (should be excluded by "src/" pattern)
      //   <root>/src/api/.ctx   (should be excluded — inside src/)
      //   <root>/src_backup/.ctx (should NOT be excluded)

      // Root .ctx
      writeFileSync(
        join(tmpDir, '.ctx'),
        `version: 1
summary: "Root context"
key_files: []
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [root]
refs: []
ignore:
  never_read: ["src/"]
  never_log: []
`,
      );

      // src/.ctx (should be excluded)
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'src', '.ctx'),
        `version: 1
summary: "Source context"
key_files:
  - path: src/index.ts
    purpose: Entry point
    tags: [entry]
    verified_at: ""
    locked: false
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [source]
refs: []
ignore:
  never_read: []
  never_log: []
`,
      );

      // src/api/.ctx (should be excluded — inside src/)
      mkdirSync(join(tmpDir, 'src', 'api'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'src', 'api', '.ctx'),
        `version: 1
summary: "API context"
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
`,
      );

      // src_backup/.ctx (should NOT be excluded)
      mkdirSync(join(tmpDir, 'src_backup'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'src_backup', '.ctx'),
        `version: 1
summary: "Backup context"
key_files:
  - path: src_backup/data.ts
    purpose: Backup data file
    tags: [backup]
    verified_at: ""
    locked: false
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [backup]
refs: []
ignore:
  never_read: []
  never_log: []
`,
      );

      // Merge from src_backup/ with the ignore policy from root
      const merged = mergeCtxHierarchy({
        workingDir: join(tmpDir, 'src_backup'),
        repoRoot: tmpDir,
        ignorePolicy: { never_read: ['src/'], never_log: [] },
      });

      // src_backup/.ctx should be included (NOT matched by "src/" pattern)
      expect(merged.sources.some((s) => s.includes('src_backup'))).toBe(true);

      // Merge from src/ with the ignore policy — src/.ctx should be excluded
      const mergedFromSrc = mergeCtxHierarchy({
        workingDir: join(tmpDir, 'src'),
        repoRoot: tmpDir,
        ignorePolicy: { never_read: ['src/'], never_log: [] },
      });

      // src/.ctx should be excluded by the "src/" pattern
      const srcSources = mergedFromSrc.sources.filter(
        (s) => s === 'src/.ctx',
      );
      expect(srcSources).toHaveLength(0);
    });

    it('should exclude src/api/.ctx when never_read includes "src/"', () => {
      // Root .ctx
      writeFileSync(
        join(tmpDir, '.ctx'),
        `version: 1
summary: "Root context"
key_files: []
contracts: []
decisions: []
commands: {}
gotchas: []
tags: []
refs: []
ignore:
  never_read: []
  never_log: []
`,
      );

      // src/api/.ctx
      mkdirSync(join(tmpDir, 'src', 'api'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'src', 'api', '.ctx'),
        `version: 1
summary: "API context"
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
`,
      );

      const merged = mergeCtxHierarchy({
        workingDir: join(tmpDir, 'src', 'api'),
        repoRoot: tmpDir,
        ignorePolicy: { never_read: ['src/'], never_log: [] },
      });

      // src/api/.ctx path is "src/api/.ctx" which starts with "src/"
      // so it should be excluded
      const apiSources = merged.sources.filter((s) => s.includes('src/api'));
      expect(apiSources).toHaveLength(0);
    });
  });
});
