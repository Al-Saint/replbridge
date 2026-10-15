import fs from "fs";
import path from "path";
import { AGENT_DIR, WORKSPACE_ROOT } from "../config.js";

/**
 * Paths that are ALWAYS blocked — hidden from listings AND denied on read/write.
 *
 * Teaching note: these patterns protect secrets and Replit internals from
 * being accidentally exposed to Claude or any other MCP client.
 */
const BLOCKED_NAMES: readonly string[] = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
  "node_modules",
  ".git",
  ".config",
  ".replit",
  "replit.nix",
  "repl.nix",
  ".cache",
  "secrets",
  ".replbridge",
  ".ssh",
  ".npmrc",
];

/**
 * Directories to exclude from file listings (too noisy or auto-generated).
 * Unlike BLOCKED_NAMES these can still be read directly (e.g. dist/index.js).
 */
const LISTING_IGNORES: readonly string[] = [
  ...BLOCKED_NAMES,
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
];

/** Maximum file size Claude is allowed to read (500 KB). */
export const MAX_READ_BYTES = 500 * 1024;

/** True if `p` is `root` itself or somewhere beneath it. */
function isInside(root: string, p: string): boolean {
  // Appending path.sep prevents the "/foo vs /foobar" sibling-prefix bug:
  // a bare startsWith(root) would accept "<root>bar/secret".
  return p === root || p.startsWith(root + path.sep);
}

/**
 * Resolve a user-supplied relative path against the workspace root and
 * verify it doesn't escape the root (path traversal attack prevention).
 *
 * Returns the resolved absolute path if safe, or null if the path is
 * outside the workspace root.
 *
 * Teaching note: Without this check, a path like "../../etc/passwd" would
 * resolve to /etc/passwd on the host. path.resolve() collapses all the ..
 * segments, then we check that the result still starts with our root.
 *
 * NOTE: This is a lexical check only. Routes that touch the filesystem use
 * resolveSafeRealPath() to also guard against symlink escapes.
 */
export function resolveWorkspacePath(
  workspaceRoot: string,
  userPath: string
): string | null {
  const resolved = path.resolve(workspaceRoot, userPath);
  return isInside(workspaceRoot, resolved) ? resolved : null;
}

/**
 * Resolve a user-supplied path AND follow any symlinks, then re-verify that
 * the fully-resolved real path is still inside the workspace root.
 *
 * This closes the gap where resolveWorkspacePath() alone would accept a path
 * like "link-to-etc/passwd" if "link-to-etc" is a symlink pointing outside
 * the workspace.
 *
 * Returns the real absolute path if safe, or null if:
 *   - the lexical path escapes the workspace, OR
 *   - the path (or any ancestor) is a symlink whose target escapes the workspace.
 *
 * If the path does not yet exist on disk (e.g. a write to a new file), we
 * realpath the nearest existing ancestor so symlinked parent directories are
 * still detected.
 */
export function resolveSafeRealPath(
  workspaceRoot: string,
  userPath: string
): string | null {
  const lexical = resolveWorkspacePath(workspaceRoot, userPath);
  if (lexical === null) return null;

  let rootReal: string;
  try {
    rootReal = fs.realpathSync(workspaceRoot);
  } catch {
    return null;
  }

  // Walk up from the target until we find an existing path we can realpath.
  let probe = lexical;
  let tail = "";
  for (;;) {
    let real: string;
    try {
      real = fs.realpathSync(probe);
    } catch (err) {
      // A dangling symlink: lstat succeeds but realpath fails. Refuse it
      // rather than writing "through" it to wherever it points.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT" || isSymlink(probe)) {
        return null;
      }
      const parent = path.dirname(probe);
      if (parent === probe) return null; // reached filesystem root
      tail = tail ? path.join(path.basename(probe), tail) : path.basename(probe);
      probe = parent;
      continue;
    }
    const full = tail ? path.join(real, tail) : real;
    return isInside(rootReal, full) ? full : null;
  }
}

function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Returns true if any segment of the (workspace-relative) path matches a
 * blocked name, or the path is inside the agent's own install folder.
 */
export function isBlockedPath(relPath: string): boolean {
  const abs = path.resolve(WORKSPACE_ROOT, relPath);
  if (AGENT_DIR !== WORKSPACE_ROOT && isInside(AGENT_DIR, abs)) return true;

  return relPath.split(path.sep).some(
    (segment) => BLOCKED_NAMES.includes(segment) || segment.startsWith(".env")
  );
}

/**
 * Returns true if a directory entry should be excluded from listings.
 */
export function isListingIgnored(name: string, absPath: string): boolean {
  if (LISTING_IGNORES.includes(name)) return true;
  if (name.startsWith(".env")) return true;
  if (AGENT_DIR !== WORKSPACE_ROOT && isInside(AGENT_DIR, absPath)) return true;
  return false;
}

export type AccessResult =
  | { ok: true; abs: string; rel: string }
  | { ok: false; code: "PATH_TRAVERSAL" | "BLOCKED_PATH"; message: string };

/**
 * One-stop check used by every file route: resolves the user path (following
 * symlinks), enforces the workspace jail, and applies the blocklist to both
 * the requested path and the real path it resolves to.
 */
export function checkAccess(userPath: string): AccessResult {
  const lexical = resolveWorkspacePath(WORKSPACE_ROOT, userPath);
  const real = resolveSafeRealPath(WORKSPACE_ROOT, userPath);
  if (!lexical || !real) {
    return { ok: false, code: "PATH_TRAVERSAL", message: "Path escapes the workspace root." };
  }

  const relLexical = path.relative(WORKSPACE_ROOT, lexical);
  const relReal = path.relative(WORKSPACE_ROOT, real);
  if (isBlockedPath(relLexical) || isBlockedPath(relReal)) {
    return { ok: false, code: "BLOCKED_PATH", message: "This path is not accessible." };
  }

  return { ok: true, abs: real, rel: relReal };
}
