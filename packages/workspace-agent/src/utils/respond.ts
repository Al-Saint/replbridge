import { Response } from "express";

/**
 * Standard success response.
 * Shape: { ok: true, data: T }
 */
export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data });
}

/**
 * Standard error response.
 * Shape: { ok: false, error: { code, message } }
 */
export function fail(
  res: Response,
  code: string,
  message: string,
  status = 400
): void {
  res.status(status).json({ ok: false, error: { code, message } });
}
