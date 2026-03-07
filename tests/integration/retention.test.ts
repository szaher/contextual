import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../../packages/daemon/src/store/db.js';
import { createSession } from '../../packages/daemon/src/store/sessions.js';
import { insertRequestEvent } from '../../packages/daemon/src/store/events.js';
import { insertAuditEntry } from '../../packages/daemon/src/store/audit.js';
import { runRetentionCleanup } from '../../packages/daemon/src/scheduler/retention.js';

/**
 * T029-T030: Retention Scheduler Integration Tests
 *
 * Verifies that runRetentionCleanup correctly purges old sessions,
 * associated events, and audit log entries based on configurable retention
 * periods.
 */
describe('Integration: Retention Scheduler', () => {
  let db: ReturnType<typeof openDatabase>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-retention-test-'));
    db = openDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────────
  // T029: Purge old sessions and their associated events
  // ──────────────────────────────────────────────────────────────────

  describe('T029: purge old sessions and events', () => {
    it('should purge sessions older than 30 days and their events', () => {
      // Create an old session with started_at > 31 days ago
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const oldSessionId = 'sess_old00001';
      db.prepare(
        `INSERT INTO sessions (id, repo_path, working_dir, status, started_at)
         VALUES (?, ?, ?, 'active', ?)`,
      ).run(oldSessionId, '/repo', '/repo/src', oldDate);

      // Insert events associated with the old session
      db.prepare(
        `INSERT INTO request_events (id, session_id, request_text, context_pack, token_count, budget, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('evt_old01', oldSessionId, 'old request 1', '{}', 100, 4000, oldDate);
      db.prepare(
        `INSERT INTO request_events (id, session_id, request_text, context_pack, token_count, budget, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('evt_old02', oldSessionId, 'old request 2', '{}', 200, 4000, oldDate);

      // Create a recent session (should NOT be purged)
      const recentSession = createSession(db, {
        repo_path: '/repo',
        working_dir: '/repo/src',
      });
      insertRequestEvent(db, {
        session_id: recentSession.id,
        request_text: 'recent request',
        context_pack: '{}',
        omitted_items: null,
        token_count: 500,
        budget: 4000,
        deep_read: null,
      });

      // Run retention cleanup
      const result = runRetentionCleanup(db, { sessionsDays: 30 });

      // Old session and events should be purged
      expect(result.purgedSessions).toBe(1);
      expect(result.purgedEvents).toBe(2);

      // Verify old session is gone from DB
      const oldSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(oldSessionId);
      expect(oldSession).toBeUndefined();

      // Verify old events are gone
      const oldEvents = db.prepare('SELECT * FROM request_events WHERE session_id = ?').all(oldSessionId);
      expect(oldEvents).toHaveLength(0);

      // Verify recent session and events are retained
      const recentSessionRow = db.prepare('SELECT * FROM sessions WHERE id = ?').get(recentSession.id);
      expect(recentSessionRow).toBeDefined();

      const recentEvents = db.prepare('SELECT * FROM request_events WHERE session_id = ?').all(recentSession.id);
      expect(recentEvents).toHaveLength(1);
    });

    it('should purge multiple old sessions at once', () => {
      const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

      for (let i = 0; i < 5; i++) {
        const id = `sess_old_${i}`;
        db.prepare(
          `INSERT INTO sessions (id, repo_path, working_dir, status, started_at)
           VALUES (?, ?, ?, 'active', ?)`,
        ).run(id, '/repo', '/repo/src', oldDate);

        db.prepare(
          `INSERT INTO request_events (id, session_id, request_text, context_pack, token_count, budget, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(`evt_${i}`, id, `request ${i}`, '{}', 100, 4000, oldDate);
      }

      const result = runRetentionCleanup(db, { sessionsDays: 30 });

      expect(result.purgedSessions).toBe(5);
      expect(result.purgedEvents).toBe(5);
    });

    it('should purge old audit log entries based on auditDays', () => {
      // Insert an old audit entry (> 90 days)
      const oldAuditDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `INSERT INTO audit_log (id, ctx_path, change_type, diff_content, initiated_by, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('aud_old01', 'src/.ctx', 'update', 'old diff', 'user', 'old change', oldAuditDate);

      // Insert a recent audit entry (should NOT be purged)
      insertAuditEntry(db, {
        ctx_path: 'src/.ctx',
        change_type: 'update',
        diff_content: 'recent diff',
        initiated_by: 'user',
        reason: 'recent change',
      });

      const result = runRetentionCleanup(db, { auditDays: 90 });

      expect(result.purgedAudit).toBe(1);

      // Verify old audit entry is gone
      const oldAudit = db.prepare('SELECT * FROM audit_log WHERE id = ?').get('aud_old01');
      expect(oldAudit).toBeUndefined();

      // Verify recent audit entry is retained
      const allAudit = db.prepare('SELECT * FROM audit_log').all();
      expect(allAudit).toHaveLength(1);
    });

    it('should respect custom retention periods', () => {
      // Create a session 10 days old
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `INSERT INTO sessions (id, repo_path, working_dir, status, started_at)
         VALUES (?, ?, ?, 'active', ?)`,
      ).run('sess_ten_days', '/repo', '/repo/src', tenDaysAgo);

      // With default 30-day retention, this should NOT be purged
      const result30 = runRetentionCleanup(db, { sessionsDays: 30 });
      expect(result30.purgedSessions).toBe(0);

      // With 7-day retention, this SHOULD be purged
      const result7 = runRetentionCleanup(db, { sessionsDays: 7 });
      expect(result7.purgedSessions).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // T030: Retention on empty database
  // ──────────────────────────────────────────────────────────────────

  describe('T030: empty database', () => {
    it('should run retention cleanup on empty database without errors', () => {
      const result = runRetentionCleanup(db);

      expect(result.purgedSessions).toBe(0);
      expect(result.purgedEvents).toBe(0);
      expect(result.purgedDiffs).toBe(0);
      expect(result.purgedAudit).toBe(0);
    });

    it('should run retention cleanup with custom config on empty database without errors', () => {
      const result = runRetentionCleanup(db, {
        sessionsDays: 1,
        auditDays: 1,
      });

      expect(result.purgedSessions).toBe(0);
      expect(result.purgedEvents).toBe(0);
      expect(result.purgedDiffs).toBe(0);
      expect(result.purgedAudit).toBe(0);
    });
  });
});
