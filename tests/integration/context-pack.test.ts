import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
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
});
