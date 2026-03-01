import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { insertDiff, getDiffById, queryDiffs, updateDiffStatus } from '../../packages/daemon/src/store/diffs.js';
import { insertAuditEntry, queryAuditEntries } from '../../packages/daemon/src/store/audit.js';
import { openDatabase } from '../../packages/daemon/src/store/db.js';

describe('Integration: Proposal Lifecycle', () => {
  let db: ReturnType<typeof openDatabase>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-test-'));
    db = openDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a proposal with proposed status', () => {
    const diff = insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: '--- a/src/auth/.ctx\n+++ b/src/auth/.ctx\n@@ -1,3 +1,3 @@\n-old line\n+new line',
      provenance: JSON.stringify({ source_file: 'src/auth/handler.ts', trigger: 'symbol_renamed' }),
    });

    expect(diff.id).toMatch(/^diff_/);
    expect(diff.status).toBe('proposed');
    expect(diff.ctx_path).toBe('src/auth/.ctx');
    expect(diff.resolved_at).toBeNull();
  });

  it('should query proposals by status', () => {
    insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: 'diff1',
      provenance: '{}',
    });
    insertDiff(db, {
      ctx_path: 'src/api/.ctx',
      diff_content: 'diff2',
      provenance: '{}',
    });

    const proposed = queryDiffs(db, { status: 'proposed' });
    expect(proposed.total).toBe(2);
    expect(proposed.diffs).toHaveLength(2);

    const byPath = queryDiffs(db, { ctx_path: 'src/auth/.ctx' });
    expect(byPath.total).toBe(1);
    expect(byPath.diffs[0].ctx_path).toBe('src/auth/.ctx');
  });

  it('should approve a proposal', () => {
    const diff = insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: 'test diff',
      provenance: '{}',
    });

    const updated = updateDiffStatus(db, diff.id, 'approved', 'user');
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('approved');
    expect(updated!.resolved_by).toBe('user');
    expect(updated!.resolved_at).toBeTruthy();
  });

  it('should reject a proposal', () => {
    const diff = insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: 'test diff',
      provenance: '{}',
    });

    const updated = updateDiffStatus(db, diff.id, 'rejected', 'user');
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('rejected');
  });

  it('should complete full lifecycle: propose → approve → apply with audit', () => {
    // Step 1: Create a proposal
    const diff = insertDiff(db, {
      session_id: null,
      event_id: null,
      ctx_path: 'src/auth/.ctx',
      diff_content: '--- a/src/auth/.ctx\n+++ b/src/auth/.ctx\n@@ -1 +1 @@\n-old\n+new',
      provenance: JSON.stringify({
        source_file: 'src/auth/handler.ts',
        commit: 'abc123',
        trigger: 'symbol_renamed',
      }),
    });
    expect(diff.status).toBe('proposed');

    // Step 2: Approve the proposal
    const approved = updateDiffStatus(db, diff.id, 'approved', 'user');
    expect(approved!.status).toBe('approved');

    // Step 3: Apply — create audit entry and mark as applied
    const audit = insertAuditEntry(db, {
      ctx_path: diff.ctx_path,
      change_type: 'update',
      diff_content: diff.diff_content,
      initiated_by: 'user',
      reason: `Applied proposal ${diff.id}`,
    });
    expect(audit.id).toMatch(/^aud_/);
    expect(audit.change_type).toBe('update');

    const applied = updateDiffStatus(db, diff.id, 'applied', 'user');
    expect(applied!.status).toBe('applied');

    // Step 4: Verify audit log
    const auditResults = queryAuditEntries(db, { ctx_path: 'src/auth/.ctx' });
    expect(auditResults.total).toBe(1);
    expect(auditResults.entries[0].ctx_path).toBe('src/auth/.ctx');
    expect(auditResults.entries[0].reason).toContain(diff.id);

    // Step 5: Verify final state
    const finalDiff = getDiffById(db, diff.id);
    expect(finalDiff!.status).toBe('applied');
    expect(finalDiff!.resolved_by).toBe('user');
  });

  it('should return null when updating non-existent proposal', () => {
    const result = updateDiffStatus(db, 'nonexistent', 'approved', 'user');
    expect(result).toBeNull();
  });

  it('should handle pagination in queries', () => {
    for (let i = 0; i < 5; i++) {
      insertDiff(db, {
        ctx_path: `path-${i}/.ctx`,
        diff_content: `diff-${i}`,
        provenance: '{}',
      });
    }

    const page1 = queryDiffs(db, { limit: 2, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.diffs).toHaveLength(2);

    const page2 = queryDiffs(db, { limit: 2, offset: 2 });
    expect(page2.diffs).toHaveLength(2);

    const page3 = queryDiffs(db, { limit: 2, offset: 4 });
    expect(page3.diffs).toHaveLength(1);
  });
});
