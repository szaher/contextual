import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface AuditEntry {
  id: string;
  ctx_path: string;
  change_type: string;
  diff_content: string;
  initiated_by: string;
  reason: string;
  created_at: string;
}

export interface AuditQueryOptions {
  ctx_path?: string;
  from?: string;
  to?: string;
  initiated_by?: string;
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
}

/**
 * Insert a new audit log entry.
 */
export function insertAuditEntry(
  db: Database.Database,
  entry: Omit<AuditEntry, 'id' | 'created_at'>,
): AuditEntry {
  const id = `aud_${randomUUID().slice(0, 8)}`;
  const created_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO audit_log (id, ctx_path, change_type, diff_content, initiated_by, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, entry.ctx_path, entry.change_type, entry.diff_content, entry.initiated_by, entry.reason, created_at);

  return { id, ...entry, created_at };
}

/**
 * Query audit log entries with optional filters and pagination.
 */
export function queryAuditEntries(
  db: Database.Database,
  options: AuditQueryOptions = {},
): AuditQueryResult {
  const { ctx_path, from, to, initiated_by, limit = 50, offset = 0 } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (ctx_path) {
    conditions.push('ctx_path = ?');
    params.push(ctx_path);
  }
  if (from) {
    conditions.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('created_at <= ?');
    params.push(to);
  }
  if (initiated_by) {
    conditions.push('initiated_by = ?');
    params.push(initiated_by);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM audit_log ${whereClause}`)
    .get(...params) as { total: number };

  const entries = db
    .prepare(
      `SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as AuditEntry[];

  return {
    entries,
    total: countRow.total,
  };
}
