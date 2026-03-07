import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface RequestEvent {
  id: string;
  session_id: string;
  request_text: string;
  context_pack: string;
  omitted_items: string | null;
  token_count: number;
  budget: number;
  deep_read: string | null;
  created_at: string;
}

/**
 * Insert a new request event.
 */
export function insertRequestEvent(
  db: Database.Database,
  event: Omit<RequestEvent, 'id' | 'created_at'>,
): RequestEvent {
  const id = `evt_${randomUUID().slice(0, 8)}`;
  const created_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO request_events (id, session_id, request_text, context_pack, omitted_items, token_count, budget, deep_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    event.session_id,
    event.request_text,
    event.context_pack,
    event.omitted_items,
    event.token_count,
    event.budget,
    event.deep_read,
    created_at,
  );

  return { id, ...event, created_at };
}

/**
 * Query request events by session ID.
 */
export function getEventsBySession(
  db: Database.Database,
  sessionId: string,
): RequestEvent[] {
  return db
    .prepare(
      'SELECT * FROM request_events WHERE session_id = ? ORDER BY created_at ASC',
    )
    .all(sessionId) as RequestEvent[];
}

export interface ToolEvent {
  id: string;
  session_id: string;
  event_type: 'tool_success' | 'tool_failure' | 'session_close' | 'proposal_trigger';
  tool_name: string;
  tool_input: string;
  tool_response: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  created_at: string;
}

/**
 * Insert a new tool event into the request_events table.
 */
export function insertToolEvent(
  db: Database.Database,
  event: Omit<ToolEvent, 'id' | 'created_at'>,
): ToolEvent {
  const id = `evt_${randomUUID().slice(0, 8)}`;
  const created_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO request_events (id, session_id, request_text, context_pack, omitted_items, token_count, budget, deep_read, created_at, event_type, tool_name, tool_input, tool_response, exit_code, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    event.session_id,
    null,
    null,
    null,
    0,
    0,
    null,
    created_at,
    event.event_type,
    event.tool_name,
    event.tool_input,
    event.tool_response,
    event.exit_code,
    event.duration_ms,
  );

  return { id, ...event, created_at };
}

/**
 * Query tool events by session ID (excludes regular request events).
 */
export function getToolEventsBySession(
  db: Database.Database,
  sessionId: string,
): ToolEvent[] {
  return db
    .prepare(
      `SELECT id, session_id, event_type, tool_name, tool_input, tool_response, exit_code, duration_ms, created_at
       FROM request_events
       WHERE session_id = ? AND event_type != 'request'
       ORDER BY created_at ASC`,
    )
    .all(sessionId) as ToolEvent[];
}
