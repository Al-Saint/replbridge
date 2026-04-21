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
