import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { WORKSPACE_ROOT } from "../config.js";
import { ok, fail } from "../utils/respond.js";
import { checkAccess, isListingIgnored, MAX_READ_BYTES } from "../security/safePaths.js";

export const filesRouter = Router();

const SNAPSHOTS_DIR = path.join(WORKSPACE_ROOT, ".replbridge", "snapshots");
const TRASH_DIR = path.join(WORKSPACE_ROOT, ".replbridge", "trash");

/** Max entries returned by /files/list so huge repos don't blow up the response. */
const MAX_LIST_ENTRIES = 2000;

/** "src/a/b.ts" → "src__a__b.ts__2026-01-01T00-00-00-000Z" */
function timestampedName(relPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${relPath.split(path.sep).join("__")}__${timestamp}`;
}

// ─── POST /files/list ─────────────────────────────────────────────────────────

const ListSchema = z.object({
  path: z.string().default("."),
  depth: z.number().int().min(1).max(5).default(2),
});

filesRouter.post("/files/list", (req: Request, res: Response) => {
  const parsed = ListSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const { path: userPath, depth } = parsed.data;
  const access = checkAccess(userPath);
  if (!access.ok) {
    fail(res, access.code, access.message, 403);
    return;
  }

  if (!fs.existsSync(access.abs) || !fs.statSync(access.abs).isDirectory()) {
    fail(res, "NOT_A_DIRECTORY", `Not a directory: ${userPath}`);
    return;
  }

  const entries: string[] = [];
  const truncated = walkDir(access.abs, depth, 0, entries);
  ok(res, { path: userPath, entries, truncated });
});

/** Returns true if the listing was truncated at MAX_LIST_ENTRIES. */
function walkDir(dir: string, depth: number, current: number, out: string[]): boolean {
  if (current >= depth) return false;

  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  items.sort((a, b) => a.name.localeCompare(b.name));

  for (const item of items) {
    const abs = path.join(dir, item.name);
    if (isListingIgnored(item.name, abs)) continue;
    if (out.length >= MAX_LIST_ENTRIES) return true;

    const rel = path.relative(WORKSPACE_ROOT, abs);

    // Symlinked directories are listed but not descended into.
    if (item.isDirectory()) {
      out.push(rel + "/");
      if (walkDir(abs, depth, current + 1, out)) return true;
    } else if (item.isFile() || item.isSymbolicLink()) {
      out.push(rel);
    }
  }

  return false;
}

// ─── POST /files/read ─────────────────────────────────────────────────────────

const ReadSchema = z.object({
  path: z.string().min(1),
});

filesRouter.post("/files/read", (req: Request, res: Response) => {
  const parsed = ReadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const access = checkAccess(parsed.data.path);
  if (!access.ok) {
    fail(res, access.code, access.message, 403);
    return;
  }

  if (!fs.existsSync(access.abs)) {
    fail(res, "FILE_NOT_FOUND", `File not found: ${parsed.data.path}`, 404);
    return;
  }

  const stat = fs.statSync(access.abs);

  if (!stat.isFile()) {
    fail(res, "NOT_A_FILE", "Path is not a file.");
    return;
  }

  if (stat.size > MAX_READ_BYTES) {
    fail(
      res,
      "FILE_TOO_LARGE",
      `File is ${Math.round(stat.size / 1024)}KB — max is ${MAX_READ_BYTES / 1024}KB.`
    );
    return;
  }

  const buf = fs.readFileSync(access.abs);
  // A NUL byte in the first 8KB is a reliable "this is binary" signal.
  if (buf.subarray(0, 8192).includes(0)) {
    fail(res, "BINARY_FILE", "File appears to be binary and can't be returned as text.");
    return;
  }

  ok(res, { path: parsed.data.path, content: buf.toString("utf8") });
});

// ─── POST /files/write ────────────────────────────────────────────────────────

const WriteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

filesRouter.post("/files/write", (req: Request, res: Response) => {
  const parsed = WriteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const { path: userPath, content } = parsed.data;
  const access = checkAccess(userPath);
  if (!access.ok) {
    fail(res, access.code, access.message, 403);
    return;
  }
  if (access.abs === WORKSPACE_ROOT) {
    fail(res, "NOT_A_FILE", "Path is the workspace root, not a file.");
    return;
  }

  let snapshotPath: string | null = null;
  const fileExists = fs.existsSync(access.abs);

  if (fileExists && !fs.statSync(access.abs).isFile()) {
    fail(res, "NOT_A_FILE", "Path exists and is not a file.");
    return;
  }

  // Create a snapshot before overwriting an existing file
  if (fileExists) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    const snapshotFile = path.join(SNAPSHOTS_DIR, timestampedName(access.rel));
    fs.copyFileSync(access.abs, snapshotFile);
    snapshotPath = path.relative(WORKSPACE_ROOT, snapshotFile);
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(access.abs), { recursive: true });
  fs.writeFileSync(access.abs, content, "utf8");

  ok(res, {
    path: userPath,
    created: !fileExists,
    bytes: Buffer.byteLength(content, "utf8"),
    snapshot: snapshotPath,
  });
});

// ─── POST /files/delete-soft ──────────────────────────────────────────────────

const DeleteSchema = z.object({
  path: z.string().min(1),
});

filesRouter.post("/files/delete-soft", (req: Request, res: Response) => {
  const parsed = DeleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const access = checkAccess(parsed.data.path);
  if (!access.ok) {
    fail(res, access.code, access.message, 403);
    return;
  }
  if (access.abs === WORKSPACE_ROOT) {
    fail(res, "BLOCKED_PATH", "Refusing to trash the workspace root.", 403);
    return;
  }

  if (!fs.existsSync(access.abs)) {
    fail(res, "FILE_NOT_FOUND", `File not found: ${parsed.data.path}`, 404);
    return;
  }

  fs.mkdirSync(TRASH_DIR, { recursive: true });
  const trashFile = path.join(TRASH_DIR, timestampedName(access.rel));

  fs.renameSync(access.abs, trashFile);

  ok(res, {
    originalPath: parsed.data.path,
    trashPath: path.relative(WORKSPACE_ROOT, trashFile),
  });
});
