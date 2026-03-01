import type Database from 'better-sqlite3';

export interface RetentionConfig {
  sessionsDays: number;
  auditDays: number;
  intervalMs: number;
}

const DEFAULT_CONFIG: RetentionConfig = {
  sessionsDays: 30,
  auditDays: 90,
  intervalMs: 24 * 60 * 60 * 1000, // 24 hours
};

export interface RetentionResult {
  purgedSessions: number;
  purgedEvents: number;
  purgedDiffs: number;
  purgedAudit: number;
}

/**
 * Run retention cleanup, purging old records.
 */
export function runRetentionCleanup(
  db: Database.Database,
  config: Partial<RetentionConfig> = {},
): RetentionResult {
  const { sessionsDays, auditDays } = { ...DEFAULT_CONFIG, ...config };

  const sessionsCutoff = new Date(
    Date.now() - sessionsDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const auditCutoff = new Date(
    Date.now() - auditDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Use a transaction for atomicity
  const cleanup = db.transaction(() => {
    // 1. Find old session IDs
    const oldSessions = db
      .prepare('SELECT id FROM sessions WHERE created_at < ? OR started_at < ?')
      .all(sessionsCutoff, sessionsCutoff) as { id: string }[];

    const sessionIds = oldSessions.map((s) => s.id);

    let purgedEvents = 0;
    let purgedDiffs = 0;

    if (sessionIds.length > 0) {
      // 2. Purge request_events for old sessions
      for (const sid of sessionIds) {
        const evtResult = db
          .prepare('DELETE FROM request_events WHERE session_id = ?')
          .run(sid);
        purgedEvents += evtResult.changes;
      }

      // 3. Purge memory_diffs for old sessions
      for (const sid of sessionIds) {
        const diffResult = db
          .prepare('DELETE FROM memory_diffs WHERE session_id = ?')
          .run(sid);
        purgedDiffs += diffResult.changes;
      }

      // 4. Purge old sessions
      for (const sid of sessionIds) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
      }
    }

    // 5. Purge old audit log entries
    const auditResult = db
      .prepare('DELETE FROM audit_log WHERE created_at < ?')
      .run(auditCutoff);

    return {
      purgedSessions: sessionIds.length,
      purgedEvents,
      purgedDiffs,
      purgedAudit: auditResult.changes,
    };
  });

  return cleanup();
}

/**
 * Start the retention scheduler.
 * Runs cleanup immediately and then on the specified interval.
 * Returns a cleanup function to stop the scheduler.
 */
export function startRetentionScheduler(
  db: Database.Database,
  config: Partial<RetentionConfig> = {},
): () => void {
  const { intervalMs } = { ...DEFAULT_CONFIG, ...config };

  // Run immediately on startup
  const result = runRetentionCleanup(db, config);
  if (result.purgedSessions > 0 || result.purgedAudit > 0) {
    console.log(
      `Retention cleanup: ${result.purgedSessions} sessions, ${result.purgedEvents} events, ${result.purgedDiffs} diffs, ${result.purgedAudit} audit entries purged`,
    );
  }

  // Schedule periodic cleanup
  const timer = setInterval(() => {
    try {
      const r = runRetentionCleanup(db, config);
      if (r.purgedSessions > 0 || r.purgedAudit > 0) {
        console.log(
          `Retention cleanup: ${r.purgedSessions} sessions, ${r.purgedEvents} events, ${r.purgedDiffs} diffs, ${r.purgedAudit} audit entries purged`,
        );
      }
    } catch (err) {
      console.error('Retention cleanup error:', err);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
