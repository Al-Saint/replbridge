import { Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { PROJECT_TOKEN } from "../config.js";
import { fail } from "../utils/respond.js";

/**
 * Bearer token authentication middleware.
 *
 * Every protected route must pass Authorization: Bearer <token>.
 *
 * Teaching note: We use a constant-time comparison to prevent timing attacks.
 * A naive string comparison (a === b) can leak information about how many
 * characters matched — an attacker can measure response time to brute-force
 * the token one character at a time. timingSafeEqual prevents this. We hash
 * both sides first so the buffers are always the same length and the token's
 * length isn't leaked either.
 */

const expectedDigest = createHash("sha256").update(PROJECT_TOKEN).digest();

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

  const token = authHeader.slice("Bearer ".length).trim();
  const actualDigest = createHash("sha256").update(token).digest();

  if (!timingSafeEqual(actualDigest, expectedDigest)) {
    fail(res, "UNAUTHORIZED", "Invalid token.", 401);
    return;
  }

  next();
}
