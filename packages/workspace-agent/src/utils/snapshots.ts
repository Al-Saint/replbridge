import fs from "fs";
import path from "path";
import { WORKSPACE_ROOT } from "../config.js";

export const SNAPSHOTS_DIR = path.join(WORKSPACE_ROOT, ".replbridge", "snapshots");
export const TRASH_DIR = path.join(WORKSPACE_ROOT, ".replbridge", "trash");

/** Timestamp plus the optional "-N" collision counter. */
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-\d+)?$/;

/** "src/a/b.ts" → "src__a__b.ts" */
export function encodePath(relPath: string): string {
  return relPath.split(path.sep).join("__");
}

/** "src/a/b.ts" → "src__a__b.ts__2026-01-01T00-00-00-000Z" */
export function timestampedName(relPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${encodePath(relPath)}__${timestamp}`;
}

/** Copy a file's current contents into the snapshots folder. Returns the workspace-relative snapshot path. */
export function snapshotFile(absPath: string, relPath: string): string {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  let name = timestampedName(relPath);
  // Two writes in the same millisecond would collide; add a counter.
  for (let i = 1; fs.existsSync(path.join(SNAPSHOTS_DIR, name)); i++) {
    name = `${timestampedName(relPath)}-${i}`;
  }
  const dest = path.join(SNAPSHOTS_DIR, name);
  fs.copyFileSync(absPath, dest);
  return path.relative(WORKSPACE_ROOT, dest);
}

export interface SnapshotInfo {
  snapshot: string;
  createdAt: string;
  bytes: number;
}

/** "2026-01-01T00-00-00-000Z" → "2026-01-01T00:00:00.000Z" */
function parseTimestamp(raw: string): string | null {
  const m = TIMESTAMP_RE.exec(raw);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null;
}

/**
 * List snapshots, newest first. With `relPath`, only snapshots of that file.
 * Snapshot ids are plain file names inside .replbridge/snapshots.
 */
export function listSnapshots(relPath?: string, limit = 50): SnapshotInfo[] {
  let names: string[];
  try {
    names = fs.readdirSync(SNAPSHOTS_DIR);
  } catch {
    return [];
  }

  const prefix = relPath ? `${encodePath(relPath)}__` : null;
  const out: SnapshotInfo[] = [];
  for (const name of names) {
    if (prefix && !name.startsWith(prefix)) continue;
    const rest = prefix ? name.slice(prefix.length) : name.slice(name.lastIndexOf("__") + 2);
    const createdAt = parseTimestamp(rest);
    if (!createdAt) continue;
    const stat = fs.statSync(path.join(SNAPSHOTS_DIR, name));
    out.push({ snapshot: name, createdAt, bytes: stat.size });
  }

  return out
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.snapshot.localeCompare(a.snapshot))
    .slice(0, limit);
}

/** Resolve a snapshot id to its absolute path, or null if the id is invalid or missing. */
export function resolveSnapshot(id: string): string | null {
  if (!id || id !== path.basename(id) || id.startsWith(".")) return null;
  const abs = path.join(SNAPSHOTS_DIR, id);
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}
