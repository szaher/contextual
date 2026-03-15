import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { queryCommitsWithTrailers } from '@ctxkit/core';
import type { CommitContextRecord } from '@ctxkit/core';

export const commitContextRoutes = new Hono<AppEnv>();

// GET /commit-context — list commits with ctxkit trailers
commitContextRoutes.get('/commit-context', async (c) => {
  const cwd = c.req.query('cwd');
  if (!cwd) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'cwd is required' } }, 400);
  }

  const sessionId = c.req.query('session_id') || undefined;
  const since = c.req.query('since') || undefined;
  const until = c.req.query('until') || undefined;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const hasTrailers = c.req.query('has_trailers') !== 'false';

  const commits = queryCommitsWithTrailers(cwd, {
    since,
    until,
    limit: hasTrailers ? limit * 2 : limit, // Over-fetch when filtering
    sessionId,
  });

  // Cache results in commit_context table
  const db = c.get('db');
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO commit_context
      (commit_hash, session_id, files_changed, entry_count, trailer_timestamp, author, message_subject, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertMany = db.transaction((records: CommitContextRecord[]) => {
    for (const r of records) {
      upsert.run(
        r.commitHash,
        r.sessionId,
        JSON.stringify(r.filesChanged),
        r.entryCount,
        r.trailerTimestamp,
        r.author,
        r.messageSubject,
      );
    }
  });
  insertMany(commits);

  const limited = commits.slice(0, limit);

  return c.json({
    commits: limited.map((r) => ({
      hash: r.commitHash,
      subject: r.messageSubject,
      author: r.author,
      date: r.trailerTimestamp,
      trailers: {
        session_id: r.sessionId,
        files: r.filesChanged,
        entries: r.entryCount,
        timestamp: r.trailerTimestamp,
      },
    })),
    total: commits.length,
    has_more: commits.length > limit,
  });
});

// GET /commit-context/:hash — single commit detail with linked session data
commitContextRoutes.get('/commit-context/:hash', async (c) => {
  const hash = c.req.param('hash');
  const db = c.get('db');

  // Try cached data first
  const cached = db.prepare('SELECT * FROM commit_context WHERE commit_hash = ?').get(hash) as Record<string, unknown> | undefined;

  if (!cached) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Commit not found or has no ctxkit trailers' } },
      404,
    );
  }

  // Look up linked session if session_id exists
  let session = null;
  if (cached.session_id) {
    const sessionRow = db.prepare('SELECT id, status, started_at, ended_at FROM sessions WHERE id = ?').get(cached.session_id) as Record<string, unknown> | undefined;
    if (sessionRow) {
      session = {
        id: sessionRow.id,
        status: sessionRow.status,
        started_at: sessionRow.started_at,
        ended_at: sessionRow.ended_at,
      };
    }
  }

  let filesChanged: string[];
  try {
    filesChanged = JSON.parse(cached.files_changed as string);
  } catch {
    filesChanged = [];
  }

  return c.json({
    hash: cached.commit_hash,
    subject: cached.message_subject,
    author: cached.author,
    date: cached.trailer_timestamp,
    trailers: {
      session_id: cached.session_id,
      files: filesChanged,
      entries: cached.entry_count,
      timestamp: cached.trailer_timestamp,
    },
    session,
  });
});
