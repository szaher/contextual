import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppEnv } from '../types.js';
import type { ActivityEventType } from '@ctxkit/core';
import {
  insertActivityEvent,
  listActivityEvents,
  getActivityEventsSince,
} from '../store/activity.js';

export const activityRoutes = new Hono<AppEnv>();

// GET /activity — list activity events with optional filters
activityRoutes.get('/activity', async (c) => {
  const db = c.get('db');
  const session_id = c.req.query('session_id');
  const event_type = c.req.query('event_type') as ActivityEventType | undefined;
  const ctx_path = c.req.query('ctx_path');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
  const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0;

  const result = listActivityEvents(db, {
    session_id: session_id || undefined,
    event_type: event_type || undefined,
    ctx_path: ctx_path || undefined,
    limit,
    offset,
  });

  return c.json({
    events: result.events,
    total: result.total,
    has_more: offset + limit < result.total,
  });
});

// POST /activity — record a new activity event
activityRoutes.post('/activity', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();

  const { session_id, event_type, ctx_path, agent_id, details } = body;

  if (!session_id || !event_type) {
    return c.json({
      error: { code: 'BAD_REQUEST', message: 'session_id and event_type are required' },
    }, 400);
  }

  const event = insertActivityEvent(db, {
    session_id,
    event_type,
    ctx_path: ctx_path || null,
    agent_id: agent_id || null,
    details: details || null,
  });

  return c.json(
    { id: event.id, created_at: event.created_at },
    201,
  );
});

// GET /activity/stream — SSE stream for real-time activity
activityRoutes.get('/activity/stream', async (c) => {
  const db = c.get('db');
  const session_id = c.req.query('session_id');
  const event_type = c.req.query('event_type') as ActivityEventType | undefined;

  return streamSSE(c, async (stream) => {
    let lastTimestamp = new Date().toISOString();

    // Poll every 1 second for new events
    const interval = setInterval(() => {
      try {
        const newEvents = getActivityEventsSince(db, lastTimestamp, {
          session_id: session_id || undefined,
          event_type: event_type || undefined,
        });

        for (const event of newEvents) {
          stream.writeSSE({
            event: 'activity',
            data: JSON.stringify(event),
          });
          lastTimestamp = event.created_at;
        }
      } catch {
        // Ignore errors during polling
      }
    }, 1000);

    // Clean up on stream close
    stream.onAbort(() => {
      clearInterval(interval);
    });

    // Keep stream alive
    while (true) {
      await stream.sleep(30000);
    }
  });
});
