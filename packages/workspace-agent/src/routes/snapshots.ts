import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { ok, fail } from "../utils/respond.js";
import { checkAccess } from "../security/safePaths.js";
import { encodePath, listSnapshots, resolveSnapshot, snapshotFile } from "../utils/snapshots.js";

export const snapshotsRouter = Router();

// ─── POST /snapshots/list ─────────────────────────────────────────────────────

const ListSchema = z.object({
  path: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

snapshotsRouter.post("/snapshots/list", (req: Request, res: Response) => {
  const parsed = ListSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  let rel: string | undefined;
  if (parsed.data.path) {
    const access = checkAccess(parsed.data.path);
    if (!access.ok) {
      fail(res, access.code, access.message, 403);
      return;
    }
    rel = access.rel;
  }

  ok(res, {
    path: parsed.data.path ?? null,
    snapshots: listSnapshots(rel, parsed.data.limit),
  });
});

// ─── POST /snapshots/restore ──────────────────────────────────────────────────
// Restores a file from one of its snapshots. The current version is itself
// snapshotted first, so a restore can always be undone.

const RestoreSchema = z.object({
  path: z.string().min(1),
  snapshot: z.string().min(1),
});

snapshotsRouter.post("/snapshots/restore", (req: Request, res: Response) => {
  const parsed = RestoreSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const access = checkAccess(parsed.data.path);
  if (!access.ok) {
    fail(res, access.code, access.message, 403);
    return;
  }

  const snapshotAbs = resolveSnapshot(parsed.data.snapshot);
  if (!snapshotAbs) {
    fail(
      res,
      "SNAPSHOT_NOT_FOUND",
      `Snapshot not found: ${parsed.data.snapshot}. Use list_snapshots to see available ones.`,
      404
    );
    return;
  }
  // Only allow restoring a snapshot onto the file it was taken from.
  if (!parsed.data.snapshot.startsWith(`${encodePath(access.rel)}__`)) {
    fail(
      res,
      "SNAPSHOT_MISMATCH",
      `Snapshot ${parsed.data.snapshot} does not belong to ${parsed.data.path}.`
    );
    return;
  }

  let backup: string | null = null;
  if (fs.existsSync(access.abs)) {
    if (!fs.statSync(access.abs).isFile()) {
      fail(res, "NOT_A_FILE", "Path exists and is not a file.");
      return;
    }
    backup = snapshotFile(access.abs, access.rel);
  }

  fs.mkdirSync(path.dirname(access.abs), { recursive: true });
  fs.copyFileSync(snapshotAbs, access.abs);

  ok(res, {
    path: parsed.data.path,
    restoredFrom: parsed.data.snapshot,
    previousVersionSnapshot: backup,
  });
});
