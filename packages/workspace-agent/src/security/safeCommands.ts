/**
 * The ONLY commands Claude is allowed to run.
 *
 * Teaching note: This is an ALLOWLIST — only exactly these strings are
 * permitted. This is intentionally strict. An attacker (or a confused AI)
 * cannot run arbitrary shell commands by finding a gap in a blocklist.
 *
 * To add a command, it must be added here explicitly and reviewed.
 */
export const ALLOWED_COMMANDS: readonly string[] = [
  // Node / npm
  "npm install",
  "npm run build",
  "npm run test",
  "npm run lint",
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
  "git log --oneline -5",
  "git log --oneline -10",
  "git branch",
];

/**
 * Check whether a command is on the allowlist.
 * Matching is exact — no wildcards, no prefix matching.
 */
export function isCommandAllowed(command: string): boolean {
  const normalized = command.trim();
  return ALLOWED_COMMANDS.includes(normalized);
}
