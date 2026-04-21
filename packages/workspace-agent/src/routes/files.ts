import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { ok, fail } from "../utils/respond.js";
import {
  resolveWorkspacePath,
  isBlockedPath,
  isListingIgnored,
  MAX_READ_BYTES,
} from "../security/safePaths.js";

export const filesRouter = Router();

const WORKSPACE_ROOT = process.env.REPLBRIDGE_WORKSPACE_ROOT || process.cwd();
const SNAPSHOTS_DIR = path.join(WORKSPACE_ROOT, ".replbridge", "snapshots");
const TRASH_DIR = path.join(WORKSPACE_ROOT, ".replbridge", "trash");

// ─── POST /files/list ─────────────────────────────────────────────────────────

const ListSchema = z.object({
  path: z.string().default("."),
  depth: z.number().int().min(1).max(5).default(2),
});

filesRouter.post("/files/list", (req: Request, res: Response) => {
  const parsed = ListSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const { path: userPath, depth } = parsed.data;
  const resolved = resolveWorkspacePath(WORKSPACE_ROOT, userPath);

  if (!resolved) {
    fail(res, "PATH_TRAVERSAL", "Path escapes the workspace root.", 403);
    return;
  }

  if (isBlockedPath(path.relative(WORKSPACE_ROOT, resolved))) {
    fail(res, "BLOCKED_PATH", "This path is not accessible.", 403);
    return;
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    fail(res, "NOT_A_DIRECTORY", "Path is not a directory.");
    return;
  }

  const entries = walkDir(resolved, WORKSPACE_ROOT, depth);
  ok(res, { path: userPath, entries });
});

function walkDir(
  dir: string,
  workspaceRoot: string,
  depth: number,
  current = 0
): string[] {
  if (current >= depth) return [];

  const results: string[] = [];

  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const item of items) {
    if (isListingIgnored(item.name)) continue;

    const rel = path.relative(workspaceRoot, path.join(dir, item.name));

    if (item.isDirectory()) {
      results.push(rel + "/");
      results.push(...walkDir(path.join(dir, item.name), workspaceRoot, depth, current + 1));
    } else if (item.isFile()) {
      results.push(rel);
    }
  }

  return results;
}

// ─── POST /files/read ─────────────────────────────────────────────────────────

const ReadSchema = z.object({
  path: z.string(),
});

filesRouter.post("/files/read", (req: Request, res: Response) => {
  const parsed = ReadSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const resolved = resolveWorkspacePath(WORKSPACE_ROOT, parsed.data.path);

  if (!resolved) {
    fail(res, "PATH_TRAVERSAL", "Path escapes the workspace root.", 403);
    return;
  }

  const relPath = path.relative(WORKSPACE_ROOT, resolved);

  if (isBlockedPath(relPath)) {
    fail(res, "BLOCKED_PATH", "This file is not accessible.", 403);
    return;
  }

  if (!fs.existsSync(resolved)) {
    fail(res, "FILE_NOT_FOUND", `File not found: ${parsed.data.path}`, 404);
    return;
  }

  const stat = fs.statSync(resolved);

  if (!stat.isFile()) {
    fail(res, "NOT_A_FILE", "Path is not a file.");
    return;
  }

  if (stat.size > MAX_READ_BYTES) {
    fail(
      res,
      "FILE_TOO_LARGE",
      `File is ${Math.round(stat.size / 1024)}KB — max is 500KB.`
    );
    return;
  }

  const content = fs.readFileSync(resolved, "utf8");
  ok(res, { path: parsed.data.path, content });
});

// ─── POST /files/write ────────────────────────────────────────────────────────

const WriteSchema = z.object({
  path: z.string(),
  content: z.string(),
});

filesRouter.post("/files/write", (req: Request, res: Response) => {
  const parsed = WriteSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const { path: userPath, content } = parsed.data;
  const resolved = resolveWorkspacePath(WORKSPACE_ROOT, userPath);

  if (!resolved) {
    fail(res, "PATH_TRAVERSAL", "Path escapes the workspace root.", 403);
    return;
  }

  const relPath = path.relative(WORKSPACE_ROOT, resolved);

  if (isBlockedPath(relPath)) {
    fail(res, "BLOCKED_PATH", "This file is not writable.", 403);
    return;
  }

  let snapshotPath: string | null = null;
  const fileExists = fs.existsSync(resolved);

  // Create a snapshot before overwriting an existing file
  if (fileExists) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = relPath.replace(/\//g, "__");
    const snapshotFile = path.join(SNAPSHOTS_DIR, `${safeName}__${timestamp}`);
    fs.copyFileSync(resolved, snapshotFile);
    snapshotPath = path.relative(WORKSPACE_ROOT, snapshotFile);
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, "utf8");

  ok(res, {
    path: userPath,
    created: !fileExists,
    snapshot: snapshotPath,
  });
});

// ─── POST /files/delete-soft ──────────────────────────────────────────────────

const DeleteSchema = z.object({
  path: z.string(),
});

filesRouter.post("/files/delete-soft", (req: Request, res: Response) => {
  const parsed = DeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const resolved = resolveWorkspacePath(WORKSPACE_ROOT, parsed.data.path);

  if (!resolved) {
    fail(res, "PATH_TRAVERSAL", "Path escapes the workspace root.", 403);
    return;
  }

  const relPath = path.relative(WORKSPACE_ROOT, resolved);

  if (isBlockedPath(relPath)) {
    fail(res, "BLOCKED_PATH", "This file is not accessible.", 403);
    return;
  }

  if (!fs.existsSync(resolved)) {
    fail(res, "FILE_NOT_FOUND", `File not found: ${parsed.data.path}`, 404);
    return;
  }

  fs.mkdirSync(TRASH_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = relPath.replace(/\//g, "__");
  const trashFile = path.join(TRASH_DIR, `${safeName}__${timestamp}`);

  fs.renameSync(resolved, trashFile);

  ok(res, {
    originalPath: parsed.data.path,
    trashPath: path.relative(WORKSPACE_ROOT, trashFile),
  });
});
