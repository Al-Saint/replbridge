import { spawn } from "child_process";
import { COMMAND_TIMEOUT_MS, MAX_OUTPUT_BYTES } from "../config.js";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

/** Env vars that must never reach commands Claude runs. */
const SCRUBBED_ENV = ["REPLBRIDGE_PROJECT_TOKEN"];

/**
 * Run a command safely using child_process.spawn.
 *
 * Teaching note: We use `spawn` instead of `exec` because `exec` passes the
 * command to /bin/sh, which means a malicious command like:
 *   npm install; rm -rf /
 * could chain shell commands. `spawn` runs the binary DIRECTLY with its args
 * as an array — no shell interpretation, no chaining possible.
 *
 * Long-running commands (e.g. `npm run dev`) are killed after
 * COMMAND_TIMEOUT_MS so a request can never hang forever. The process runs in
 * its own process group so the kill also reaches grandchildren (npm → node).
 */
export function runCommand(
  command: string,
  cwd: string,
  timeoutMs = COMMAND_TIMEOUT_MS
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const [bin, ...args] = command.trim().split(/\s+/);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CI: "true",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    };
    for (const key of SCRUBBED_ENV) delete env[key];

    const proc = spawn(bin, args, {
      cwd,
      env,
      shell: false, // never use shell — this is intentional
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;

    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= MAX_OUTPUT_BYTES) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString();
      if (next.length > MAX_OUTPUT_BYTES) {
        truncated = true;
        return next.slice(0, MAX_OUTPUT_BYTES);
      }
      return next;
    };

    proc.stdout.on("data", (chunk: Buffer) => (stdout = append(stdout, chunk)));
    proc.stderr.on("data", (chunk: Buffer) => (stderr = append(stderr, chunk)));

    const kill = () => {
      try {
        if (proc.pid && process.platform !== "win32") process.kill(-proc.pid, "SIGKILL");
        else proc.kill("SIGKILL");
      } catch {
        /* already exited */
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);

    let settled = false;
    const finish = (exitCode: number, extraStderr = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) {
        extraStderr += `\n[ReplBridge] Command killed after ${timeoutMs}ms timeout.`;
      }
      resolve({
        stdout: stdout.trim(),
        stderr: (stderr + extraStderr).trim(),
        exitCode,
        durationMs: Date.now() - start,
        timedOut,
        truncated,
      });
    };

    proc.on("close", (code, signal) => finish(code ?? (signal ? 137 : 1)));
    proc.on("error", (err) => finish(127, err.message));
  });
}
