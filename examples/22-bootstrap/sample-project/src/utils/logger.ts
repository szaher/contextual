// Structured logger using pino
// This is a placeholder file for the bootstrap example.

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
  },
});

export function createChildLogger(module: string) {
  return logger.child({ module });
}
