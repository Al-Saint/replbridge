import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { fail } from "../utils/respond.js";

/**
 * Bearer token authentication middleware.
 *
 * Reads REPLBRIDGE_PROJECT_TOKEN from the environment at startup.
 * Every protected route must pass Authorization: Bearer <token>.
 *
 * Teaching note: We use a constant-time comparison to prevent timing attacks.
 * A naive string comparison (a === b) can leak information about how many
 * characters matched — an attacker can measure response time to brute-force
 * the token one character at a time. timingSafeEqual prevents this.
 */

const PROJECT_TOKEN = process.env.REPLBRIDGE_PROJECT_TOKEN;

if (!PROJECT_TOKEN) {
  process.stderr.write(
    "[ReplBridge] FATAL: REPLBRIDGE_PROJECT_TOKEN is not set. Exiting.\n"
  );
  process.exit(1);
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    fail(res, "UNAUTHORIZED", "Missing or malformed Authorization header.", 401);
    return;
  }

  const token = authHeader.slice("Bearer ".length);

  // Constant-time comparison to prevent timing attacks
  let isValid = false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(PROJECT_TOKEN!);
    isValid = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    isValid = false;
  }

  if (!isValid) {
    fail(res, "UNAUTHORIZED", "Invalid token.", 401);
    return;
  }

  next();
}
