import { Hono } from 'hono';
import { queryAuditEntries } from '../store/audit.js';
import type { AppEnv } from '../types.js';

const audit = new Hono<AppEnv>();

// GET /audit
audit.get('/audit', (c) => {
  const db = c.get('db');
  const ctx_path = c.req.query('ctx_path');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = c.req.query('limit');

  const result = queryAuditEntries(db, {
    ctx_path: ctx_path || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });

  return c.json({ entries: result.entries, total: result.total }, 200);
});

export { audit };
