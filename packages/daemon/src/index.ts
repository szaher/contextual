import { serve } from '@hono/node-server';
import { createApp } from './server.js';
import { openDatabase, defaultDbPath } from './store/db.js';
import { startRetentionScheduler } from './scheduler/retention.js';

const PORT = 3742;
const HOST = '127.0.0.1';

export async function startDaemon(dbPath?: string): Promise<void> {
  const db = openDatabase(dbPath ?? defaultDbPath());
  const stopRetention = startRetentionScheduler(db);
  const startedAt = new Date();

  const app = createApp({ db, startedAt });

  const server = serve({
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  });

  console.log(`ctxl daemon listening on http://${HOST}:${PORT}`);

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down daemon...');
    stopRetention();
    db.close();
    if (server) {
      server.close();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.ts');
if (isMain) {
  startDaemon().catch((err) => {
    console.error('Failed to start daemon:', err);
    process.exit(1);
  });
}
