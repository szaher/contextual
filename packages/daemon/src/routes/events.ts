import { Hono } from 'hono';
import { getSessionById } from '../store/sessions.js';
import { insertToolEvent } from '../store/events.js';
import type { AppEnv } from '../types.js';

const VALID_EVENT_TYPES = [
  'tool_success',
  'tool_failure',
  'session_close',
  'proposal_trigger',
] as const;

const events = new Hono<AppEnv>();

// POST /sessions/:id/events
events.post('/sessions/:id/events', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();

  const session = getSessionById(db, id);
  if (!session) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found' } },
      404,
    );
  }

  const { event_type, tool_name, tool_input, tool_response, exit_code, duration_ms } = body;

  if (!event_type || !VALID_EVENT_TYPES.includes(event_type)) {
    return c.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
        },
      },
      400,
    );
  }

  if (!tool_name) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'tool_name is required' } },
      400,
    );
  }

  const result = insertToolEvent(db, {
    session_id: id,
    event_type,
    tool_name,
    tool_input: JSON.stringify(tool_input),
    tool_response: tool_response ? JSON.stringify(tool_response) : null,
    exit_code: exit_code ?? null,
    duration_ms: duration_ms ?? null,
  });

  return c.json({ event_id: result.id }, 201);
});

export { events };
