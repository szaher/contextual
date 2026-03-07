import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface MemoryDiff {
  id: string;
  session_id: string | null;
  event_id: string | null;
  ctx_path: string;
  diff_content: string;
  provenance: string;
  status: 'proposed' | 'approved' | 'rejected' | 'applied';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  source_hash: string | null;
}

export interface InsertDiffParams {
  session_id?: string | null;
  event_id?: string | null;
  ctx_path: string;
  diff_content: string;
  provenance: string;
  source_hash?: string | null;
}

export interface DiffQueryOptions {
  status?: string;
  ctx_path?: string;
  limit?: number;
  offset?: number;
}

export interface DiffQueryResult {
  diffs: MemoryDiff[];
  total: number;
}

export function insertDiff(db: Database.Database, params: InsertDiffParams): MemoryDiff {
  const id = `diff_${randomUUID().slice(0, 8)}`;
  const created_at = new Date().toISOString();
  const source_hash = params.source_hash ?? null;

  db.prepare(
    `INSERT INTO memory_diffs (id, session_id, event_id, ctx_path, diff_content, provenance, status, created_at, source_hash)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`,
  ).run(
    id,
    params.session_id ?? null,
    params.event_id ?? null,
    params.ctx_path,
    params.diff_content,
    params.provenance,
    created_at,
    source_hash,
  );

  return {
    id,
    session_id: params.session_id ?? null,
    event_id: params.event_id ?? null,
    ctx_path: params.ctx_path,
    diff_content: params.diff_content,
    provenance: params.provenance,
    status: 'proposed',
    created_at,
    resolved_at: null,
    resolved_by: null,
    source_hash,
  };
}

export function getDiffById(db: Database.Database, id: string): MemoryDiff | null {
  const row = db.prepare('SELECT * FROM memory_diffs WHERE id = ?').get(id) as MemoryDiff | undefined;
  return row ?? null;
}

export function queryDiffs(db: Database.Database, options: DiffQueryOptions = {}): DiffQueryResult {
  const { status, ctx_path, limit = 50, offset = 0 } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (ctx_path) {
    conditions.push('ctx_path = ?');
    params.push(ctx_path);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM memory_diffs ${whereClause}`)
    .get(...params) as { total: number };

  const diffs = db
    .prepare(
      `SELECT * FROM memory_diffs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as MemoryDiff[];

  return { diffs, total: countRow.total };
}

export function updateDiffStatus(
  db: Database.Database,
  id: string,
  status: 'approved' | 'rejected' | 'applied',
  resolvedBy: string,
): MemoryDiff | null {
  const resolved_at = new Date().toISOString();

  const result = db.prepare(
    `UPDATE memory_diffs SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?`,
  ).run(status, resolved_at, resolvedBy, id);

  if (result.changes === 0) return null;

  return getDiffById(db, id);
}
