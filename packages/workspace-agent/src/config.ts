import fs from "fs";
import path from "path";

/**
 * Central runtime configuration for the Workspace Agent.
 *
 * Teaching note: this module is imported FIRST by index.ts so that the .env
 * file (local development only — on Replit use Secrets) is loaded before any
 * other module reads process.env.
 */

// Load a local .env if present. Node ≥20.12 ships process.loadEnvFile, so we
// don't need the dotenv package. Existing env vars (e.g. Replit Secrets) win.
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function fatal(message: string): never {
  process.stderr.write(`[ReplBridge] FATAL: ${message}\n`);
  process.exit(1);
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ─── Token ──────────────────────────────────────────────────────────────────
const token = process.env.REPLBRIDGE_PROJECT_TOKEN?.trim();
if (!token) {
  fatal("REPLBRIDGE_PROJECT_TOKEN is not set. Exiting.");
}
if (token.length < 16) {
  fatal("REPLBRIDGE_PROJECT_TOKEN must be at least 16 characters.");
}
export const PROJECT_TOKEN: string = token;

// ─── Workspace root ─────────────────────────────────────────────────────────
// Resolve symlinks once at startup so every containment check compares real
// paths (e.g. /tmp → /private/tmp on macOS).
const rootInput = process.env.REPLBRIDGE_WORKSPACE_ROOT || process.cwd();
let rootReal: string;
try {
  rootReal = fs.realpathSync(path.resolve(rootInput));
} catch {
  fatal(`REPLBRIDGE_WORKSPACE_ROOT does not exist: ${rootInput}`);
}
if (!fs.statSync(rootReal).isDirectory()) {
  fatal(`REPLBRIDGE_WORKSPACE_ROOT is not a directory: ${rootInput}`);
}
export const WORKSPACE_ROOT: string = rootReal;

// ─── Agent install directory ────────────────────────────────────────────────
// The agent's own source lives in <package>/src or <package>/dist. If it is
// installed inside the workspace, we block it so Claude can't edit the agent's
// allowlist or blocklist and have it take effect on the next restart.
export const AGENT_DIR: string = fs.realpathSync(path.resolve(__dirname, ".."));

// ─── Network ────────────────────────────────────────────────────────────────
export const PORT = positiveInt(process.env.PORT, 3000);
// 0.0.0.0 so Replit's proxy (and other hosts) can reach the agent.
export const HOST = process.env.HOST || "0.0.0.0";

// ─── Commands ───────────────────────────────────────────────────────────────
/** Commands are killed after this long (default 2 minutes). */
export const COMMAND_TIMEOUT_MS = positiveInt(process.env.REPLBRIDGE_COMMAND_TIMEOUT_MS, 120_000);

/** Max bytes of stdout / stderr returned per command (default 200 KB each). */
export const MAX_OUTPUT_BYTES = 200 * 1024;
