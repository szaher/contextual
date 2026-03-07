import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  branch TEXT,
  agent_id TEXT,
  agent_config TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS request_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  request_text TEXT,
  context_pack TEXT,
  omitted_items TEXT,
  token_count INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  deep_read TEXT,
  created_at TEXT NOT NULL,
  event_type TEXT DEFAULT 'request',
  tool_name TEXT,
  tool_input TEXT,
  tool_response TEXT,
  exit_code INTEGER,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS memory_diffs (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  event_id TEXT REFERENCES request_events(id),
  ctx_path TEXT NOT NULL,
  diff_content TEXT NOT NULL,
  provenance TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  source_hash TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  ctx_path TEXT NOT NULL,
  change_type TEXT NOT NULL,
  diff_content TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo_path);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_events_session ON request_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON request_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON request_events(event_type);
CREATE INDEX IF NOT EXISTS idx_diffs_status ON memory_diffs(status);
CREATE INDEX IF NOT EXISTS idx_diffs_ctx ON memory_diffs(ctx_path);
CREATE INDEX IF NOT EXISTS idx_audit_ctx ON audit_log(ctx_path);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`;

/**
 * Open or create the SQLite database with WAL mode and schema.
 */
export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  return db;
}

/**
 * Default database path: ~/.ctxl/data/ctxl.db
 */
export function defaultDbPath(): string {
  return `${homedir()}/.ctxl/data/ctxl.db`;
}
