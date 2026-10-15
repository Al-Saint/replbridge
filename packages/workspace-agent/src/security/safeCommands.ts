/**
 * The ONLY commands Claude is allowed to run.
 *
 * Teaching note: This is an ALLOWLIST — only exactly these strings are
 * permitted. This is intentionally strict. An attacker (or a confused AI)
 * cannot run arbitrary shell commands by finding a gap in a blocklist.
 *
 * To add a command, add it here explicitly and review it — or, per project,
 * set REPLBRIDGE_EXTRA_COMMANDS (comma-separated exact strings) in Replit
 * Secrets, e.g. "npx tsc --noEmit,npm run typecheck".
 */
const BUILTIN_COMMANDS: readonly string[] = [
  // Node / npm
  "npm install",
  "npm ci",
  "npm test",
  "npm run build",
  "npm run test",
  "npm run lint",
  "npm run typecheck",
  "npm run dev",
  "npm run start",
  // Python
  "python -m pytest",
  "python main.py",
  "python app.py",
  "pip install -r requirements.txt",
  // Git (read-only operations only)
  "git status",
  "git diff",
  "git diff --staged",
  "git log --oneline -5",
  "git log --oneline -10",
  "git log --oneline -20",
  "git branch",
];

/** Whitespace-normalize so "npm  test" and "npm test" compare equal. */
function normalize(command: string): string {
  return command.trim().split(/\s+/).join(" ");
}

const extraCommands = (process.env.REPLBRIDGE_EXTRA_COMMANDS ?? "")
  .split(",")
  .map(normalize)
  .filter(Boolean);

export const ALLOWED_COMMANDS: readonly string[] = [
  ...new Set([...BUILTIN_COMMANDS, ...extraCommands]),
];

/**
 * Check whether a command is on the allowlist.
 * Matching is exact (after whitespace normalization) — no wildcards, no
 * prefix matching.
 */
export function isCommandAllowed(command: string): boolean {
  return ALLOWED_COMMANDS.includes(normalize(command));
}
