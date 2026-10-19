import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { WORKSPACE_ROOT } from "../config.js";
import { ok, fail } from "../utils/respond.js";
import { checkAccess, isListingIgnored, MAX_READ_BYTES } from "../security/safePaths.js";
import { snapshotFile, timestampedName, TRASH_DIR } from "../utils/snapshots.js";

export const filesRouter = Router();

/** Max entries returned by /files/list so huge repos don't blow up the response. */
const MAX_LIST_ENTRIES = 2000;

/** A NUL byte in the first 8KB is a reliable "this is binary" signal. */
function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
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
  if (isBinary(buf)) {
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
    snapshotPath = snapshotFile(access.abs, access.rel);
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

// ─── POST /files/edit ─────────────────────────────────────────────────────────
// Exact find-and-replace inside one file. Much cheaper than rewriting a whole
// file, and safer: the edit fails unless old_text matches exactly.

const EditSchema = z.object({
  path: z.string().min(1),
  oldText: z.string().min(1, "oldText must not be empty"),
  newText: z.string(),
  replaceAll: z.boolean().default(false),
});

filesRouter.post("/files/edit", (req: Request, res: Response) => {
  const parsed = EditSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const { path: userPath, oldText, newText, replaceAll } = parsed.data;
  const access = checkAccess(userPath);
  if (!access.ok) {
    fail(res, access.code, access.message, 403);
    return;
  }
  if (!fs.existsSync(access.abs) || !fs.statSync(access.abs).isFile()) {
    fail(res, "FILE_NOT_FOUND", `File not found: ${userPath}`, 404);
    return;
  }
  if (fs.statSync(access.abs).size > MAX_READ_BYTES) {
    fail(res, "FILE_TOO_LARGE", `File is larger than ${MAX_READ_BYTES / 1024}KB.`);
    return;
  }

  const buf = fs.readFileSync(access.abs);
  if (isBinary(buf)) {
    fail(res, "BINARY_FILE", "File appears to be binary and can't be edited as text.");
    return;
  }
  const original = buf.toString("utf8");

  const occurrences = original.split(oldText).length - 1;
  if (occurrences === 0) {
    fail(
      res,
      "TEXT_NOT_FOUND",
      "oldText was not found in the file. Re-read the file and copy the text exactly, including whitespace."
    );
    return;
  }
  if (occurrences > 1 && !replaceAll) {
    fail(
      res,
      "AMBIGUOUS_MATCH",
      `oldText matches ${occurrences} places. Include more surrounding lines to make it unique, or set replaceAll.`
    );
    return;
  }

  const updated = replaceAll
    ? original.split(oldText).join(newText)
    : original.replace(oldText, () => newText);
  const snapshotPath = snapshotFile(access.abs, access.rel);
  fs.writeFileSync(access.abs, updated, "utf8");

  ok(res, {
    path: userPath,
    replacements: replaceAll ? occurrences : 1,
    snapshot: snapshotPath,
  });
});

// ─── POST /files/search ───────────────────────────────────────────────────────
// Search text files for a string or regular expression (like a safe grep).

const SearchSchema = z.object({
  query: z.string().min(1),
  path: z.string().default("."),
  regex: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  maxResults: z.number().int().min(1).max(500).default(100),
});

const MAX_SEARCH_FILES = 5000;

filesRouter.post("/files/search", (req: Request, res: Response) => {
  const parsed = SearchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const { query, path: userPath, regex, caseSensitive, maxResults } = parsed.data;
  const access = checkAccess(userPath);
  if (!access.ok) {
    fail(res, access.code, access.message, 403);
    return;
  }
  if (!fs.existsSync(access.abs)) {
    fail(res, "FILE_NOT_FOUND", `Path not found: ${userPath}`, 404);
    return;
  }

  let pattern: RegExp;
  try {
    const source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(source, caseSensitive ? "" : "i");
  } catch (err) {
    fail(res, "INVALID_INPUT", `Invalid regular expression: ${(err as Error).message}`);
    return;
  }

  // Collect candidate files (same visibility rules as list_files).
  const files: string[] = [];
  const collect = (dir: string) => {
    if (files.length >= MAX_SEARCH_FILES) return;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      const abs = path.join(dir, item.name);
      if (isListingIgnored(item.name, abs)) continue;
      if (item.isDirectory()) collect(abs);
      else if (item.isFile()) files.push(abs);
      if (files.length >= MAX_SEARCH_FILES) return;
    }
  };
  if (fs.statSync(access.abs).isDirectory()) collect(access.abs);
  else files.push(access.abs);

  const matches: { file: string; line: number; text: string }[] = [];
  let truncated = files.length >= MAX_SEARCH_FILES;
  outer: for (const file of files) {
    let buf: Buffer;
    try {
      if (fs.statSync(file).size > MAX_READ_BYTES) continue;
      buf = fs.readFileSync(file);
    } catch {
      continue;
    }
    if (isBinary(buf)) continue;
    const lines = buf.toString("utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        if (matches.length >= maxResults) {
          truncated = true;
          break outer;
        }
        matches.push({
          file: path.relative(WORKSPACE_ROOT, file),
          line: i + 1,
          text: lines[i].length > 300 ? lines[i].slice(0, 300) + "…" : lines[i],
        });
      }
    }
  }

  ok(res, { query, matches, filesSearched: files.length, truncated });
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
