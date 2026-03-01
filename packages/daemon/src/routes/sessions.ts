import { Hono } from 'hono';
import { createSession, getSessionById, listSessions, endSession } from '../store/sessions.js';
import type { AppEnv } from '../types.js';

const sessions = new Hono<AppEnv>();

// POST /sessions
sessions.post('/sessions', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();

  const { repo_path, working_dir, branch, agent_id, agent_config } = body;

  if (!repo_path || !working_dir) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'repo_path and working_dir are required' } },
      400,
    );
  }

  const session = createSession(db, {
    repo_path,
    working_dir,
    branch: branch || null,
    agent_id: agent_id || null,
    agent_config: agent_config || null,
  });

  return c.json(
    { id: session.id, status: session.status, started_at: session.started_at },
    201,
  );
});

// GET /sessions
sessions.get('/sessions', (c) => {
  const db = c.get('db');
  const status = c.req.query('status');
  const repo_path = c.req.query('repo_path');
  const limit = c.req.query('limit');
  const offset = c.req.query('offset');

  const result = listSessions(db, {
    status: status || undefined,
    repo_path: repo_path || undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });

  return c.json({ sessions: result.sessions, total: result.total }, 200);
});

// GET /sessions/:id
sessions.get('/sessions/:id', (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const session = getSessionById(db, id);
  if (!session) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found' } },
      404,
    );
  }

  return c.json(session, 200);
});

// PATCH /sessions/:id
sessions.patch('/sessions/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();

  if (body.status !== 'completed') {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'Only status "completed" is supported' } },
      400,
    );
  }

  const session = endSession(db, id);
  if (!session) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found or already completed' } },
      404,
    );
  }

  return c.json(
    { id: session.id, status: session.status, ended_at: session.ended_at },
    200,
  );
});

export { sessions };
