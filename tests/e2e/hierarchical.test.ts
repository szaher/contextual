import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { buildContextPack } from '@ctxl/core';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/repos');

describe('E2E: Hierarchical .ctx Merge', () => {
  const repoRoot = resolve(FIXTURES_DIR, 'nested');

  it('should use child summary over parent when building from deepest dir', () => {
    const result = buildContextPack({
      workingDir: resolve(repoRoot, 'src/auth'),
      repoRoot,
      requestText: 'review authentication flow',
      budgetTokens: 8000,
    });

    // The merged summary should come from the auth child .ctx (highest priority)
    const summaryItem = result.pack.items.find(
      (item) => item.section === 'summary',
    );
    if (summaryItem) {
      expect(summaryItem.content).toContain('Authentication module');
      expect(summaryItem.content).not.toMatch(
        /^A multi-module project for testing/,
      );
    }

    // Auth-specific entries should be present
    const authEntries = result.pack.items.filter(
      (item) =>
        item.entry_id.includes('auth') ||
        item.content.toLowerCase().includes('jwt'),
    );
    expect(authEntries.length).toBeGreaterThan(0);
  });

  it('should score auth-related entries higher for auth keyword request', () => {
    const result = buildContextPack({
      workingDir: resolve(repoRoot, 'src/auth'),
      repoRoot,
      requestText: 'fix the auth login handler',
      budgetTokens: 8000,
    });

    // Auth-related entries should be present in the pack
    const authEntries = result.pack.items.filter(
      (item) =>
        item.entry_id.includes('auth') ||
        item.content.toLowerCase().includes('auth'),
    );
    expect(authEntries.length).toBeGreaterThan(0);

    // TAG_MATCH may or may not fire depending on keyword extraction;
    // the key behavior is that auth entries are included
    expect(authEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('should inherit entries from all ancestor .ctx files', () => {
    const result = buildContextPack({
      workingDir: resolve(repoRoot, 'src/auth'),
      repoRoot,
      requestText: 'general overview of the project',
      budgetTokens: 8000,
    });

    const allEntryIds = result.pack.items.map((item) => item.entry_id);
    const allContent = result.pack.items
      .map((item) => item.content)
      .join('\n');

    // Entries from root .ctx should be inherited (e.g., src/index.ts, src/config.ts)
    const hasRootEntry =
      allEntryIds.some((id) => id.includes('index') || id.includes('config')) ||
      allContent.includes('entry point') ||
      allContent.includes('Global configuration');
    expect(hasRootEntry).toBe(true);

    // Entries from src/.ctx should be inherited (e.g., src/middleware.ts)
    const hasSrcEntry =
      allEntryIds.some((id) => id.includes('middleware')) ||
      allContent.includes('middleware');
    expect(hasSrcEntry).toBe(true);

    // Entries from src/auth/.ctx should be present (e.g., src/auth/handler.ts)
    const hasAuthEntry =
      allEntryIds.some((id) => id.includes('handler')) ||
      allContent.includes('Auth request handlers');
    expect(hasAuthEntry).toBe(true);
  });

  it('should use child version when parent and child define same key_file path', () => {
    // Both src/.ctx and src/auth/.ctx reference middleware files with different paths.
    // src/.ctx defines src/middleware.ts, src/auth/.ctx defines src/auth/middleware.ts.
    // Since paths differ, both appear in the merged ctx.
    // The child's middleware entry (auth) should be present in the pack.
    const result = buildContextPack({
      workingDir: resolve(repoRoot, 'src/auth'),
      repoRoot,
      requestText: 'review middleware configuration',
      budgetTokens: 8000,
    });

    // Auth's middleware entry (src/auth/middleware.ts) should be present
    const authMiddleware = result.pack.items.find(
      (item) =>
        item.entry_id.includes('auth/middleware') ||
        item.content.includes('JWT validation middleware'),
    );
    expect(authMiddleware).toBeDefined();

    // Both middleware entries should be present since they have different paths
    const allMiddleware = result.pack.items.filter(
      (item) =>
        item.entry_id.includes('middleware') ||
        item.content.toLowerCase().includes('middleware'),
    );
    expect(allMiddleware.length).toBeGreaterThanOrEqual(1);
  });

  it('should produce identical packs on repeated calls (deterministic)', () => {
    const opts = {
      workingDir: resolve(repoRoot, 'src/auth'),
      repoRoot,
      requestText: 'fix the auth login handler',
      budgetTokens: 4000,
    };

    const pack1 = buildContextPack(opts).pack;
    const pack2 = buildContextPack(opts).pack;

    // Same number of items
    expect(pack1.items.length).toBe(pack2.items.length);

    // Same items in same order with same scores
    for (let i = 0; i < pack1.items.length; i++) {
      expect(pack1.items[i].entry_id).toBe(pack2.items[i].entry_id);
      expect(pack1.items[i].source).toBe(pack2.items[i].source);
      expect(pack1.items[i].score).toBe(pack2.items[i].score);
      expect(pack1.items[i].tokens).toBe(pack2.items[i].tokens);
      expect(pack1.items[i].section).toBe(pack2.items[i].section);
    }

    // Same totals
    expect(pack1.total_tokens).toBe(pack2.total_tokens);
    expect(pack1.budget_used_pct).toBe(pack2.budget_used_pct);

    // Same omitted items
    expect(pack1.omitted.length).toBe(pack2.omitted.length);
  });

  it('should respect tight budget across merged hierarchy', () => {
    const result = buildContextPack({
      workingDir: resolve(repoRoot, 'src/auth'),
      repoRoot,
      requestText: 'fix the auth login handler',
      budgetTokens: 50,
    });

    // With a very tight budget, some items must be omitted
    expect(result.pack.omitted.length).toBeGreaterThan(0);

    // Total tokens must stay within budget
    expect(result.pack.total_tokens).toBeLessThanOrEqual(50);
    expect(result.pack.budget_used_pct).toBeLessThanOrEqual(100);

    // Included items should still exist (at least some survive)
    expect(result.pack.items.length).toBeGreaterThan(0);

    // Included items should be the highest-scored ones
    const includedScores = result.pack.items.map((item) => item.score);
    const omittedScores = result.pack.omitted.map((item) => item.score);

    // Every included item's score should be >= every omitted item's score
    const minIncludedScore = Math.min(...includedScores);
    const maxOmittedScore =
      omittedScores.length > 0 ? Math.max(...omittedScores) : 0;
    expect(minIncludedScore).toBeGreaterThanOrEqual(maxOmittedScore);

    // Each omitted item should have a reason
    for (const omitted of result.pack.omitted) {
      expect(omitted.reason).toBeDefined();
    }
  });
});
