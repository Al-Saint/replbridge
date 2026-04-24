import fs from "fs";
import path from "path";

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
    "repl.nix",
    ".cache",
    "secrets",
    ".replbridge",
  ];

/**
 * Directories to exclude from file listings (too noisy or auto-generated).
 * These are also blocked from read/write.
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
 * NOTE: This is a lexical check only. For operations that touch the
 * filesystem, prefer resolveSafeRealPath() to also guard against symlink
 * escapes (e.g. a symlink inside the workspace that points to /etc).
 */
export function resolveWorkspacePath(
    workspaceRoot: string,
    userPath: string
  ): string | null {
    const resolved = path.resolve(workspaceRoot, userPath);

  // Must stay inside workspace root
  if (!resolved.startsWith(workspaceRoot + path.sep) && resolved !== workspaceRoot) {
        return null;
  }

  return resolved;
}

/**
 * Resolve a user-supplied path AND follow any symlinks, then re-verify that
 * the fully-resolved real path is still inside the workspace root.
 *
 * This closes a TOCTOU-style gap where resolveWorkspacePath() alone would
 * accept a path like "link-to-etc/passwd" if "link-to-etc" is a symlink
 * pointing outside the workspace.
 *
 * Returns the real absolute path if safe, or null if:
 *   - the lexical path escapes the workspace, OR
 *   - the path (or any ancestor) is a symlink whose target escapes the workspace.
 *
 * If the path does not yet exist on disk (e.g. a write to a new file), we
 * fall back to realpath-ing the nearest existing ancestor so that symlinked
 * parent directories are still detected.
 */
export function resolveSafeRealPath(
    workspaceRoot: string,
    userPath: string
  ): string | null {
    const lexical = resolveWorkspacePath(workspaceRoot, userPath);
    if (lexical === null) return null;

  // Realpath the workspace root once so we compare apples to apples on
  // systems where the root itself is reached via a symlink.
  let rootReal: string;
    try {
          rootReal = fs.realpathSync(workspaceRoot);
    } catch {
          return null;
    }

  // Walk up from the target until we find an existing path we can realpath.
  let probe = lexical;
    let tail = "";
    // eslint-disable-next-line no-constant-condition
  while (true) {
        try {
                const real = fs.realpathSync(probe);
                const full = tail ? path.join(real, tail) : real;
                if (full !== rootReal && !full.startsWith(rootReal + path.sep)) {
                          return null;
                }
                return full;
        } catch {
                const parent = path.dirname(probe);
                if (parent === probe) return null; // reached filesystem root
          tail = tail ? path.join(path.basename(probe), tail) : path.basename(probe);
                probe = parent;
        }
  }
}

/**
 * Returns true if any segment of the path matches a blocked name.
 */
export function isBlockedPath(filePath: string): boolean {
    const segments = filePath.split(path.sep);

  return segments.some((segment) => {
        // Exact match
                           if (BLOCKED_NAMES.includes(segment)) return true;
        // .env.* pattern
                           if (segment.startsWith(".env")) return true;
        return false;
  });
}

/**
 * Returns true if a path segment should be excluded from listings.
 */
export function isListingIgnored(name: string): boolean {
    if (LISTING_IGNORES.includes(name)) return true;
    if (name.startsWith(".env")) return true;
    return false;
}
