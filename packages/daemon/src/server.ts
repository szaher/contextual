import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import type Database from 'better-sqlite3';
import type { AppEnv } from './types.js';
import { health } from './routes/health.js';
import { contextPack } from './routes/context-pack.js';
import { proposals } from './routes/proposals.js';
import { sessions } from './routes/sessions.js';
import { audit } from './routes/audit.js';
import { drift } from './routes/drift.js';
import { events } from './routes/events.js';
import { config } from './routes/config.js';
import { memory } from './routes/memory.js';

export interface AppContext {
  db: Database.Database;
  startedAt: Date;
}

export function createApp(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Request logging
  app.use(logger());

  // Body size limit (10 MB)
  app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 }));

  // Inject app context into all routes
  app.use('*', async (c, next) => {
    c.set('db', ctx.db);
    c.set('startedAt', ctx.startedAt);
    await next();
  });

  // API v1 routes
  app.route('/api/v1', health);
  app.route('/api/v1', contextPack);
  app.route('/api/v1', proposals);
  app.route('/api/v1', sessions);
  app.route('/api/v1', audit);
  app.route('/api/v1', drift);
  app.route('/api/v1', events);
  app.route('/api/v1', config);
  app.route('/api/v1', memory);

  // Serve static UI (dashboard)
  app.use('/*', serveStatic({ root: './packages/ui/dist' }));

  // Global error handler
  app.onError((err, c) => {
    console.error('Unhandled error:', err);
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Internal server error',
        },
      },
      500,
    );
  });

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: `Route not found: ${c.req.method} ${c.req.path}`,
        },
      },
      404,
    );
  });

  return app;
}
