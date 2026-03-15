import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ActivityEvent, ActivityEventType } from '@ctxkit/core';

export interface InsertActivityEvent {
  session_id: string;
  event_type: ActivityEventType;
  ctx_path?: string | null;
  agent_id?: string | null;
  details?: Record<string, unknown> | null;
}

export interface ListActivityOptions {
  session_id?: string;
  event_type?: ActivityEventType;
  ctx_path?: string;
  limit?: number;
  offset?: number;
}

/**
 * Insert a new activity event.
 */
export function insertActivityEvent(
  db: Database.Database,
  event: InsertActivityEvent,
): ActivityEvent {
  const id = `evt_${randomUUID().slice(0, 8)}`;
  const created_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO activity_events (id, session_id, event_type, ctx_path, agent_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    event.session_id,
    event.event_type,
    event.ctx_path ?? null,
    event.agent_id ?? null,
    event.details ? JSON.stringify(event.details) : null,
    created_at,
  );

  return {
    id,
    session_id: event.session_id,
    event_type: event.event_type,
    ctx_path: event.ctx_path ?? null,
    agent_id: event.agent_id ?? null,
    details: event.details ?? null,
    created_at,
  };
}

/**
 * List activity events with optional filters.
 */
export function listActivityEvents(
  db: Database.Database,
  options: ListActivityOptions = {},
): { events: ActivityEvent[]; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.session_id) {
    conditions.push('session_id = ?');
    params.push(options.session_id);
  }
  if (options.event_type) {
    conditions.push('event_type = ?');
    params.push(options.event_type);
  }
  if (options.ctx_path) {
    conditions.push('ctx_path = ?');
    params.push(options.ctx_path);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const countRow = db.prepare(
    `SELECT COUNT(*) as count FROM activity_events ${whereClause}`,
  ).get(...params) as { count: number };

  const rows = db.prepare(
    `SELECT * FROM activity_events ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as Array<Record<string, unknown>>;

  const events: ActivityEvent[] = rows.map((row) => ({
    id: row.id as string,
    session_id: row.session_id as string,
    event_type: row.event_type as ActivityEventType,
    ctx_path: (row.ctx_path as string) || null,
    agent_id: (row.agent_id as string) || null,
    details: row.details ? (JSON.parse(row.details as string) as Record<string, unknown>) : null,
    created_at: row.created_at as string,
  }));

  return { events, total: countRow.count };
}

/**
 * Get activity events for streaming (returns cursor-style).
 * Returns events created after the given timestamp.
 */
export function getActivityEventsSince(
  db: Database.Database,
  since: string,
  options: { session_id?: string; event_type?: ActivityEventType } = {},
): ActivityEvent[] {
  const conditions: string[] = ['created_at > ?'];
  const params: unknown[] = [since];

  if (options.session_id) {
    conditions.push('session_id = ?');
    params.push(options.session_id);
  }
  if (options.event_type) {
    conditions.push('event_type = ?');
    params.push(options.event_type);
  }

  const rows = db.prepare(
    `SELECT * FROM activity_events WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`,
  ).all(...params) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    session_id: row.session_id as string,
    event_type: row.event_type as ActivityEventType,
    ctx_path: (row.ctx_path as string) || null,
    agent_id: (row.agent_id as string) || null,
    details: row.details ? (JSON.parse(row.details as string) as Record<string, unknown>) : null,
    created_at: row.created_at as string,
  }));
}
