import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authMiddleware } from "./auth/middleware";
import { registerApiRoutes } from "./api/routes";
import { prisma } from "./db/client";
import { logger } from "./logger";

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json({ limit: "10kb" }));

// Health check (no auth)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth middleware for API routes
app.use("/api", authMiddleware);

// API routes
registerApiRoutes(app);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({
    data: null,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
});

// Graceful shutdown
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info(`TaskFlow server running on port ${PORT}`);
});

async function shutdown() {
  logger.info("Shutting down gracefully...");
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
