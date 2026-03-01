import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { buildContextPack, ReasonCode } from '@ctxl/core';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/repos');

describe('E2E: Single .ctx Scenario', () => {
  const repoRoot = resolve(FIXTURES_DIR, 'simple');

  it('should assemble context from root .ctx only', () => {
    const result = buildContextPack({
      workingDir: repoRoot,
      repoRoot,
      requestText: 'fix the config loader',
      budgetTokens: 4000,
    });

    // Pack should have items
    expect(result.pack.items.length).toBeGreaterThan(0);

    // All items should come from root .ctx
    for (const item of result.pack.items) {
      expect(item.source).toBe('.ctx');
    }

    // Budget respected
    expect(result.pack.total_tokens).toBeLessThanOrEqual(4000);
    expect(result.pack.budget_used_pct).toBeLessThanOrEqual(100);
  });

  it('should select correct subset for auth-related request', () => {
    const result = buildContextPack({
      workingDir: repoRoot,
      repoRoot,
      requestText: 'update the typescript configuration',
      budgetTokens: 4000,
    });

    // Should have items related to typescript/config
    const hasRelevantItems = result.pack.items.some(
      (item) =>
        item.entry_id.includes('config') ||
        item.reason_codes.includes(ReasonCode.TAG_MATCH),
    );
    expect(hasRelevantItems).toBe(true);
  });

  it('should produce identical packs on repeated calls', () => {
    const opts = {
      workingDir: repoRoot,
      repoRoot,
      requestText: 'fix the config loader',
      budgetTokens: 4000,
    };

    const pack1 = buildContextPack(opts).pack;
    const pack2 = buildContextPack(opts).pack;

    // Same items in same order
    expect(pack1.items.length).toBe(pack2.items.length);
    for (let i = 0; i < pack1.items.length; i++) {
      expect(pack1.items[i].entry_id).toBe(pack2.items[i].entry_id);
      expect(pack1.items[i].source).toBe(pack2.items[i].source);
      expect(pack1.items[i].score).toBe(pack2.items[i].score);
    }

    // Same totals
    expect(pack1.total_tokens).toBe(pack2.total_tokens);
    expect(pack1.budget_used_pct).toBe(pack2.budget_used_pct);
  });

  it('should handle tight budget with omitted items', () => {
    const result = buildContextPack({
      workingDir: repoRoot,
      repoRoot,
      requestText: 'fix the config loader',
      budgetTokens: 50,
    });

    // Some items should be included
    expect(result.pack.items.length).toBeGreaterThan(0);

    // But some should be omitted
    expect(result.pack.omitted.length).toBeGreaterThan(0);

    // Each omitted item has a reason
    for (const omitted of result.pack.omitted) {
      expect(omitted.reason).toBeDefined();
    }

    // Total tokens within budget
    expect(result.pack.total_tokens).toBeLessThanOrEqual(50);
  });

  it('should show attribution for every included item', () => {
    const result = buildContextPack({
      workingDir: repoRoot,
      repoRoot,
      requestText: 'fix the config loader',
      budgetTokens: 4000,
    });

    for (const item of result.pack.items) {
      // Every item has a source
      expect(item.source).toBeTruthy();
      // Every item has a section
      expect(item.section).toBeTruthy();
      // Every item has an entry_id
      expect(item.entry_id).toBeTruthy();
      // Score is a valid number
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(1);
      // Tokens estimated
      expect(item.tokens).toBeGreaterThanOrEqual(0);
      // Staleness info present
      expect(item.staleness).toBeDefined();
    }
  });
});
