import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface Session {
  id: string;
  repo_path: string;
  working_dir: string;
  branch: string | null;
  agent_id: string | null;
  agent_config: string | null;
  status: 'active' | 'completed';
  started_at: string;
  ended_at: string | null;
}

export interface SessionWithEvents extends Session {
  events: SessionEvent[];
}

export interface SessionEvent {
  id: string;
  request_text: string;
  token_count: number;
  budget: number;
  deep_read: string | null;
  created_at: string;
}

export interface CreateSessionParams {
  repo_path: string;
  working_dir: string;
  branch?: string | null;
  agent_id?: string | null;
  agent_config?: Record<string, unknown> | null;
}

export interface SessionQueryOptions {
  status?: string;
  repo_path?: string;
  limit?: number;
  offset?: number;
}

export interface SessionQueryResult {
  sessions: (Session & { request_count: number })[];
  total: number;
}

export function createSession(db: Database.Database, params: CreateSessionParams): Session {
  const id = `sess_${randomUUID().slice(0, 8)}`;
  const started_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO sessions (id, repo_path, working_dir, branch, agent_id, agent_config, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).run(
    id,
    params.repo_path,
    params.working_dir,
    params.branch ?? null,
    params.agent_id ?? null,
    params.agent_config ? JSON.stringify(params.agent_config) : null,
    started_at,
  );

  return {
    id,
    repo_path: params.repo_path,
    working_dir: params.working_dir,
    branch: params.branch ?? null,
    agent_id: params.agent_id ?? null,
    agent_config: params.agent_config ? JSON.stringify(params.agent_config) : null,
    status: 'active',
    started_at,
    ended_at: null,
  };
}

export function getSessionById(db: Database.Database, id: string): SessionWithEvents | null {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  if (!session) return null;

  const events = db.prepare(
    `SELECT id, request_text, token_count, budget, deep_read, created_at
     FROM request_events WHERE session_id = ? ORDER BY created_at ASC`,
  ).all(id) as SessionEvent[];

  return { ...session, events };
}

export function listSessions(db: Database.Database, options: SessionQueryOptions = {}): SessionQueryResult {
  const { status, repo_path, limit = 50, offset = 0 } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push('s.status = ?');
    params.push(status);
  }
  if (repo_path) {
    conditions.push('s.repo_path = ?');
    params.push(repo_path);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM sessions s ${whereClause}`)
    .get(...params) as { total: number };

  const sessions = db.prepare(
    `SELECT s.*, COUNT(e.id) as request_count
     FROM sessions s
     LEFT JOIN request_events e ON e.session_id = s.id
     ${whereClause}
     GROUP BY s.id
     ORDER BY s.started_at DESC
     LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as (Session & { request_count: number })[];

  return { sessions, total: countRow.total };
}

export function endSession(db: Database.Database, id: string): Session | null {
  const ended_at = new Date().toISOString();

  const result = db.prepare(
    `UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ? AND status = 'active'`,
  ).run(ended_at, id);

  if (result.changes === 0) return null;

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
}
