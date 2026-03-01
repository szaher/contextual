import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "crypto";
import { logger } from "../logger";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthPayload {
  sub: string;
  email: string;
  role: "admin" | "member" | "viewer";
  iat: number;
  exp: number;
}

/**
 * JWT authentication middleware.
 * Validates the Bearer token from the Authorization header.
 * Attaches the decoded payload to req.user.
 *
 * Skips authentication for:
 * - GET /health
 * - POST /api/auth/login
 * - POST /api/auth/register
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip auth for public endpoints
  const publicPaths = ["/api/auth/login", "/api/auth/register"];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    logger.warn("Missing auth token", { path: req.path, ip: req.ip });
    res.status(401).json({
      data: null,
      error: { code: "AUTH_REQUIRED", message: "Authentication required" },
    });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as any).user = payload;
    next();
  } catch (err) {
    logger.warn("Invalid auth token", { path: req.path, error: (err as Error).message });
    res.status(401).json({
      data: null,
      error: { code: "AUTH_INVALID", message: "Invalid or expired token" },
    });
  }
}
