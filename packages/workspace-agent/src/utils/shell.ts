import { spawn } from "child_process";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Run a command safely using child_process.spawn.
 *
 * Teaching note: We use `spawn` instead of `exec` because `exec` passes the
 * command to /bin/sh, which means a malicious command like:
 *   npm install; rm -rf /
 * could chain shell commands. `spawn` runs the binary DIRECTLY with its args
 * as an array — no shell interpretation, no chaining possible.
 *
 * We split the command string into [binary, ...args] before passing to spawn.
 */
export function runCommand(command: string, cwd: string): Promise<ShellResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const parts = command.trim().split(/\s+/);
    const [bin, ...args] = parts;

    const proc = spawn(bin, args, {
      cwd,
      env: { ...process.env },
      shell: false, // never use shell — this is intentional
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
        durationMs: Date.now() - start,
      });
    });

    proc.on("error", (err) => {
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        durationMs: Date.now() - start,
      });
    });
  });
}
