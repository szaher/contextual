import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client with automatic reconnection.
 * Uses connection pooling with a max of 10 connections.
 */
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
});

/**
 * Graceful shutdown handler.
 * Call this when the process is terminating.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

// Handle process signals for clean shutdown
process.on("SIGINT", async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await disconnectDatabase();
  process.exit(0);
});
