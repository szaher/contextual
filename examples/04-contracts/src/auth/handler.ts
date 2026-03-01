import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { rateLimit } from "../middleware/rate-limit";
import { auditLog } from "../audit";

const BCRYPT_COST = 12;
const JWT_EXPIRY = "1h";
const REFRESH_EXPIRY = "7d";

/**
 * POST /auth/login
 * Authenticates a user with email and password.
 * Rate-limited to 5 attempts per minute per IP.
 */
export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await findUserByEmail(email);
  if (!user) {
    await auditLog("login_failed", { email, reason: "user_not_found" });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await auditLog("login_failed", { email, reason: "bad_password" });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: JWT_EXPIRY }
  );

  await auditLog("login_success", { userId: user.id });
  return res.json({ token, expiresIn: JWT_EXPIRY });
}

/**
 * POST /auth/register
 * Creates a new user account with bcrypt-hashed password.
 */
export async function registerHandler(req: Request, res: Response) {
  const { email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const user = await createUser({ email, passwordHash });
  await auditLog("user_registered", { userId: user.id });

  return res.status(201).json({ id: user.id, email: user.email });
}

// Stub functions for the example
async function findUserByEmail(email: string): Promise<any> {
  return null;
}

async function createUser(data: any): Promise<any> {
  return { id: "usr_1", email: data.email };
}
