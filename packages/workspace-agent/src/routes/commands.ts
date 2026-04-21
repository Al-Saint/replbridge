import { Router, Request, Response } from "express";
import { z } from "zod";
import { ok, fail } from "../utils/respond.js";
import { isCommandAllowed, ALLOWED_COMMANDS } from "../security/safeCommands.js";
import { runCommand } from "../utils/shell.js";

export const commandsRouter = Router();

const WORKSPACE_ROOT = process.env.REPLBRIDGE_WORKSPACE_ROOT || process.cwd();

// ─── GET /commands/allowed ────────────────────────────────────────────────────

commandsRouter.get("/commands/allowed", (_req: Request, res: Response) => {
  ok(res, { commands: [...ALLOWED_COMMANDS] });
});

// ─── POST /commands/run ───────────────────────────────────────────────────────

const RunSchema = z.object({
  command: z.string().min(1),
});

commandsRouter.post("/commands/run", async (req: Request, res: Response) => {
  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, "INVALID_INPUT", parsed.error.issues[0].message);
    return;
  }

  const { command } = parsed.data;

  if (!isCommandAllowed(command)) {
    fail(
      res,
      "COMMAND_NOT_ALLOWED",
      `"${command}" is not on the allowlist. Use GET /commands/allowed to see permitted commands.`,
      403
    );
    return;
  }

  const result = await runCommand(command, WORKSPACE_ROOT);

  ok(res, {
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
  });
});
