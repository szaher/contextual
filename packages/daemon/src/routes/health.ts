import { Hono } from 'hono';
import { statSync } from 'node:fs';
import type { AppEnv } from '../types.js';

const health = new Hono<AppEnv>();

health.get('/health', (c) => {
  const db = c.get('db');
  const startedAt = c.get('startedAt');

  const uptimeSeconds = Math.floor(
    (Date.now() - startedAt.getTime()) / 1000,
  );

  // Count active sessions
  const row = db
    .prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'")
    .get() as { count: number } | undefined;
  const activeSessions = row?.count ?? 0;

  // Get database file size
  let dbSizeBytes = 0;
  try {
    const dbPath = db.name;
    dbSizeBytes = statSync(dbPath).size;
  } catch {
    // ignore if we can't stat
  }

  return c.json({
    status: 'ok',
    version: '0.1.0',
    uptime_seconds: uptimeSeconds,
    active_sessions: activeSessions,
    db_size_bytes: dbSizeBytes,
  });
});

export { health };
